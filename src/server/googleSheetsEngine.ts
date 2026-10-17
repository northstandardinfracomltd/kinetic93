import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type SheetTabType =
  | 'defibrillateurs'
  | 'autresMateriels'
  | 'clients'
  | 'tournees'
  | 'missionsTournees'
  | 'rapportsPdf'
  | 'crm'
  | 'satisfaction'
  | 'commandes'
  | 'stocks'
  | 'achatsFournisseurs'
  | 'temps'
  | 'ticketsCaisse'
  | 'releveConcurrentiel'
  | 'formations'
  | 'stagiaires'
  | 'emargements'
  | 'messagesInternes'
  | 'variables'
  | 'ged'
  | 'reglages'
  | 'intituleEmplacements'
  | 'membresEnvironnement'
  | 'apparenceRapportsPdf'
  | 'communicationPortailClient'
  | 'observateurActionsSuspectes';

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

export interface SheetCollectionStats {
  totalCount: number;
  totalMainOui: number;
  totalMainNon: number;
  conformeEtAJourCount: number;
  eligibleMainOuiCount: number;
  compliancePercent: number;
  distinctModels: string[];
  distinctCoffrets: string[];
  distinctElectrodes: string[];
  distinctBatteries: string[];
}

export interface SheetQueryFilterParams {
  search?: string;
  advancedSearchTerms?: string[];
  advancedSearchOperator?: 'OR' | 'AND';
  region?: string;
  modeleId?: string;
  modeleAliases?: string[];
  clientId?: string;
  clientMatchTerms?: string[];
  categorie?: string;
  contrat?: string;
  maintenanceFilter?: 'all' | 'oui' | 'non';
  selectedDepartment?: string | null;
  actionExpired?: boolean;
  actionUnder3?: boolean;
  action3To6?: boolean;
  sortFilter?: 'recent' | 'closest_maintenance' | null;
  offset?: number;
  limit?: number;
}

interface CachedSheetResult {
  headers: string[];
  items: any[];
  stats: SheetCollectionStats;
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

function getDiskSnapshotPath(cacheKey: string): string {
  const safeKey = cacheKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(getMirrorDir(), `snapshot_${safeKey}.json`);
}

function loadDiskSnapshot(cacheKey: string): CachedSheetResult | null {
  try {
    const p = getDiskSnapshotPath(cacheKey);
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
        return parsed as CachedSheetResult;
      }
    }
  } catch (_) {}
  return null;
}

function saveDiskSnapshotAsync(cacheKey: string, snapshot: CachedSheetResult): void {
  setImmediate(() => {
    try {
      if (!snapshot || !Array.isArray(snapshot.items) || snapshot.items.length === 0) return;
      const p = getDiskSnapshotPath(cacheKey);
      fs.writeFileSync(p, JSON.stringify(snapshot), 'utf-8');
    } catch (_) {}
  });
}

function getGlobalConfigPaths(): string[] {
  return [
    path.join(process.cwd(), '.data', 'collections', 'global_google_sheets_config.json'),
    path.join(process.cwd(), 'data', 'collections', 'global_google_sheets_config.json'),
  ];
}

const DEFAULT_GOOGLE_API_KEY = 'AIzaSyBEUUSg6itOAUue7IAKUB1pI_udx1XEW0w';

const DEFAULT_SERVICE_ACCOUNT_JSON = JSON.stringify({
  type: 'service_account',
  project_id: 'gen-lang-client-0441699702',
  private_key_id: 'cad3f3b7a5e751bf3625428346dd9f0a085772e8',
  private_key:
    '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDfDpShF+3NSKN9\ngj9hn5QXGQOz4Umu6uCDZbAZ68PMGBJpCzVqymVEX5HpsUuNlu/GzST1coJrAM9h\nG/kO74FkZUlYvklHiwoHLJtc1xfDbg131aM6j1lmWsWBJ5as6VMEq52NTrmY1mbz\nh9E1m/EYRQi0OjFleGUDzaWshhZgaq1V5Gft+vmdJ+TzrY3e1vhpIqx3JSD8rplq\n1sgasNe6qRT87CtRTYairQpGa1WoFKLCdrjtBJ0ckLsS55TlCdsD3Ij6xOibSnld\n+2GT9VZdcfyO/Rivot4vOBFttMuvEXmSTfhj84LkWU1/J+rj3wL+8QaejRSAiyBc\n/a3nBE4RAgMBAAECggEAD7XvMgmFblgXa9eory+WNqpEYH8VuYRBm/+lj63TdKSd\nZ1iqwoLO7ynsFRGvyKFA8jewyrjuBqtf7+8Qc8Ta0D9yExYUAz3/ztGNf9SGj/VI\nbZBWluFR4quyDY7ERhmJB2MvDazl1aYESlLeoXACYzs5ibgvkn4QX1w0txoaqV+4\neOE1fhlv4M1GF3baLYx8GRP7C1jm2kbc8HhGnaT+23ylPYa5F+XN1KYk7Ih/CAV1\n8MhTUdZZ/T9l1BgzoWOXHm8PixGkY3QpMosvLnzdTCZQaAnplhQML1y9pYCcQHmB\nlbEe/8r/qu2wEBhBJVTycsUEDc6V/5jpDMVpi06XgQKBgQD1rMm0hqbEQCBpyWrq\n8hK9m3k9QJHAOBpGdYG5xtEgEgN/6ppTjw6Yd2n0eJhbVGmXVo7pN8jSjNI93dv/\ncWHQNQTmpZHvseZliTSKRRFiKWIcC4jzk+NEH4xunGPShJUCPw3ZW9nbInukr7bt\noejk+FJ2qL0pgwZJqpF5zUz01QKBgQDobnIx4534dLOwJKl6TnLyLQwlKCjGMWgA\nBzvRN0dJmc+w5xBBbgJF4WRGBBhv3y0neGyvpLmVHvlTwHfbBTmKB7vLefVU6c3b\njm7l20+Oi7WO+ALq/NKN5JUsrQgdCxwTGWw6fR6QzRq4dj7JCbh1cgSsMuSPQCFr\ndNZVx6ECTQKBgQCvndSSN67+mtiQxmqniGPdJkaEgqOtxG0D8PvK0VSsmDPoPMwU\n7y5/ztzu5UYEA1N322hNTpM/72pazz10XJiPPVdDiRfJQGJyMqJcNQM4KFz5r0U2\n2YCcMfExIJo64ouiD3DW79HL09qO3wzk0dip1Nkd+YE/K2pTPpq/dwKMAQKBgDu8\nHtcZg4DWJVQQqAnJ3ZrF3wgxoQEGs47GTSZAya5tvEXfrHrUVfs1qPqhlNIzjjxF\no9EkSZm8gyF2JpeAaUBDKo1pw5ZWHFTf7zpdub2NxFSBAub3oPlclMYNljc4ord5\n4inJ/DAEtmhP42TxfZmZev/yeHEkbzJZrbgP/R5FAoGAGluFz0DV91wW6nAcOmqB\nj/HIo6Mzs9Y3xs5zGqaNfECW3J+32YyITvNBh4pve4utl8fTggZd/NX6k9I39Lqd\njiiLgZJQCNqtfVQHinDQ7YRpyS/Ru7LlFShrfOGvGlNkOPw09vlqqW5l6kE8Lels\nUPdUXCJIMa9pb8d2LiHtFlk=\n-----END PRIVATE KEY-----\n',
  client_email: 'sheets-service-account@gen-lang-client-0441699702.iam.gserviceaccount.com',
  client_id: '104741580698453576808',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url:
    'https://www.googleapis.com/robot/v1/metadata/x509/sheets-service-account%40gen-lang-client-0441699702.iam.gserviceaccount.com',
  universe_domain: 'googleapis.com',
});

export function getGlobalGoogleConfig(): GlobalGoogleSheetsConfig {
  for (const p of getGlobalConfigPaths()) {
    if (fs.existsSync(p)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (parsed && typeof parsed === 'object') {
          return {
            apiKey: parsed.apiKey || process.env.GOOGLE_SHEETS_API_KEY || DEFAULT_GOOGLE_API_KEY,
            serviceAccountJson:
              parsed.serviceAccountJson || process.env.GOOGLE_SERVICE_ACCOUNT_JSON || DEFAULT_SERVICE_ACCOUNT_JSON,
            appsScriptBridgeUrl: parsed.appsScriptBridgeUrl || process.env.GOOGLE_APPS_SCRIPT_BRIDGE_URL || '',
            updatedAt: parsed.updatedAt || '',
          };
        }
      } catch (_) {}
    }
  }
  return {
    apiKey: process.env.GOOGLE_SHEETS_API_KEY || DEFAULT_GOOGLE_API_KEY,
    serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || DEFAULT_SERVICE_ACCOUNT_JSON,
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
    .replace(/^Section\s*\d+\s*[—–\-:]?\s*/i, '')
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
  { header: 'Identifiant', field: 'identifiant', aliases: ['identifiant', 'id', 'identifiantdae', 'code', 'identifiantunique', 'identificationidentifiant'] },
  { header: 'Numéro Atlasanté', field: 'numeroAtlasante', aliases: ['numeroatlasante', 'atlasante', 'idatlasante', 'geodae', 'identificationnumeroatlasante'] },
  { header: 'Version logiciel', field: 'versionLogiciel', aliases: ['versionlogiciel', 'versiondulogiciel', 'firmware', 'version', 'identificationversionlogiciel', 'identificationversiondulogiciel'] },
  { header: 'Numéro de série', field: 'numeroSerie', aliases: ['numerodeserie', 'numeroserie', 'numserie', 'serie', 'sn', 'serial', 'identificationserie', 'identificationnumerodeserie'] },
  { header: 'Commentaire', field: 'commentaire', aliases: ['commentaire', 'commentairegeneral', 'commentairedae', 'notes', 'note', 'observation', 'identificationcommentaire', 'identificationcommentairegeneral'] },
  { header: 'Modèle', field: 'modeleId', aliases: ['modele', 'modeledae', 'modeledefibrillateur', 'modeleid', 'model', 'identificationmodele', 'identificationmodeleidentifiantunique', 'modeleidentifiantunique'] },

  { header: 'Client lié', field: 'clientNom', aliases: ['clientlie', 'client', 'clientnom', 'entreprise', 'denominationclient', 'clientclient', 'clientclientidentifiantunique', 'clientidentifiantunique'] },
  { header: 'Nom du site', field: 'nomSite', aliases: ['nomdusite', 'nomsite', 'site', 'etablissement', 'clientsite', 'clientnomdusite'] },
  { header: "Catégorie d'établissement", field: 'categorieEtablissement', aliases: ['categoriedetablissement', 'categorieetablissement', 'typeetablissement', 'clientcategorieetablissement', 'clientcategoriedetablissement'] },
  { header: 'Nom et prénom sur site', field: 'nomPrenomSite', aliases: ['nometprenomsursite', 'nomprenomsite', 'contactsursite', 'contactsite', 'responsablesite', 'nometprenom', 'nomprenom', 'clientnometprenom', 'contact'] },
  { header: 'Téléphone portable sur site', field: 'telephoneSite', aliases: ['telephoneportablesursite', 'telephonesursite', 'telephonesite', 'telsite', 'portablesite', 'telephoneportable', 'clienttelephoneportable', 'telephone', 'tel'] },
  { header: 'Email sur site', field: 'emailSite', aliases: ['emailsursite', 'emailsite', 'mailsite', 'courrielsite', 'email', 'clientemail', 'mail', 'courriel'] },
  { header: 'Contrat', field: 'contrat', aliases: ['contrat', 'aveccontrat', 'souscontrat', 'contratencours', 'clientcontratencours', 'clientcontrat'], type: 'yesno' },
  { header: 'Nom du contrat', field: 'nomContrat', aliases: ['nomducontrat', 'nomcontrat', 'typecontrat', 'titreducontrat', 'titrecontrat', 'clienttitreducontrat', 'clientnomducontrat'] },
  { header: 'Référence contrat', field: 'referenceContrat', aliases: ['referencecontrat', 'refcontrat', 'numerocontrat', 'referenceducontrat', 'clientreferenceducontrat'] },
  { header: 'Début du contrat', field: 'debutContrat', aliases: ['debutducontrat', 'debutcontrat', 'datedebutcontrat', 'clientdebutducontrat'], type: 'date' },
  { header: 'Fin du contrat', field: 'finContrat', aliases: ['finducontrat', 'fincontrat', 'datefincontrat', 'echeancecontrat', 'expirationducontrat', 'clientexpirationducontrat', 'clientfinducontrat'], type: 'date' },
  { header: 'Payeur ID', field: 'payeurId', aliases: ['payeurid', 'idpayeur', 'codepayeur', 'clientpayeurid'] },
  { header: 'Client ID', field: 'clientIdField', aliases: ['clientid', 'idclient', 'codeclient', 'clientidfield', 'clientclientid'] },

  { header: 'Modèle coffret', field: 'modeleCoffretId', aliases: ['modelecoffret', 'coffret', 'modeleboitier', 'boitiermodele', 'modelecoffretid', 'boitier', 'boitiermodeleidentifiantunique'] },
  { header: 'Numéro de lot coffret', field: 'numeroLotCoffret', aliases: ['numerodelotcoffret', 'numerolotcoffret', 'lotcoffret', 'lotboitier', 'boitierlot'] },
  { header: 'Commentaire coffret', field: 'commentaireCoffret', aliases: ['commentairecoffret', 'commentaireboitier', 'notecoffret', 'boitiercommentaire', 'section3commentaireboitier'] },
  { header: 'Date péremption trousse', field: 'peremptionTrousse', aliases: ['dateperemptiontrousse', 'peremptiontrousse', 'peremptiondelatrousse', 'peremptionkit', 'dateperemptionkit', 'boitierperemptiontrousse', 'boitierperemptiondelatrousse'], type: 'date' },
  { header: 'Ciseaux présents', field: 'kitCiseauxPresents', aliases: ['ciseauxpresents', 'kitciseauxpresents', 'ciseaux', 'boitierciseauxpresents'], type: 'yesno' },
  { header: 'Masque présent', field: 'kitMasquePresent', aliases: ['masquepresent', 'kitmasquepresent', 'masque', 'boitiermasquepresent'], type: 'yesno' },
  { header: 'Péremption masque', field: 'kitPeremptionMasque', aliases: ['peremptionmasque', 'peremptiondumasque', 'kitperemptionmasque', 'dateperemptionmasque', 'boitierperemptiondumasque'], type: 'date' },
  { header: 'Serviettes présentes', field: 'kitServiettesPresentes', aliases: ['serviettespresentes', 'kitserviettespresentes', 'serviettes', 'boitierserviettespresentes'], type: 'yesno' },
  { header: 'Péremption serviettes', field: 'kitPeremptionServiettes', aliases: ['peremptionserviettes', 'peremptiondesserviettes', 'kitperemptionserviettes', 'dateperemptionserviettes', 'boitierperemptiondesserviettes'], type: 'date' },
  { header: 'Gants présents', field: 'kitGantsPresents', aliases: ['gantspresents', 'pairedegantspresents', 'pairedegantspresente', 'kitgantspresents', 'gants', 'boitierpairedegantspresents'], type: 'yesno' },
  { header: 'Rasoir présent', field: 'kitRasoirPresent', aliases: ['rasoirpresent', 'kitrasoirpresent', 'rasoir', 'boitierrasoir'], type: 'yesno' },

  { header: 'Numéro et voie', field: 'numVoie', aliases: ['numeroetvoie', 'numvoie', 'adresse', 'rue', 'voie', 'localisationnumeroetvoie', 'localisationrue'] },
  { header: 'Ville', field: 'ville', aliases: ['ville', 'commune', 'localite', 'city', 'localisationville'] },
  { header: 'Code postal', field: 'cp', aliases: ['codepostal', 'cp', 'zip', 'postalcode', 'localisationcodepostal'] },
  { header: 'Région', field: 'region', aliases: ['region', 'departementregion', 'localisationregion'] },
  { header: 'Pays', field: 'pays', aliases: ['pays', 'country', 'localisationpays'] },
  { header: 'Latitude', field: 'latitude', aliases: ['latitude', 'lat', 'coordlat', 'localisationlatitude'] },
  { header: 'Longitude', field: 'longitude', aliases: ['longitude', 'lng', 'lon', 'long', 'coordlng', 'localisationlongitude'] },
  {
    header: 'Section 4 — Localisation : Aide d’accès.',
    field: 'commentaireAdresse',
    aliases: [
      'localisationaidedacces',
      'localisationaideacces',
      'localisationaidealacces',
      'aidedacces',
      'aideacces',
      'aidealacces',
      'commentaireadresse',
      'localisationcommentaireadresse',
      'section4localisationaidedacces',
      'section4aidedacces',
      'emplacement',
      'localisationprecise',
      'localisation',
    ],
  },
  { header: 'Accès 24/7', field: 'acces247', aliases: ['acces247', 'acces24h24', '247', 'localisationacces247'], type: 'bool' },
  { header: 'Accès semaine', field: 'accesSemaine', aliases: ['accessemaine', 'semaine', 'localisationaccessemaine'], type: 'bool' },
  { header: 'Accès week-end', field: 'accesWeekend', aliases: ['accesweekend', 'weekend', 'localisationaccesweekend'], type: 'bool' },
  { header: 'Extérieur', field: 'exterieur', aliases: ['exterieur', 'ext', 'localisationexterieur'], type: 'bool' },
  { header: "Horaires d'ouverture", field: 'horaires', aliases: ['horairesdouverture', 'horaires', 'heuresouverture', 'localisationhoraires'] },

  // Plage 1 & Plage 2 schedule columns (Section 4)
  { header: 'Section 4 - Plage 1 - Fermeture le midi', field: '_plage1_fermetureMidi', aliases: ['plage1fermeturelemidi', 'localisationplage1fermeturelemidi'], type: 'bool' },
  { header: 'Section 4 - Plage 1 - Ouv. Matin', field: '_plage1_openMorning', aliases: ['plage1ouvmatin', 'localisationplage1ouvmatin'] },
  { header: 'Section 4 - Plage 1 - Ferm. Midi', field: '_plage1_closeMorning', aliases: ['plage1fermmidi', 'localisationplage1fermmidi'] },
  { header: 'Section 4 - Plage 1 - RéOuv. Midi', field: '_plage1_openAfternoon', aliases: ['plage1reouvmidi', 'localisationplage1reouvmidi'] },
  { header: 'Section 4 - Plage 1 - Ferm. Soir', field: '_plage1_closeAfternoon', aliases: ['plage1fermsoir', 'localisationplage1fermsoir'] },
  { header: 'Section 4 - Plage 1 - Jours de la semaine', field: '_plage1_days', aliases: ['plage1joursdelasemaine', 'localisationplage1joursdelasemaine'] },
  { header: 'Section 4 - Plage 1 - Ouv. Général', field: '_plage1_openContinuous', aliases: ['plage1ouvgeneral', 'localisationplage1ouvgeneral'] },
  { header: 'Section 4 - Plage 1 - Ferm. Général', field: '_plage1_closeContinuous', aliases: ['plage1fermgeneral', 'localisationplage1fermgeneral'] },
  { header: 'Section 4 - Plage 2 - Fermeture le midi', field: '_plage2_fermetureMidi', aliases: ['plage2fermeturelemidi', 'localisationplage2fermeturelemidi'], type: 'bool' },
  { header: 'Section 4 - Plage 2 - Ouv. Matin', field: '_plage2_openMorning', aliases: ['plage2ouvmatin', 'localisationplage2ouvmatin'] },
  { header: 'Section 4 - Plage 2 - Ferm. Midi', field: '_plage2_closeMorning', aliases: ['plage2fermmidi', 'localisationplage2fermmidi'] },
  { header: 'Section 4 - Plage 2 - RéOuv. Midi', field: '_plage2_openAfternoon', aliases: ['plage2reouvmidi', 'localisationplage2reouvmidi'] },
  { header: 'Section 4 - Plage 2 - Ferm. Soir', field: '_plage2_closeAfternoon', aliases: ['plage2fermsoir', 'localisationplage2fermsoir'] },
  { header: 'Section 4 - Plage 2 - Jours de la semaine', field: '_plage2_days', aliases: ['plage2joursdelasemaine', 'localisationplage2joursdelasemaine'] },
  { header: 'Section 4 - Plage 2 - Ouv. Général', field: '_plage2_openContinuous', aliases: ['plage2ouvgeneral', 'localisationplage2ouvgeneral'] },
  { header: 'Section 4 - Plage 2 - Ferm. Général', field: '_plage2_closeContinuous', aliases: ['plage2fermgeneral', 'localisationplage2fermgeneral'] },

  { header: 'Expiration garantie', field: 'finGarantie', aliases: ['expirationgarantie', 'expirationdegarantie', 'expirgarantie', 'fingarantie', 'garantie', 'datefingarantie', 'datesexpirationdegarantie'], type: 'date' },
  { header: 'Date de fabrication', field: 'fabrication', aliases: ['datedefabrication', 'fabrication', 'datefabrication', 'datesfabrication'], type: 'date' },
  { header: 'Mise en service', field: 'miseEnService', aliases: ['miseenservice', 'datemiseenservice', 'installation', 'datesmiseenservice'], type: 'date' },
  { header: 'Dernière maintenance', field: 'derniereMaintenance', aliases: ['dernieremaintenance', 'datedernieremaintenance', 'dernierevisite', 'dermnt', 'datesdernieremaintenance'], type: 'date' },
  { header: 'Prochaine maintenance', field: 'prochaineMaintenance', aliases: ['prochainemaintenance', 'prochainevisite', 'dateprochainemaintenance', 'prochainev', 'provisite', 'datesprochainemaintenance'], type: 'date' },
  { header: 'Sortie fabricant', field: 'sortieFabricant', aliases: ['sortiefabricant', 'datesortiefabricant', 'sortiedusine', 'datessortiedusine'], type: 'date' },

  { header: 'Modèle électrode A', field: 'modeleElectrodeAId', aliases: ['modeleelectrodea', 'modelea', 'electrodeamodele', 'modeleelectrodeaid', 'electrodeadulteoumixtemodele'] },
  { header: 'Lot électrode A', field: 'lotElectrodeA', aliases: ['lotelectrodea', 'lota', 'electrodealot', 'electrodeadulteoumixtelot'] },
  { header: 'Insertion électrode A', field: 'insertionElectrodeA', aliases: ['insertionelectrodea', 'insertiona', 'dateinsertionelectrodea', 'electrodeadulteoumixteinsertion'], type: 'date' },
  { header: 'Péremption électrode A', field: 'peremptionElectrodeA', aliases: ['peremptionelectrodea', 'peremptiona', 'dateperemptionelectrodea', 'dateperemptiona', 'electrodeadulteoumixteperemption'], type: 'date' },
  { header: 'Livraison électrode A', field: 'livraisonElectrodeA', aliases: ['livraisonelectrodea', 'livraisona', 'datelivraisonelectrodea', 'electrodeadulteoumixtelivraison'], type: 'date' },
  { header: 'Situation électrode A', field: 'situationElectrodeA', aliases: ['situationelectrodea', 'situationa', 'statuta', 'etatelectrodea', 'electrodeadulteoumixtestatut', 'statutelectrodea'] },
  { header: 'Commentaire électrode A', field: 'commentaireElectrodeA', aliases: ['commentaireelectrodea', 'commentairea', 'noteelectrodea', 'electrodeadulteoumixtecommentaire'] },
  { header: 'Électrode secours A', field: 'hasElectrodeASecours', aliases: ['electrodesecoursa', 'electrodedesecoursa', 'haselectrodeasecours', 'secoursa'], type: 'yesno' },
  { header: 'Modèle secours A', field: 'modeleElectrodeASecoursId', aliases: ['modelesecoursa', 'modeleelectrodeasecours', 'modeleelectrodeasecoursid', 'modeledelectrodedesecoursa', 'modeldelectrodedesecoursa', 'electrodeadulteoumixtemodeledelectrodedesecours', 'modeledelectrodedesecours'] },
  { header: 'Lot secours A', field: 'lotElectrodeASecours', aliases: ['lotsecoursa', 'lotelectrodeasecours', 'lotdelelectrodedesecoursa', 'electrodeadulteoumixtelotdelelectrodedesecours', 'lotdelelectrodedesecours'] },
  { header: 'Péremption secours A', field: 'peremptionSecoursElectrodeA', aliases: ['peremptionsecoursa', 'peremptionsecourselectrodea', 'peremptiondelelectrodedesecoursa', 'dateperemptionsecoursa', 'electrodeadulteoumixteperemptiondelelectrodedesecours', 'peremptiondelelectrodedesecours'], type: 'date' },
  { header: 'Pad-Pak Adulte', field: 'hasPadpakA', aliases: ['padpakadulte', 'haspadpaka', 'padpaka'], type: 'yesno' },
  { header: 'Lot Pad-Pak A', field: 'lotPadpakA', aliases: ['lotpadpaka', 'lotpadpakadulte', 'electrodeadulteoumixtelotpadpaka'] },
  { header: 'Péremption Pad-Pak A', field: 'peremptionPadpakA', aliases: ['peremptionpadpaka', 'peremptionpadpakadulte', 'dateperemptionpadpaka', 'electrodeadulteoumixteperemptionpadpaka'], type: 'date' },

  { header: 'Modèle électrode P', field: 'modeleElectrodePId', aliases: ['modeleelectrodep', 'modelep', 'electrodepModele', 'modeleelectrodepid', 'electrodepediatriquemodele'] },
  { header: 'Lot électrode P', field: 'lotElectrodeP', aliases: ['lotelectrodep', 'lotp', 'electrodeplot', 'electrodepediatriquelot'] },
  { header: 'Insertion électrode P', field: 'insertionElectrodeP', aliases: ['insertionelectrodep', 'insertionp', 'dateinsertionelectrodep', 'electrodepediatriqueinsertion'], type: 'date' },
  { header: 'Péremption électrode P', field: 'peremptionElectrodeP', aliases: ['peremptionelectrodep', 'peremptionp', 'dateperemptionelectrodep', 'dateperemptionp', 'electrodepediatriqueperemption'], type: 'date' },
  { header: 'Livraison électrode P', field: 'livraisonElectrodeP', aliases: ['livraisonelectrodep', 'livraisonp', 'datelivraisonelectrodep', 'electrodepediatriquelivraison'], type: 'date' },
  { header: 'Situation électrode P', field: 'situationElectrodeP', aliases: ['situationelectrodep', 'situationp', 'statutp', 'etatelectrodep', 'electrodepediatriquestatut', 'statutelectrodep'] },
  { header: 'Commentaire électrode P', field: 'commentaireElectrodeP', aliases: ['commentaireelectrodep', 'commentairep', 'noteelectrodep', 'electrodepediatriquecommentaire'] },
  { header: 'Électrode secours P', field: 'hasElectrodePSecours', aliases: ['electrodesecoursp', 'electrodedesecoursp', 'haselectrodepsecours', 'secoursp'], type: 'yesno' },
  { header: 'Modèle secours P', field: 'modeleElectrodePSecoursId', aliases: ['modelesecoursp', 'modeleelectrodepsecours', 'modeleelectrodepsecoursid', 'modeledelectrodedesecoursp', 'modeldelectrodedesecoursp', 'electrodepediatriquemodeledelectrodedesecours'] },
  { header: 'Lot secours P', field: 'lotElectrodePSecours', aliases: ['lotsecoursp', 'lotelectrodepsecours', 'lotdelelectrodedesecoursp', 'electrodepediatriquelotdelelectrodedesecours'] },
  { header: 'Péremption secours P', field: 'peremptionSecoursElectrodeP', aliases: ['peremptionsecoursp', 'peremptionsecourselectrodep', 'peremptiondelelectrodedesecoursp', 'dateperemptionsecoursp', 'electrodepediatriqueperemptiondelelectrodedesecours'], type: 'date' },
  { header: 'Pad-Pak Pédiatrique', field: 'hasPadpakP', aliases: ['padpakpediatrique', 'haspadpakp', 'padpakp'], type: 'yesno' },
  { header: 'Lot Pad-Pak P', field: 'lotPadpakP', aliases: ['lotpadpakp', 'lotpadpakpediatrique', 'electrodepediatriquelotpadpakp'] },
  { header: 'Péremption Pad-Pak P', field: 'peremptionPadpakP', aliases: ['peremptionpadpakp', 'peremptionpadpakpediatrique', 'dateperemptionpadpakp', 'electrodepediatriqueperemptionpadpakp'], type: 'date' },

  { header: 'Modèle batterie B', field: 'modeleBatterieId', aliases: ['modelebatterieb', 'modelebatterie', 'modeleb', 'batteriemodele', 'modelebatterieid'] },
  { header: 'Lot batterie B', field: 'lotBatterie', aliases: ['lotbatterieb', 'lotbatterie', 'lotb', 'batterielot'] },
  { header: 'Insertion batterie B', field: 'insertionBatterie', aliases: ['insertionbatterieb', 'insertionbatterie', 'insertionb', 'dateinsertionbatterie', 'batterieinsertion'], type: 'date' },
  { header: 'Fabrication batterie B', field: 'fabricationBatterie', aliases: ['fabricationbatterieb', 'fabricationbatterie', 'fabricationb', 'datefabricationbatterie', 'batteriefabrication'], type: 'date' },
  { header: 'Péremption batterie B', field: 'peremptionBatterie', aliases: ['peremptionbatterieb', 'peremptionbatterie', 'peremptionb', 'dateperemptionbatterie', 'dateperemptionb', 'batterieperemption'], type: 'date' },
  { header: 'Livraison batterie B', field: 'livraisonBatterie', aliases: ['livraisonbatterieb', 'livraisonbatterie', 'livraisonb', 'datelivraisonbatterie', 'batterielivraison'], type: 'date' },
  { header: 'Situation batterie B', field: 'situationBatterie', aliases: ['situationbatterieb', 'situationbatterie', 'situationb', 'statutb', 'etatbatterie', 'batteriestatut', 'statutbatterie'] },
  { header: 'Pourcentage batterie B', field: 'pourcentageBatterie', aliases: ['pourcentagebatterieb', 'pourcentagebatterie', 'pourcentageb', 'pourcentageconstateb', 'batteriepourcentage', 'batteriepourcentageconstate', 'pourcentageconstate'] },
  { header: 'Commentaire batterie B', field: 'commentaireBatterie', aliases: ['commentairebatterieb', 'commentairebatterie', 'commentaireb', 'notebatterie', 'batteriecommentaire'] },
  { header: 'Batterie secours B', field: 'hasBatterieSecours', aliases: ['batteriesecoursb', 'batteriedesecoursb', 'hasbatteriesecours', 'secoursb', 'batteriesecours'], type: 'yesno' },
  { header: 'Modèle secours B', field: 'modeleBatterieSecoursId', aliases: ['modelesecoursb', 'modelebatteriesecours', 'modelebatteriesecoursid', 'modeledebatteriedesecoursb', 'batteriemodelesecours'] },
  { header: 'Lot secours B', field: 'lotBatterieSecours', aliases: ['lotsecoursb', 'lotbatteriesecours', 'lotdelabatteriedesecoursb', 'batterielotsecours'] },
  { header: 'Péremption secours B', field: 'peremptionBatterieSecours', aliases: ['peremptionsecoursb', 'peremptionbatteriesecours', 'peremptiondelabatteriedesecoursb', 'dateperemptionsecoursb', 'batterieperemptionsecours'], type: 'date' },

  { header: 'Tournée', field: 'tournee', aliases: ['tournee', 'secteur', 'categoriestournee'] },
  { header: 'Loué', field: 'loue', aliases: ['loue', 'location', 'enlocation', 'categoriesloue'], type: 'yesno' },
  { header: 'Prêté', field: 'prete', aliases: ['prete', 'pret', 'enpret', 'categoriesprete'], type: 'yesno' },
  { header: 'Stocké', field: 'stocke', aliases: ['stocke', 'enstock', 'categoriesstocke'], type: 'yesno' },
  { header: 'Archivé', field: 'archive', aliases: ['archive', 'inactif', 'categoriesarchive'], type: 'yesno' },
  { header: 'Conforme', field: 'conforme', aliases: ['conforme', 'conformite', 'categoriesconforme'], type: 'yesno' },
  { header: 'Sous-traitance', field: 'sousTraitance', aliases: ['soustraitance', 'soustraitant', 'opereensoustraitance', 'categoriesopereensoustraitance', 'categoriessoustraitance'], type: 'yesno' },
  { header: 'Maintenance autorisée', field: 'fsmAutorise', aliases: ['maintenanceautorisee', 'fsmautorise', 'maintenance', 'autorisationmaintenance', 'categoriesmaintenanceautorisee'], type: 'yesno' },
  { header: 'Victime avec survie', field: 'victimeSurvie', aliases: ['victimeavecsurvie', 'victimesurvie', 'utiliseparunevictime', 'categoriesvictimeavecsurvie', 'categoriesutiliseparunevictime'], type: 'yesno' },
  { header: 'Victime sans survie', field: 'victimeSansSurvie', aliases: ['victimesanssurvie', 'categoriesvictimesanssurvie'], type: 'yesno' },
  { header: 'Âge victime', field: 'ageVictime', aliases: ['agevictime', 'agedelavictime', 'age', 'categoriesagevictime', 'categoriesagedelavictime'] },
  { header: 'Commentaire campagne rappel', field: 'commentaireCampagneRappel', aliases: ['commentairecampagnerappel', 'campagnerappel'] },
  { header: 'Rappel mensuel auto', field: 'rappelMensuelAuto', aliases: ['rappelmensuelauto', 'rappelmensuel', 'emailmensueldautovigilance', 'categoriesemailmensueldautovigilance'], type: 'yesno' },
  { header: 'Rappel hebdo auto', field: 'rappelHebdoAuto', aliases: ['rappelhebdoauto', 'rappelhebdo', 'rappelhebdomadaire', 'emailhebdomadairedautovigilance', 'categoriesemailhebdomadairedautovigilance'], type: 'yesno' },
  { header: 'Rappel journalier auto', field: 'rappelJournalierAuto', aliases: ['rappeljournalierauto', 'rappeljournalier', 'emailjournalierdautovigilance', 'categoriesemailjournalierdautovigilance'], type: 'yesno' },
];

// ==========================================
// 2. AUTRES MATERIELS MAPPING (GET & POST)
// ==========================================
export const AUTRES_CANONICAL_HEADERS: Array<{ header: string; field: string; aliases: string[]; isSpecifique?: boolean; type?: 'yesno' | 'bool' | 'date' }> = [
  { header: 'Identifiant', field: 'identifiant', aliases: ['identifiant', 'id', 'code', 'identifiantmateriel', 'identificationidentifiant'] },
  { header: 'Catégorie', field: 'categorie', aliases: ['categorie', 'categoriedemateriel', 'categoriemateriel', 'type', 'typemateriel', 'identificationcategorie'] },
  { header: 'Client lié', field: 'clientNom', aliases: ['clientlie', 'client', 'clientnom', 'entreprise', 'denomination', 'clientclient'] },
  { header: 'Nom et prénom sur site', field: 'nomPrenomSite', aliases: ['nometprenomsursite', 'nomprenomsite', 'contactsite', 'contactsursite', 'nometprenom', 'clientnometprenom'] },
  { header: 'Téléphone portable sur site', field: 'telephoneSite', aliases: ['telephoneportablesursite', 'telephonesite', 'telsite', 'telephoneportable', 'clienttelephoneportable', 'telephone'] },
  { header: 'Email sur site', field: 'emailSite', aliases: ['emailsursite', 'emailsite', 'mailsite', 'email', 'clientemail'] },
  { header: 'Contrat', field: 'contrat', aliases: ['contrat', 'aveccontrat', 'contratencours', 'clientcontratencours'], type: 'yesno' },
  { header: 'Nom du contrat', field: 'nomContrat', aliases: ['nomducontrat', 'nomcontrat', 'titreducontrat', 'clienttitreducontrat'] },
  { header: 'Référence contrat', field: 'referenceContrat', aliases: ['referencecontrat', 'refcontrat', 'referenceducontrat', 'clientreferenceducontrat'] },
  { header: 'Début du contrat', field: 'debutContrat', aliases: ['debutducontrat', 'debutcontrat', 'clientdebutducontrat'], type: 'date' },
  { header: 'Fin du contrat', field: 'finContrat', aliases: ['finducontrat', 'fincontrat', 'expirationducontrat', 'clientexpirationducontrat'], type: 'date' },
  { header: 'Payeur ID', field: 'payeurId', aliases: ['payeurid', 'idpayeur', 'clientpayeurid'] },
  { header: 'Client ID', field: 'clientIdField', aliases: ['clientid', 'idclient', 'clientidfield', 'clientclientid'] },

  { header: 'Numéro et voie', field: 'numeroVoie', aliases: ['numeroetvoie', 'numerovoie', 'numvoie', 'adresse', 'rue', 'localisationnumeroetvoie'] },
  { header: 'Ville', field: 'ville', aliases: ['ville', 'commune', 'city', 'localisationville'] },
  { header: 'Code postal', field: 'codePostal', aliases: ['codepostal', 'cp', 'zip', 'localisationcodepostal'] },
  { header: 'Région', field: 'region', aliases: ['region', 'localisationregion'] },
  { header: 'Pays', field: 'pays', aliases: ['pays', 'country', 'localisationpays'] },
  { header: 'Latitude', field: 'latitude', aliases: ['latitude', 'lat', 'localisationlatitude'] },
  { header: 'Longitude', field: 'longitude', aliases: ['longitude', 'lng', 'lon', 'localisationlongitude'] },
  { header: 'Section 4 — Localisation : Aide d’accès.', field: 'aideAcces', aliases: ['localisationaidedacces', 'localisationaideacces', 'localisationaidealacces', 'aidealacces', 'aideacces', 'aidedacces', 'commentaireadresse', 'emplacement', 'localisation'] },
  { header: 'Accès 24/7', field: 'acces247', aliases: ['acces247', '247', 'localisationacces247'], type: 'bool' },
  { header: 'Accès semaine', field: 'accesSemaine', aliases: ['accessemaine', 'localisationaccessemaine'], type: 'bool' },
  { header: 'Accès week-end', field: 'accesWeekend', aliases: ['accesweekend', 'localisationaccesweekend'], type: 'bool' },
  { header: 'Extérieur', field: 'exterieur', aliases: ['exterieur', 'localisationexterieur'], type: 'bool' },
  { header: "Horaires d'ouverture", field: 'horaires', aliases: ['horairesdouverture', 'horaires', 'localisationhoraires'] },

  { header: 'Expiration garantie', field: 'expirationGarantie', aliases: ['expirationgarantie', 'fingarantie', 'garantie', 'expirgarantie', 'datesexpirationdegarantie'], type: 'date' },
  { header: 'Date de fabrication', field: 'dateFabrication', aliases: ['datedefabrication', 'datefabrication', 'fabrication', 'datesfabrication'], type: 'date' },
  { header: 'Mise en service', field: 'miseEnService', aliases: ['miseenservice', 'datemiseenservice', 'datesmiseenservice'], type: 'date' },
  { header: 'Dernière maintenance', field: 'derniereMaintenance', aliases: ['dernieremaintenance', 'dernierevisite', 'datesdernieremaintenance'], type: 'date' },
  { header: 'Prochaine maintenance', field: 'prochaineMaintenance', aliases: ['prochainemaintenance', 'prochainevisite', 'provisite', 'datesprochainemaintenance'], type: 'date' },
  { header: 'Tournée', field: 'tournee', aliases: ['tournee', 'secteur', 'categoriestournee'] },

  { header: 'Loué', field: 'loue', aliases: ['loue', 'categoriesloue'], type: 'yesno' },
  { header: 'Prêté', field: 'prete', aliases: ['prete', 'categoriesprete'], type: 'yesno' },
  { header: 'Stocké', field: 'stocke', aliases: ['stocke', 'categoriesstocke'], type: 'yesno' },
  { header: 'Archivé', field: 'archive', aliases: ['archive', 'categoriesarchive'], type: 'yesno' },
  { header: 'Conforme', field: 'conforme', aliases: ['conforme', 'categoriesconforme'], type: 'yesno' },
  { header: 'Sous-traitance', field: 'sousTraitance', aliases: ['soustraitance', 'opereensoustraitance', 'categoriesopereensoustraitance'], type: 'yesno' },
  { header: 'Maintenance autorisée', field: 'fsmAutorise', aliases: ['maintenanceautorisee', 'fsmautorise', 'categoriesmaintenanceautorisee'], type: 'yesno' },
  { header: 'Rappel mensuel auto', field: 'rappelMensuelAuto', aliases: ['rappelmensuelauto', 'emailmensueldautovigilance'], type: 'yesno' },
  { header: 'Rappel hebdo auto', field: 'rappelHebdoAuto', aliases: ['rappelhebdoauto', 'emailhebdomadairedautovigilance'], type: 'yesno' },
  { header: 'Rappel journalier auto', field: 'rappelJournalierAuto', aliases: ['rappeljournalierauto', 'emailjournalierdautovigilance'], type: 'yesno' },

  // Specifiques fields
  { header: 'Numéro de série', field: 'numSerie', aliases: ['numerodeserie', 'numeroserie', 'numserie', 'serie', 'identificationserie'], isSpecifique: true },
  { header: 'Marque / Modèle', field: 'marqueModele', aliases: ['marquemodele', 'modele', 'marque', 'identificationmodele'], isSpecifique: true },
  { header: 'Agent extincteur', field: 'agentExtincteur', aliases: ['agentextincteur', 'typeextincteur', 'agent'], isSpecifique: true },
  { header: 'Capacité / Poids', field: 'capacite', aliases: ['capacitepoids', 'capacite', 'poids', 'volume'], isSpecifique: true },
  { header: 'Pression', field: 'pression', aliases: ['pression', 'typepression'], isSpecifique: true },
  { header: "Date d'épreuve", field: 'dateEpreuve', aliases: ['datedepreuve', 'dateepreuve', 'epreuve'], isSpecifique: true, type: 'date' },
  { header: 'Date de recharge', field: 'dateRecharge', aliases: ['datederecharge', 'daterecharge', 'recharge'], isSpecifique: true, type: 'date' },
  { header: 'Emplacements', field: 'emplacements', aliases: ['emplacements', 'emplacement'], isSpecifique: true },
  { header: 'Commentaire spécifique', field: 'commentaireSpecifique', aliases: ['commentairespecifique', 'commentaire', 'observationspecifique', 'identificationcommentaire'], isSpecifique: true },
];

// ==========================================
// 3. CLIENTS MAPPING (GET & POST)
// ==========================================
export const CLIENTS_CANONICAL_HEADERS: Array<{ header: string; field: string; aliases: string[]; type?: 'yesno' | 'date' }> = [
  { header: 'Dénomination', field: 'denomination', aliases: ['denomination', 'entreprise', 'section1entreprise', 'cliententreprise', 'denominationentreprise', 'nomentreprise', 'raisonsociale', 'nomclient', 'societe', 'nom'] },
  { header: "Numéro d'entreprise", field: 'siret', aliases: ['numerodentreprise', 'numeroentreprise', 'siret', 'siren', 'numerofiscal', 'identifiantfiscal'] },
  { header: 'TVA Intracommunautaire', field: 'tvaIntra', aliases: ['tvaintracommunautaire', 'tvaintra', 'numerotva', 'tva'] },
  { header: 'Numéro et voie', field: 'adresse', aliases: ['numeroetvoie', 'adresse', 'numvoie', 'rue', 'voie'] },
  { header: 'Code postal', field: 'codePostal', aliases: ['codepostal', 'cp', 'zip'] },
  { header: 'Ville', field: 'ville', aliases: ['ville', 'commune', 'localite', 'city'] },
  { header: 'Pays', field: 'pays', aliases: ['pays', 'country'] },
  { header: 'Nom et prénom', field: 'nomPrenom', aliases: ['nometprenom', 'nomprenom', 'contact', 'interlocuteur', 'responsable'] },
  { header: 'Téléphone', field: 'phone', aliases: ['telephone', 'phone', 'tel', 'telephoneprincipal'] },
  { header: 'Email', field: 'email', aliases: ['email', 'mail', 'courriel', 'emailprincipal'] },
  { header: 'Nom et prénom sur site', field: 'nomPrenomSite', aliases: ['nometprenomsursite', 'nomprenomsite', 'contactsursite', 'contactsite', 'contact1contact1'] },
  { header: 'Téléphone portable sur site', field: 'telephoneSite', aliases: ['telephoneportablesursite', 'telephonesursite', 'telephonesite', 'telsite', 'contact1telephoneducontact1'] },
  { header: 'Email sur site', field: 'emailSite', aliases: ['emailsursite', 'emailsite', 'mailsite', 'contact1emailducontact1'] },
  { header: 'Contrat', field: 'contrat', aliases: ['contrat', 'aveccontrat', 'souscontrat', 'contratactif', 'contratencours'], type: 'yesno' },
  { header: 'Nom du contrat', field: 'nomContrat', aliases: ['nomducontrat', 'nomcontrat', 'typecontrat', 'titreducontrat', 'categorieducontact', 'categorieducontrat'] },
  { header: 'Référence contrat', field: 'referenceContrat', aliases: ['referencecontrat', 'refcontrat', 'numerocontrat', 'referenceducontrat'] },
  { header: 'Début du contrat', field: 'debutContrat', aliases: ['debutducontrat', 'debutcontrat', 'datedebutcontrat', 'debut'], type: 'date' },
  { header: 'Fin du contrat', field: 'finContrat', aliases: ['finducontrat', 'fincontrat', 'datefincontrat', 'expirationducontrat', 'expiration'], type: 'date' },
  { header: 'Payeur ID', field: 'payeurId', aliases: ['payeurid', 'idpayeur', 'codepayeur'] },
  { header: 'Client ID', field: 'clientIdField', aliases: ['clientid', 'idclient', 'codeclient', 'clientidfield'] },
  { header: 'Code PIN Signature', field: 'signaturePin', aliases: ['codepinsignature', 'codepindesignatureunique', 'signaturepin', 'pin', 'codepin', 'cledacces', 'accesskey'] },
  { header: 'Accès Portail Client', field: 'accesPortail', aliases: ['accesportailclient', 'accesportail', 'portailclient'], type: 'yesno' },
  { header: 'Identifiant Portail', field: 'identifiantPortail', aliases: ['identifiantportail', 'loginportail', 'identifiantunique'] },
  { header: 'Mot de passe Portail', field: 'motDePassePortail', aliases: ['motdepasseportail', 'passwordportail', 'motdepasse'] },
  { header: 'Commentaire', field: 'commentaire', aliases: ['commentaire', 'notes', 'observation'] },
];

function normalizeSituationFromSheet(val: string): 'Vert' | 'Orange' | 'Rouge' {
  const s = String(val || '').trim().toLowerCase();
  if (s === 'orange' || s === 'attention') return 'Orange';
  if (s === 'rouge' || s === 'alerte') return 'Rouge';
  return 'Vert';
}

export interface PrecomputedColumnMatch {
  colIdx: number;
  def: SheetColumnDef;
}

export function buildColumnMatches(headers: string[], canonicalDefs: SheetColumnDef[]): PrecomputedColumnMatch[] {
  const normHeaders = headers.map(normalizeHeaderKey);
  const matches: PrecomputedColumnMatch[] = [];
  for (const def of canonicalDefs) {
    let matchedIdx = -1;
    for (let i = 0; i < normHeaders.length; i++) {
      if (def.aliases.includes(normHeaders[i])) {
        matchedIdx = i;
        break;
      }
    }
    if (matchedIdx >= 0) {
      matches.push({ colIdx: matchedIdx, def });
    }
  }
  return matches;
}

export function mapRowToDefib(
  headers: string[],
  row: string[],
  rowIndex: number,
  tenantId: string,
  precomputedMatches?: PrecomputedColumnMatch[]
): any {
  const colMatches = precomputedMatches || buildColumnMatches(headers, DEFIB_CANONICAL_HEADERS);

  const obj: any = {
    envId: tenantId,
    tenantId: tenantId,
    _sheetRowNumber: rowIndex + 2, // 1-based header = row 1, first data row = row 2
    pays: 'France',
    contrat: 'Non',
    commentaireAdresse: '',
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

  for (let m = 0; m < colMatches.length; m++) {
    const { colIdx, def } = colMatches[m];
    const rawCell = row[colIdx];
    const rawVal = rawCell !== undefined && rawCell !== null ? String(rawCell).trim() : '';
    if (def.type === 'yesno') {
      const defVal = ['conforme', 'fsmAutorise', 'kitCiseauxPresents', 'kitMasquePresent', 'kitServiettesPresentes', 'kitGantsPresents', 'kitRasoirPresent'].includes(def.field) ? 'Oui' : 'Non';
      obj[def.field] = normalizeYesNo(rawVal, defVal);
    } else if (def.type === 'bool') {
      obj[def.field] = normalizeBool(rawVal, false);
    } else if (def.type === 'date') {
      const dStr = normalizeDateStr(rawVal);
      if (dStr) obj[def.field] = dStr;
    } else if (def.field === 'situationElectrodeA' || def.field === 'situationElectrodeP' || def.field === 'situationBatterie') {
      obj[def.field] = normalizeSituationFromSheet(rawVal);
    } else if (rawVal !== '') {
      obj[def.field] = rawVal;
    }
  }

  // Reconstruct horaires JSON if Plage 1 or Plage 2 columns were populated in the sheet
  const hasPlage1 = Boolean(
    obj._plage1_days ||
      obj._plage1_openMorning ||
      obj._plage1_closeMorning ||
      obj._plage1_openAfternoon ||
      obj._plage1_closeAfternoon ||
      obj._plage1_openContinuous ||
      obj._plage1_closeContinuous
  );
  const hasPlage2 = Boolean(
    obj._plage2_days ||
      obj._plage2_openMorning ||
      obj._plage2_closeMorning ||
      obj._plage2_openAfternoon ||
      obj._plage2_closeAfternoon ||
      obj._plage2_openContinuous ||
      obj._plage2_closeContinuous
  );
  if (!obj.horaires && (hasPlage1 || hasPlage2)) {
    const schedules: any[] = [];
    if (hasPlage1) {
      schedules.push({
        days: String(obj._plage1_days || '')
          .split(/[,;/]+/)
          .map(s => s.trim())
          .filter(Boolean),
        fermetureMidi: Boolean(obj._plage1_fermetureMidi),
        openMorning: obj._plage1_openMorning || '09:00',
        closeMorning: obj._plage1_closeMorning || '12:00',
        openAfternoon: obj._plage1_openAfternoon || '14:00',
        closeAfternoon: obj._plage1_closeAfternoon || '18:00',
        openContinuous: obj._plage1_openContinuous || '09:00',
        closeContinuous: obj._plage1_closeContinuous || '17:00',
      });
    }
    if (hasPlage2) {
      schedules.push({
        days: String(obj._plage2_days || '')
          .split(/[,;/]+/)
          .map(s => s.trim())
          .filter(Boolean),
        fermetureMidi: Boolean(obj._plage2_fermetureMidi),
        openMorning: obj._plage2_openMorning || '09:00',
        closeMorning: obj._plage2_closeMorning || '12:00',
        openAfternoon: obj._plage2_openAfternoon || '14:00',
        closeAfternoon: obj._plage2_closeAfternoon || '18:00',
        openContinuous: obj._plage2_openContinuous || '09:00',
        closeContinuous: obj._plage2_closeContinuous || '17:00',
      });
    }
    if (schedules.length > 0) {
      obj.horaires = JSON.stringify(schedules);
    }
  }
  for (const k of Object.keys(obj)) {
    if (k.startsWith('_plage1_') || k.startsWith('_plage2_')) {
      delete obj[k];
    }
  }

  // If main battery expiry column is empty and backup battery expiry column holds the primary expiry date
  if (!obj.peremptionBatterie && obj.peremptionBatterieSecours && !obj.modeleBatterieSecoursId && !obj.lotBatterieSecours) {
    obj.peremptionBatterie = obj.peremptionBatterieSecours;
  }

  // Auto-detect secours / PadPak presence if model, lot, or expiry is populated in the sheet
  if (obj.modeleElectrodeASecoursId || obj.lotElectrodeASecours || obj.peremptionSecoursElectrodeA) {
    obj.hasElectrodeASecours = 'Oui';
  }
  if (obj.lotPadpakA || obj.peremptionPadpakA) {
    obj.hasPadpakA = 'Oui';
  }
  if (obj.modeleElectrodePSecoursId || obj.lotElectrodePSecours || obj.peremptionSecoursElectrodeP) {
    obj.hasElectrodePSecours = 'Oui';
  }
  if (obj.lotPadpakP || obj.peremptionPadpakP) {
    obj.hasPadpakP = 'Oui';
  }
  if (obj.modeleBatterieSecoursId || obj.lotBatterieSecours) {
    obj.hasBatterieSecours = 'Oui';
  }

  // Keep convenient aliases so both table, form, and API work seamlessly
  if (obj.commentaireAdresse) {
    obj.aideAcces = obj.commentaireAdresse;
    obj.aide_acces = obj.commentaireAdresse;
  }
  if (obj.modeleId && !obj.modele) obj.modele = obj.modeleId;
  if (obj.clientNom && !obj.nomSite) obj.nomSite = obj.clientNom;
  if (obj.nomSite && !obj.clientNom) obj.clientNom = obj.nomSite;
  if (isPlaceholderClientValue(obj.clientIdField)) obj.clientIdField = '';
  if (isPlaceholderClientValue(obj.clientId)) obj.clientId = '';
  if (obj.clientIdField && !obj.clientId) obj.clientId = obj.clientIdField;

  const cleanIdent = String(obj.identifiant || '').trim();
  const cleanSn = String(obj.numeroSerie || '').trim();
  obj.id = cleanIdent || cleanSn || `sheet_df_${tenantId}_${rowIndex + 2}`;
  if (!obj.identifiant) obj.identifiant = obj.id;
  if (!obj.numeroSerie) obj.numeroSerie = '';

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

  let parsedSchedules: any[] = [];
  if (defib.horaires) {
    try {
      const parsed = typeof defib.horaires === 'string' ? JSON.parse(defib.horaires) : defib.horaires;
      if (Array.isArray(parsed)) parsedSchedules = parsed;
    } catch (_) {}
  }

  for (const def of DEFIB_CANONICAL_HEADERS) {
    for (let i = 0; i < normHeaders.length; i++) {
      if (!def.aliases.includes(normHeaders[i])) continue;
      let val = defib[def.field];

      if (def.field === 'commentaireAdresse') {
        val = defib.commentaireAdresse ?? defib.aideAcces ?? defib.aide_acces ?? '';
      } else if (def.field.startsWith('_plage1_') || def.field.startsWith('_plage2_')) {
        const idx = def.field.startsWith('_plage1_') ? 0 : 1;
        const prop = def.field.replace(/^_plage[12]_/, '');
        const sched = parsedSchedules[idx];
        if (sched) {
          if (prop === 'days') {
            val = Array.isArray(sched.days) ? sched.days.join(', ') : String(sched.days || '');
          } else {
            val = sched[prop];
          }
        }
      } else if (def.field === 'modeleId' && defib.modele && !String(defib.modele).startsWith('v_')) {
        val = defib.modele;
      } else if (def.field === 'modeleCoffretId' && defib.modeleCoffret && !String(defib.modeleCoffret).startsWith('v_')) {
        val = defib.modeleCoffret;
      } else if (def.field === 'modeleElectrodeAId' && defib.modeleElectrodeA && !String(defib.modeleElectrodeA).startsWith('v_')) {
        val = defib.modeleElectrodeA;
      } else if (def.field === 'modeleElectrodeASecoursId' && defib.modeleElectrodeASecours && !String(defib.modeleElectrodeASecours).startsWith('v_')) {
        val = defib.modeleElectrodeASecours;
      } else if (def.field === 'modeleElectrodePId' && defib.modeleElectrodeP && !String(defib.modeleElectrodeP).startsWith('v_')) {
        val = defib.modeleElectrodeP;
      } else if (def.field === 'modeleElectrodePSecoursId' && defib.modeleElectrodePSecours && !String(defib.modeleElectrodePSecours).startsWith('v_')) {
        val = defib.modeleElectrodePSecours;
      } else if (def.field === 'modeleBatterieId' && defib.modeleBatterie && !String(defib.modeleBatterie).startsWith('v_')) {
        val = defib.modeleBatterie;
      } else if (def.field === 'modeleBatterieSecoursId' && defib.modeleBatterieSecours && !String(defib.modeleBatterieSecours).startsWith('v_')) {
        val = defib.modeleBatterieSecours;
      } else if (def.field === 'clientNom') {
        val = defib.clientNom || defib.nomSite || '';
      }

      if (val !== undefined && val !== null) {
        if (def.type === 'bool') {
          outRow[i] = val ? 'Oui' : 'Non';
        } else if (
          (def.field === 'situationElectrodeA' || def.field === 'situationElectrodeP' || def.field === 'situationBatterie') &&
          normHeaders[i].includes('statut')
        ) {
          const sVal = String(val).trim();
          outRow[i] = sVal === 'Vert' ? 'Conforme' : sVal === 'Orange' ? 'Attention' : sVal === 'Rouge' ? 'Alerte' : sVal;
        } else {
          outRow[i] = String(val);
        }
      }
    }
  }
  return outRow;
}

export function mapRowToAutreMateriel(
  headers: string[],
  row: string[],
  rowIndex: number,
  tenantId: string,
  precomputedMatches?: PrecomputedColumnMatch[]
): any {
  const colMatches = precomputedMatches || buildColumnMatches(headers, AUTRES_CANONICAL_HEADERS);

  const specifiques: Record<string, any> = {};
  const obj: any = {
    envId: tenantId,
    tenantId: tenantId,
    _sheetRowNumber: rowIndex + 2,
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
  for (let m = 0; m < colMatches.length; m++) {
    const { colIdx, def } = colMatches[m];
    matchedColIndices.add(colIdx);
    const rawVal = row[colIdx] !== undefined ? String(row[colIdx]).trim() : '';
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
    } else if (formatted !== '' || def.type === 'yesno' || def.type === 'bool') {
      obj[def.field] = formatted;
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
  if (specifiques.numSerie && !obj.numeroSerie) obj.numeroSerie = specifiques.numSerie;
  if (obj.numeroSerie && !specifiques.numSerie) specifiques.numSerie = obj.numeroSerie;
  if (obj.numeroVoie && !obj.numVoie) obj.numVoie = obj.numeroVoie;
  if (obj.codePostal && !obj.cp) obj.cp = obj.codePostal;
  if (obj.aideAcces && !obj.emplacement) obj.emplacement = obj.aideAcces;
  if (specifiques.emplacements && !obj.emplacement) obj.emplacement = specifiques.emplacements;
  if (specifiques.marqueModele && !obj.modele) obj.modele = specifiques.marqueModele;
  if (obj.expirationGarantie && !obj.finGarantie) obj.finGarantie = obj.expirationGarantie;
  if (obj.dateFabrication && !obj.fabrication) obj.fabrication = obj.dateFabrication;
  if (specifiques.commentaireSpecifique && !obj.commentaire) obj.commentaire = specifiques.commentaireSpecifique;

  const cleanIdent = String(obj.identifiant || '').trim();
  const cleanSn = String(obj.numeroSerie || specifiques.numSerie || '').trim();
  obj.id = cleanIdent || cleanSn || `sheet_am_${tenantId}_${rowIndex + 2}`;
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
    for (let i = 0; i < normHeaders.length; i++) {
      if (!def.aliases.includes(normHeaders[i])) continue;
      let val = def.isSpecifique ? item.specifiques?.[def.field] : item[def.field];
      if (def.field === 'identifiant' && !val && item.id) {
        val = item.id;
      } else if (def.field === 'numeroVoie' && !val) {
        val = item.numVoie;
      } else if (def.field === 'codePostal' && !val) {
        val = item.cp;
      } else if (def.field === 'aideAcces' && !val) {
        val = item.commentaireAdresse || item.emplacement;
      } else if (def.field === 'expirationGarantie' && !val) {
        val = item.finGarantie;
      } else if (def.field === 'dateFabrication' && !val) {
        val = item.fabrication;
      } else if (def.isSpecifique && def.field === 'numSerie' && !val) {
        val = item.numeroSerie;
      } else if (def.isSpecifique && def.field === 'marqueModele' && !val) {
        val = item.modele || item.modeleId;
      } else if (def.isSpecifique && def.field === 'emplacements' && !val) {
        val = item.emplacement || item.aideAcces;
      } else if (def.isSpecifique && def.field === 'commentaireSpecifique' && !val) {
        val = item.commentaire;
      }
      if (val !== undefined && val !== null) {
        if (def.type === 'bool') {
          outRow[i] = val ? 'Oui' : 'Non';
        } else {
          outRow[i] = String(val);
        }
      }
    }
  }
  return outRow;
}

export function isPlaceholderClientValue(v?: string | null): boolean {
  if (!v) return true;
  const s = String(v).trim();
  if (!s) return true;
  return /^(num[eé]ro\s*vierge|information\s*manquante|manquant|non\s*renseign[eé]|inconnu|aucun|n\/?a|-+|0+|nom\s*et\s*pr[eé]nom\s*vierge|tel\s*port\s*vierge)$/i.test(
    s
  );
}

export function mapRowToClient(
  headers: string[],
  row: string[],
  rowIndex: number,
  tenantId: string,
  precomputedMatches?: PrecomputedColumnMatch[]
): any {
  const colMatches = precomputedMatches || buildColumnMatches(headers, CLIENTS_CANONICAL_HEADERS);

  const obj: any = {
    envId: tenantId,
    tenantId: tenantId,
    _sheetRowNumber: rowIndex + 2,
    pays: 'France',
    contrat: 'Non',
    accesPortail: 'Non',
  };

  for (let m = 0; m < colMatches.length; m++) {
    const { colIdx, def } = colMatches[m];
    const rawVal = row[colIdx] !== undefined ? String(row[colIdx]).trim() : '';
    if (def.type === 'yesno') {
      obj[def.field] = normalizeYesNo(rawVal, 'Non');
    } else if (def.type === 'date') {
      const dStr = normalizeDateStr(rawVal);
      if (dStr) obj[def.field] = dStr;
    } else if (rawVal !== '') {
      obj[def.field] = rawVal;
    }
  }

  if (!obj.denomination && row[0] !== undefined && !isPlaceholderClientValue(String(row[0]).trim())) {
    obj.denomination = String(row[0]).trim();
  }
  const cleanClientId = String(obj.clientIdField || '').trim();
  const cleanSiret = String(obj.siret || '').trim();
  const cleanDenom = String(obj.denomination || '').trim();
  const validClientId = !isPlaceholderClientValue(cleanClientId) ? cleanClientId : '';
  const validSiret = !isPlaceholderClientValue(cleanSiret) ? cleanSiret : '';
  const slugDenom = cleanDenom
    ? cleanDenom
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
    : '';

  if (validClientId) {
    obj.id = validClientId;
  } else if (slugDenom && validSiret) {
    obj.id = `cli_${slugDenom}_${validSiret.replace(/[^a-z0-9]/gi, '')}`;
  } else if (slugDenom) {
    obj.id = `cli_${slugDenom}`;
  } else if (validSiret) {
    obj.id = `cli_siret_${validSiret.replace(/[^a-z0-9]/gi, '')}`;
  } else {
    obj.id = `sheet_cli_${tenantId}_${rowIndex + 2}`;
  }
  obj.clientIdField = validClientId;
  if (!obj.denomination) obj.denomination = '';

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
    for (let i = 0; i < normHeaders.length; i++) {
      if (!def.aliases.includes(normHeaders[i])) continue;
      let val = client[def.field];
      if (def.field === 'clientIdField' && !val && client.id && !String(client.id).startsWith('cli_') && !String(client.id).startsWith('sheet_cli_')) {
        val = client.id;
      }
      if (val !== undefined && val !== null) {
        outRow[i] = String(val);
      }
    }
  }
  return outRow;
}

export interface GenericColumnDef {
  header: string;
  field: string;
  aliases: string[];
  type?: 'yesno' | 'bool' | 'date' | 'number' | 'json';
}

function normalizeHeaderKeyStripSubSection(rawHeader: string): string {
  return String(rawHeader || '')
    .replace(/^Section\s*\d+\s*[—–\-:]?\s*/i, '')
    .replace(/^[^:]{1,40}:\s*/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export const GENERIC_CANONICAL_HEADERS: Partial<Record<SheetTabType, GenericColumnDef[]>> = {
  tournees: [
    { header: 'Identifiant de la tournée', field: 'tourIdentifiant', aliases: ['identifiantdelatournee', 'identifianttournee', 'idtournee', 'touridentifiant', 'tourcode', 'codetournee', 'identifiant', 'id', 'reference', 'referencetournee'] },
    { header: 'Titre de la tournée', field: 'title', aliases: ['titredelatournee', 'titretournee', 'nomdelatournee', 'nomtournee', 'titre', 'title', 'name', 'nom', 'intitule'] },
    { header: 'Technicien assigné', field: 'techName', aliases: ['technicienassigne', 'technicien', 'techname', 'collaborateur', 'intervenant', 'membre', 'agent', 'nomtechnicien'] },
    { header: 'Date de la tournée', field: 'startDate', aliases: ['datedelatournee', 'datetournee', 'datededebut', 'datedebut', 'startdate', 'date', 'jour', 'echeance'], type: 'date' },
    { header: 'Date de fin', field: 'endDate', aliases: ['datedefin', 'datefin', 'enddate', 'fin'], type: 'date' },
    { header: 'Statut', field: 'status', aliases: ['statut', 'status', 'etat', 'statutdelatournee', 'avancement'] },
    { header: 'Véhicule / Emplacement', field: 'vehicule', aliases: ['vehiculeemplacement', 'vehicule', 'emplacement', 'locationlink', 'emplacementattribue'] },
    { header: 'Adresse de départ', field: 'startAddress', aliases: ['adressededepart', 'adressedepart', 'startaddress', 'lieudedepart', 'depart'] },
    { header: 'Distance totale (km)', field: 'totalDistance', aliases: ['distancetotalekm', 'distancetotale', 'distancekm', 'distance', 'kilometrage', 'km', 'totaldistance'] },
    { header: 'Durée totale', field: 'totalDuration', aliases: ['dureetotale', 'duree', 'tempsestime', 'totalduration'] },
    { header: 'CO2 préservé', field: 'co2Saved', aliases: ['co2preserve', 'co2', 'co2saved', 'economieco2'] },
    { header: 'Commentaire', field: 'commentaire', aliases: ['commentaire', 'commentaires', 'notes', 'note', 'observation', 'observations'] },
    { header: 'Missions', field: 'missions', aliases: ['missions', 'listemissions'], type: 'json' },
  ],
  missionsTournees: [
    { header: 'Identifiant de la tournée', field: 'tourIdentifiant', aliases: ['identifiantdelatournee', 'identifianttournee', 'idtournee', 'touridentifiant', 'tourid', 'tourcode', 'codetournee', 'tournee', 'tourneeliee', 'rattachementtournee'] },
    { header: 'Référence mission', field: 'interventionReference', aliases: ['referencemission', 'referenceintervention', 'interventionreference', 'identifiantmission', 'idmission', 'reference', 'ref', 'identifiant', 'id', 'numeromission'] },
    { header: 'Autre référence', field: 'autreReference', aliases: ['autrereference', 'referenceexterne', 'refexterne', 'referenceclient'] },
    { header: 'Bon de commande', field: 'bonCommandeId', aliases: ['bondecommande', 'numerobondecommande', 'refbondecommande', 'boncommandeid', 'customboncommande', 'bdc', 'commande'] },
    { header: 'Statut de la mission', field: 'status', aliases: ['statutdelamission', 'statutmission', 'statut', 'status', 'etat', 'avancement'] },
    { header: 'Type d’équipement', field: 'equipmentType', aliases: ['typedequipement', 'typeequipement', 'categorieequipement', 'categorie', 'equipmenttype', 'equipement', 'materiel', 'typemateriel'] },
    { header: 'Identifiant équipement', field: 'defibIdentifiant', aliases: ['identifiantequipement', 'identifiantdefibrillateur', 'identifiantdae', 'identifiantmateriel', 'defibidentifiant', 'defibid', 'equipementlie', 'daelie'] },
    { header: 'Numéro de série', field: 'defibNumeroSerie', aliases: ['numerodeserie', 'numeroserie', 'numserie', 'serie', 'sn', 'serialnumber', 'defibnumeroserie', 'defibserialnumber'] },
    { header: 'Modèle', field: 'modele', aliases: ['modele', 'modeleequipement', 'modeledae', 'marquemodele'] },
    { header: 'Client / Site', field: 'clientName', aliases: ['clientsite', 'client', 'clientname', 'nomclient', 'denominationclient', 'entreprise', 'site', 'nomsite', 'nomdusite', 'etablissement', 'denomination'] },
    { header: 'Client ID', field: 'clientId', aliases: ['clientid', 'idclient', 'identifiantclient', 'codeclient'] },
    { header: 'Motif de la mission', field: 'reason', aliases: ['motifdelamission', 'motifmission', 'motif', 'raison', 'raisondelaprestation', 'raisonprestation', 'reason', 'reasons', 'prestation', 'typeintervention', 'objet', 'motifs'] },
    { header: 'Pièces requises', field: 'requiredParts', aliases: ['piecesrequises', 'pieces', 'consommables', 'equipementsrequis', 'requiredparts', 'materielrequis', 'stocksrequis'] },
    { header: 'Pièces envoyées au client', field: 'sentToClientParts', aliases: ['piecesenvoyeesauclient', 'piecesenvoyees', 'senttoclientparts', 'envoipieces'] },
    { header: 'Priorité', field: 'priority', aliases: ['priorite', 'priority', 'urgence', 'criticite'] },
    { header: 'Date prévue', field: 'estimatedDate', aliases: ['dateprevue', 'dateestimee', 'dateintervention', 'datemission', 'estimateddate', 'scheduleddate', 'date', 'echeance'], type: 'date' },
    { header: 'Créneau horaire', field: 'estimatedSlot', aliases: ['creneauhoraire', 'creneau', 'heure', 'horaire', 'estimatedslot', 'time', 'plagehoraire'] },
    { header: 'Durée prévue (min)', field: 'dureePrestation', aliases: ['dureeprevuemin', 'dureeprevue', 'dureeprestation', 'duree', 'tempsprevu', 'dureemin'] },
    { header: 'Adresse', field: 'clientAddress', aliases: ['adresse', 'clientaddress', 'address', 'numeroetvoie', 'numvoie', 'numerovoie', 'rue', 'lieu', 'localisation'] },
    { header: 'Code postal', field: 'cp', aliases: ['codepostal', 'cp', 'zip'] },
    { header: 'Ville', field: 'ville', aliases: ['ville', 'commune', 'localite', 'city'] },
    { header: 'Pays', field: 'pays', aliases: ['pays', 'country'] },
    { header: 'Latitude', field: 'latitude', aliases: ['latitude', 'lat'] },
    { header: 'Longitude', field: 'longitude', aliases: ['longitude', 'lng', 'lon'] },
    { header: 'Contact sur site', field: 'contact', aliases: ['contactsursite', 'contact', 'nomcontact', 'interlocuteur', 'nometprenom', 'nomprenomsite'] },
    { header: 'Téléphone', field: 'telephone', aliases: ['telephone', 'tel', 'telephonesursite', 'telephonesite', 'phone', 'portable'] },
    { header: 'Email', field: 'email', aliases: ['email', 'mail', 'courriel', 'emailsursite', 'emailsite'] },
    { header: 'Technicien', field: 'techName', aliases: ['technicien', 'techname', 'technicienassigne', 'collaborateur', 'intervenant'] },
    { header: 'Commentaire', field: 'commentaire', aliases: ['commentaire', 'commentaires', 'notes', 'observation', 'remarques', 'refusalcomment', 'motifrefus', 'clientrefusalcomment'] },
    { header: 'Identifiant formation', field: 'formationId', aliases: ['identifiantformation', 'formationid', 'idformation'] },
  ],
  crm: [
    { header: 'ID', field: 'id', aliases: ['id', 'identifiantticket', 'numeroticket', 'reference', 'refticket', 'ticketid'] },
    { header: 'Type CRM', field: 'crmCategory', aliases: ['typecrm', 'crmcategory', 'typedeticket', 'typeticket', 'compartiment'] },
    { header: 'Client / Entreprise', field: 'entreprise', aliases: ['cliententreprise', 'entreprise', 'client', 'denomination', 'societe', 'nomclient', 'clientlie'] },
    { header: 'Client ID', field: 'clientId', aliases: ['clientid', 'idclient', 'identifiantclient'] },
    { header: 'Identifiant Matériel', field: 'identifiant', aliases: ['identifiantmateriel', 'identifiantequipement', 'identifiantdae', 'identifiantdefibrillateur', 'identifiant', 'materiellie', 'equipementlie'] },
    { header: 'Type de matériel', field: 'materialType', aliases: ['typedemateriel', 'typemateriel', 'typeequipement', 'materialtype'] },
    { header: 'Objet', field: 'objet', aliases: ['objet', 'sujet', 'titre', 'objetduticket', 'intitule'] },
    { header: 'Statut', field: 'status', aliases: ['statut', 'status', 'etat', 'avancement'] },
    { header: 'Criticité', field: 'criticite', aliases: ['criticite', 'priorite', 'urgence', 'niveau'] },
    { header: 'Catégorie', field: 'categorie', aliases: ['categorie', 'categorieduticket', 'motif', 'raison'] },
    { header: 'Collaborateur assigné', field: 'collaborateur', aliases: ['collaborateurassigne', 'collaborateur', 'assignea', 'responsable', 'agent', 'membre', 'technicien'] },
    { header: 'Date création', field: 'date', aliases: ['datecreation', 'datedecreation', 'date', 'horodatage', 'createdat'] },
    { header: 'Contact Nom & Prénom', field: 'nomPrenom', aliases: ['contactnometprenom', 'contactnomprenom', 'nometprenom', 'nomprenom', 'contact', 'demandeur', 'interlocuteur'] },
    { header: 'Email', field: 'email', aliases: ['email', 'mail', 'courriel', 'emailcontact', 'emailclient'] },
    { header: 'Téléphone', field: 'telephone', aliases: ['telephone', 'tel', 'phone', 'portable', 'telephonecontact'] },
    { header: 'Message / Description', field: 'message', aliases: ['messagedescription', 'message', 'description', 'contenu', 'demande', 'details'] },
    { header: 'Commentaire Interne', field: 'commentaireInterne', aliases: ['commentaireinterne', 'noteinterne', 'notesinternes', 'commentaire', 'observations'] },
    { header: 'Réponse envoyée', field: 'reponse', aliases: ['reponseenvoyee', 'reponse', 'reponseclient', 'solution'] },
    { header: 'Montant Estimé HT (€)', field: 'montantEstime', aliases: ['montantestimeht', 'montantestime', 'montant', 'budget', 'valeurht'] },
    { header: 'Probabilité (%)', field: 'probabilite', aliases: ['probabilite', 'chances', 'tauxconversion'] },
    { header: 'Date relance / Échéance', field: 'dateRelance', aliases: ['daterelanceecheance', 'daterelance', 'echeance', 'relance', 'prochainerelance'], type: 'date' },
    { header: 'Source Opportunité', field: 'sourceOpportunite', aliases: ['sourceopportunite', 'source', 'origine', 'canal'] },
    { header: 'Référence Devis', field: 'referenceDevis', aliases: ['referencedevis', 'refdevis', 'numerodevis', 'devislie'] },
    { header: 'Photographie / Pièce jointe', field: 'photoDataUrl', aliases: ['photographiepiecejointe', 'photodataurl', 'photo', 'piecejointe', 'image', 'fichier'] },
  ],
  satisfaction: [
    { header: 'ID', field: 'id', aliases: ['id', 'identifiant', 'reference', 'idavis'] },
    { header: 'Client', field: 'clientName', aliases: ['client', 'clientname', 'entreprise', 'nomclient', 'denomination', 'societe'] },
    { header: 'Collaborateur', field: 'collaboratorName', aliases: ['collaborateur', 'collaboratorname', 'technicien', 'intervenant', 'membre', 'agent'] },
    { header: 'Note', field: 'rating', aliases: ['note', 'note5', 'notesur5', 'rating', 'evaluation', 'etoiles', 'score', 'satisfaction'], type: 'number' },
    { header: 'Commentaire', field: 'comment', aliases: ['commentaire', 'comment', 'avis', 'message', 'retour', 'observation', 'temoignage'] },
    { header: 'Mission liée', field: 'missionRef', aliases: ['missionliee', 'missionref', 'mission', 'referencemission', 'intervention', 'referenceintervention'] },
    { header: 'Date', field: 'date', aliases: ['date', 'dateavis', 'horodatage', 'createdat'], type: 'date' },
  ],
  achatsFournisseurs: [
    { header: 'ID', field: 'id', aliases: ['id', 'identifiant', 'idachat'] },
    { header: 'Référence', field: 'reference', aliases: ['reference', 'referenceinterne', 'ref', 'refinterne', 'codeachat', 'numeroachat'] },
    { header: 'Référence de commande fournisseur', field: 'orderRef', aliases: ['referencedecommandefournisseur', 'referencecommandefournisseur', 'refcommande', 'refcommandefournisseur', 'orderref', 'numerocommande', 'numerodecommande', 'bondecommande'] },
    { header: 'Sélection du fournisseur', field: 'supplierName', aliases: ['selectiondufournisseur', 'selectionfournisseur', 'fournisseur', 'nomdufournisseur', 'nomfournisseur', 'suppliername', 'entreprise', 'societe'] },
    { header: 'ID Fournisseur', field: 'supplierId', aliases: ['idfournisseur', 'identifiantfournisseur', 'supplierid', 'codefournisseur'] },
    { header: 'Commentaire', field: 'comment', aliases: ['commentaire', 'comment', 'notes', 'observation', 'description', 'remarques'] },
    { header: 'Date', field: 'date', aliases: ['date', 'datedecommande', 'datecommande', 'dateachat', 'createdat'], type: 'date' },
    { header: 'Fichier de la commande (PDF)', field: 'pdfFileName', aliases: ['fichierdelacommandepdf', 'fichiercommande', 'fichierpdf', 'nomdufichier', 'pdffilename', 'document'] },
    { header: 'URL du fichier', field: 'pdfDataUrl', aliases: ['urldufichier', 'urlfichier', 'lienpdf', 'pdfdataurl', 'urlpdf', 'fichierurl', 'lien'] },
  ],
  temps: [
    { header: 'ID', field: 'id', aliases: ['id', 'identifiant', 'idpointage', 'reference'] },
    { header: 'Technicien', field: 'techName', aliases: ['technicien', 'techname', 'collaborateur', 'employe', 'membre', 'nom', 'nometprenom', 'intervenant'] },
    { header: 'Date', field: 'startDate', aliases: ['date', 'startdate', 'datedebut', 'datededebut', 'jour', 'datepointage'], type: 'date' },
    { header: 'Début Journée', field: 'startTime', aliases: ['debutjournee', 'starttime', 'heuredebut', 'heurededebut', 'debut', 'entree'] },
    { header: 'Date Fin', field: 'endDate', aliases: ['datefin', 'datedefin', 'enddate'], type: 'date' },
    { header: 'Fin Journée', field: 'endTime', aliases: ['finjournee', 'endtime', 'heurefin', 'heuredefin', 'fin', 'sortie'] },
    { header: 'Amplitude Journée', field: 'durationSeconds', aliases: ['amplitudejournee', 'amplitude', 'duree', 'dureejournee', 'durationseconds', 'tempstravail', 'totaljournee'] },
    { header: 'Temps Trajet Matin', field: 'trajetMatin', aliases: ['tempstrajetmatin', 'trajetmatin', 'trajetaller'] },
    { header: 'Temps Trajet Soir', field: 'trajetSoir', aliases: ['tempstrajetsoir', 'trajetsoir', 'trajetretour'] },
    { header: 'Temps Repas', field: 'tempsRepas', aliases: ['tempsrepas', 'repas', 'pauserepas', 'pausemidi', 'pause'] },
    { header: 'Temps Administratif/Autres', field: 'tempsAdmin', aliases: ['tempsadministratifautres', 'tempsadministratif', 'tempsadmin', 'administratif', 'autres'] },
    { header: 'Commentaires', field: 'comment', aliases: ['commentaires', 'commentaire', 'comment', 'notes', 'observation', 'remarques'] },
    { header: 'En cours', field: 'isOngoing', aliases: ['encours', 'isongoing', 'statut', 'actif'], type: 'bool' },
  ],
  ticketsCaisse: [
    { header: 'ID', field: 'id', aliases: ['id', 'identifiant', 'idticket', 'reference'] },
    { header: 'Employé', field: 'user', aliases: ['employe', 'user', 'collaborateur', 'technicien', 'membre', 'nom', 'nometprenom', 'declarant'] },
    { header: 'Entreprise ou objet', field: 'merchant', aliases: ['entrepriseouobjet', 'objet', 'merchant', 'commercant', 'enseigne', 'fournisseur', 'libelle', 'intitule', 'entreprise'] },
    { header: 'Date', field: 'date', aliases: ['date', 'dateticket', 'datedepense', 'jour'], type: 'date' },
    { header: 'Total HT (€)', field: 'amountHT', aliases: ['totalht', 'totalhteuro', 'montantht', 'ht', 'amountht', 'prixht'], type: 'number' },
    { header: 'Total TVA (€)', field: 'tva', aliases: ['totaltva', 'totaltvaeuro', 'montanttva', 'tva', 'taxe'], type: 'number' },
    { header: 'Total TTC (€)', field: 'amount', aliases: ['totalttc', 'totalttceuro', 'montantttc', 'ttc', 'amount', 'montant', 'total', 'prixttc'], type: 'number' },
    { header: 'Catégorie', field: 'category', aliases: ['categorie', 'category', 'type', 'typedepense', 'nature'] },
    { header: 'Statut', field: 'status', aliases: ['statut', 'status', 'etat', 'validation'] },
    { header: 'Photographie ou fichier du justificatif', field: 'receiptUrl', aliases: ['photographieoufichierdujustificatif', 'justificatif', 'photo', 'photographie', 'fichier', 'receipturl', 'image', 'ticket', 'piecejointe'] },
  ],
  releveConcurrentiel: [
    { header: 'ID', field: 'id', aliases: ['id', 'identifiant', 'idreleve', 'reference'] },
    { header: 'Commune', field: 'commune', aliases: ['commune', 'ville', 'entreprise', 'client', 'collectivite', 'etablissement', 'organisme', 'nom'] },
    { header: 'Volume', field: 'volume', aliases: ['volume', 'quantite', 'nombre', 'nbdae', 'nombredefibrillateurs', 'parc', 'tailleparc'], type: 'number' },
    { header: 'Mainteneur', field: 'mainteneurActuel', aliases: ['mainteneur', 'mainteneuractuel', 'concurrent', 'prestataire', 'prestataireactuel', 'fournisseuractuel'] },
    { header: 'Prochaine Maint.', field: 'prochaineMaintenance', aliases: ['prochainemaint', 'prochainemaintenance', 'echeance', 'dateecheance', 'fincontrat', 'renouvellement', 'dateprochainemaintenance'], type: 'date' },
    { header: 'Contact', field: 'contactNomPrenom', aliases: ['contact', 'contactnomprenom', 'nometprenom', 'nomprenom', 'interlocuteur', 'responsable'] },
    { header: 'Email', field: 'contactEmail', aliases: ['email', 'contactemail', 'mail', 'courriel', 'emailcontact'] },
    { header: 'Téléphone', field: 'contactTelephone', aliases: ['telephone', 'contacttelephone', 'tel', 'phone', 'portable', 'telephonecontact'] },
    { header: 'Date de relevé', field: 'createdAt', aliases: ['datedereleve', 'datereleve', 'createdat', 'date', 'datecreation'], type: 'date' },
  ],
  messagesInternes: [
    { header: 'ID', field: 'id', aliases: ['id', 'identifiant', 'idmessage'] },
    { header: 'Expéditeur', field: 'authorName', aliases: ['expediteur', 'sender', 'authorname', 'auteur', 'collaborateur', 'utilisateur', 'membre', 'nom', 'de'] },
    { header: 'Email', field: 'authorEmail', aliases: ['email', 'authoremail', 'mail', 'courriel'] },
    { header: 'Rôle', field: 'role', aliases: ['role', 'fonction', 'statut', 'poste'] },
    { header: 'Canal', field: 'tag', aliases: ['canal', 'channel', 'tag', 'destinataire', 'conversation', 'sujet'] },
    { header: 'Message', field: 'content', aliases: ['message', 'text', 'content', 'texte', 'contenu', 'corps'] },
    { header: 'Date & Heure', field: 'dateStr', aliases: ['dateheure', 'dateetheure', 'datestr', 'heure', 'time', 'horaire', 'horodatage', 'date'] },
    { header: 'Timestamp', field: 'createdAt', aliases: ['timestamp', 'createdat'] },
  ],
  ged: [
    { header: 'ID', field: 'id', aliases: ['id', 'identifiant', 'iddocument', 'reference'] },
    { header: 'Titre', field: 'title', aliases: ['titre', 'title', 'nom', 'nomdudocument', 'intitule', 'libelle', 'document'] },
    { header: 'Catégorie', field: 'category', aliases: ['categorie', 'category', 'type', 'typededocument', 'dossier', 'classement'] },
    { header: 'Date', field: 'date', aliases: ['date', 'datedajout', 'datecreation', 'createdat'], type: 'date' },
    { header: 'URL Google Drive du document (Lien partagé)', field: 'fileUrl', aliases: ['urlgoogledrivedudocumentlienpartage', 'urlgoogledrive', 'liengoogledrive', 'urldocument', 'fileurl', 'url', 'lien', 'lienpartage', 'fichier', 'telechargementdufichier'] },
    { header: 'Nom du fichier', field: 'fileName', aliases: ['nomdufichier', 'filename', 'fichiernom'] },
    { header: 'Taille', field: 'fileSize', aliases: ['taille', 'filesize', 'poids'] },
  ],
  intituleEmplacements: [
    { header: 'Entrepôt A', field: 'Entrepôt A', aliases: ['entrepota'] },
    { header: 'Entrepôt B', field: 'Entrepôt B', aliases: ['entrepotb'] },
    { header: 'Entrepôt C', field: 'Entrepôt C', aliases: ['entrepotc'] },
    { header: 'Entrepôt D', field: 'Entrepôt D', aliases: ['entrepotd'] },
    { header: 'Entrepôt E', field: 'Entrepôt E', aliases: ['entrepote'] },
    { header: 'Entrepôt F', field: 'Entrepôt F', aliases: ['entrepotf'] },
    { header: 'Entrepôt G', field: 'Entrepôt G', aliases: ['entrepotg'] },
    { header: 'Entrepôt H', field: 'Entrepôt H', aliases: ['entrepoth'] },
    { header: 'Entrepôt I', field: 'Entrepôt I', aliases: ['entrepoti'] },
    { header: 'Entrepôt J', field: 'Entrepôt J', aliases: ['entrepotj'] },
    { header: 'Véhicule A', field: 'Véhicule A', aliases: ['vehiculea'] },
    { header: 'Véhicule B', field: 'Véhicule B', aliases: ['vehiculeb'] },
    { header: 'Véhicule C', field: 'Véhicule C', aliases: ['vehiculec'] },
    { header: 'Véhicule D', field: 'Véhicule D', aliases: ['vehiculed'] },
    { header: 'Véhicule E', field: 'Véhicule E', aliases: ['vehiculee'] },
    { header: 'Véhicule F', field: 'Véhicule F', aliases: ['vehiculef'] },
    { header: 'Véhicule G', field: 'Véhicule G', aliases: ['vehiculeg'] },
    { header: 'Véhicule H', field: 'Véhicule H', aliases: ['vehiculeh'] },
    { header: 'Véhicule I', field: 'Véhicule I', aliases: ['vehiculei'] },
    { header: 'Véhicule J', field: 'Véhicule J', aliases: ['vehiculej'] },
    { header: 'Emplacement', field: 'emplacement', aliases: ['emplacement', 'emplacementpardefaut', 'codeemplacement'] },
    { header: 'Intitulé', field: 'intitule', aliases: ['intitule', 'intitulepersonnalise', 'nompersonnalise', 'nom', 'valeur'] },
  ],
  membresEnvironnement: [
    { header: 'Nom et prénom', field: 'name', aliases: ['nometprenom', 'nomprenom', 'nom', 'name', 'collaborateur', 'membre', 'utilisateur'] },
    { header: 'Email', field: 'email', aliases: ['email', 'mail', 'courriel', 'adresseemail', 'identifiant'] },
    { header: 'Rôle', field: 'role', aliases: ['role', 'profil', 'typeutilisateur', 'statutrole'] },
    { header: 'PIN d’accès / Mot de passe', field: 'pin', aliases: ['pindaccesmotdepasse', 'pindacces', 'pinacces', 'motdepasse', 'pin', 'codepin', 'code', 'password'] },
    { header: 'Métier / Type de rôle', field: 'adminSubRole', aliases: ['metiertypederole', 'metier', 'typederole', 'typerole', 'adminsubrole', 'fonction', 'service', 'sousrole'] },
    { header: 'Emplacement attribué', field: 'locationLink', aliases: ['emplacementattribue', 'emplacement', 'locationlink', 'vehicule', 'entrepot'] },
    { header: 'Numéro et voie', field: 'startAddressStreet', aliases: ['numeroetvoie', 'numerovoie', 'numvoie', 'rue', 'startaddressstreet', 'adressededepart', 'adresse'] },
    { header: 'Ville', field: 'startAddressCity', aliases: ['ville', 'commune', 'startaddresscity', 'villedepart'] },
    { header: 'Code postal', field: 'startAddressZip', aliases: ['codepostal', 'cp', 'zip', 'startaddresszip'] },
    { header: 'Région', field: 'startAddressRegion', aliases: ['region', 'startaddressregion'] },
    { header: 'Pays', field: 'startAddressCountry', aliases: ['pays', 'country', 'startaddresscountry'] },
    { header: 'Latitude', field: 'startAddressLat', aliases: ['latitude', 'lat', 'startaddresslat'], type: 'number' },
    { header: 'Longitude', field: 'startAddressLng', aliases: ['longitude', 'lng', 'lon', 'startaddresslng'], type: 'number' },
    { header: "Préférence d'optimisation", field: 'optimizationPreference', aliases: ['preferencedoptimisation', 'preferenceoptimisation', 'optimizationpreference', 'optimisation'] },
    { header: 'Semaine typique', field: 'semaineTypique', aliases: ['semainetypique', 'horaires', 'plageshoraires', 'planning'], type: 'json' },
    { header: "Périodes d'indisponibilité", field: 'absences', aliases: ['periodesdindisponibilite', 'periodeindisponibilite', 'indisponibilites', 'indisponibilite', 'absences', 'conges'], type: 'json' },
    // Flat columns for Semaine typique Plage 1 & Plage 2
    { header: 'Semaine typique 1 - Fermeture le midi', field: '_st1_fermetureMidi', aliases: ['semainetypique1fermeturelemidi', 'plage1fermeturelemidi', 'semainetypique1fermeturelemidi4plages', 'plage1fermeturelemidi4plages'] },
    { header: 'Semaine typique 1 - Ouvert pour missions', field: '_st1_openForMissions', aliases: ['semainetypique1ouvertpourmissions', 'plage1ouvertpourmissions'] },
    { header: 'Semaine typique 1 - Deb. Matin', field: '_st1_openMorning', aliases: ['semainetypique1debmatin', 'semainetypique1debutmatin', 'plage1debmatin', 'plage1debutmatin'] },
    { header: 'Semaine typique 1 - Fin. Matin', field: '_st1_closeMorning', aliases: ['semainetypique1finmatin', 'plage1finmatin'] },
    { header: 'Semaine typique 1 - Deb. Apr-M', field: '_st1_openAfternoon', aliases: ['semainetypique1debaprm', 'semainetypique1debutapresmidi', 'plage1debaprm', 'plage1debutapresmidi'] },
    { header: 'Semaine typique 1 - Fin. Apr-M', field: '_st1_closeAfternoon', aliases: ['semainetypique1finaprm', 'semainetypique1finapresmidi', 'plage1finaprm', 'plage1finapresmidi'] },
    { header: 'Semaine typique 1 - Début', field: '_st1_openContinuous', aliases: ['semainetypique1debut', 'plage1debut'] },
    { header: 'Semaine typique 1 - Fin', field: '_st1_closeContinuous', aliases: ['semainetypique1fin', 'plage1fin'] },
    { header: 'Semaine typique 1 - Jours concernés', field: '_st1_days', aliases: ['semainetypique1joursconcernes', 'plage1joursconcernes', 'semainetypique1jours', 'plage1jours'] },
    { header: 'Semaine typique 1 - Commentaire court', field: '_st1_commentaire', aliases: ['semainetypique1commentairecourt', 'semainetypique1commentaire', 'plage1commentairecourt', 'plage1commentaire'] },
    { header: 'Semaine typique 2 - Fermeture le midi', field: '_st2_fermetureMidi', aliases: ['semainetypique2fermeturelemidi', 'plage2fermeturelemidi', 'semainetypique2fermeturelemidi4plages', 'plage2fermeturelemidi4plages'] },
    { header: 'Semaine typique 2 - Ouvert pour missions', field: '_st2_openForMissions', aliases: ['semainetypique2ouvertpourmissions', 'plage2ouvertpourmissions'] },
    { header: 'Semaine typique 2 - Deb. Matin', field: '_st2_openMorning', aliases: ['semainetypique2debmatin', 'semainetypique2debutmatin', 'plage2debmatin', 'plage2debutmatin'] },
    { header: 'Semaine typique 2 - Fin. Matin', field: '_st2_closeMorning', aliases: ['semainetypique2finmatin', 'plage2finmatin'] },
    { header: 'Semaine typique 2 - Deb. Apr-M', field: '_st2_openAfternoon', aliases: ['semainetypique2debaprm', 'semainetypique2debutapresmidi', 'plage2debaprm', 'plage2debutapresmidi'] },
    { header: 'Semaine typique 2 - Fin. Apr-M', field: '_st2_closeAfternoon', aliases: ['semainetypique2finaprm', 'semainetypique2finapresmidi', 'plage2finaprm', 'plage2finapresmidi'] },
    { header: 'Semaine typique 2 - Début', field: '_st2_openContinuous', aliases: ['semainetypique2debut', 'plage2debut'] },
    { header: 'Semaine typique 2 - Fin', field: '_st2_closeContinuous', aliases: ['semainetypique2fin', 'plage2fin'] },
    { header: 'Semaine typique 2 - Jours concernés', field: '_st2_days', aliases: ['semainetypique2joursconcernes', 'plage2joursconcernes', 'semainetypique2jours', 'plage2jours'] },
    { header: 'Semaine typique 2 - Commentaire court', field: '_st2_commentaire', aliases: ['semainetypique2commentairecourt', 'semainetypique2commentaire', 'plage2commentairecourt', 'plage2commentaire'] },
    // Flat columns for Périodes d'indisponibilité 1 & 2
    { header: 'Indisponibilité 1 - Date début', field: '_abs1_startDate', aliases: ['indisponibilite1datedebut', 'periodeindisponibilite1datedebut', 'periodedindisponibilite1datedebut', 'absence1datedebut', 'periode1datedebut'] },
    { header: 'Indisponibilité 1 - Date fin', field: '_abs1_endDate', aliases: ['indisponibilite1datefin', 'periodeindisponibilite1datefin', 'periodedindisponibilite1datefin', 'absence1datefin', 'periode1datefin'] },
    { header: 'Indisponibilité 1 - Commentaire court', field: '_abs1_commentaire', aliases: ['indisponibilite1commentairecourt', 'indisponibilite1commentaire', 'periodeindisponibilite1commentairecourt', 'periodedindisponibilite1commentairecourt', 'absence1commentaire', 'periode1commentairecourt'] },
    { header: 'Indisponibilité 2 - Date début', field: '_abs2_startDate', aliases: ['indisponibilite2datedebut', 'periodeindisponibilite2datedebut', 'periodedindisponibilite2datedebut', 'absence2datedebut', 'periode2datedebut'] },
    { header: 'Indisponibilité 2 - Date fin', field: '_abs2_endDate', aliases: ['indisponibilite2datefin', 'periodeindisponibilite2datefin', 'periodedindisponibilite2datefin', 'absence2datefin', 'periode2datefin'] },
    { header: 'Indisponibilité 2 - Commentaire court', field: '_abs2_commentaire', aliases: ['indisponibilite2commentairecourt', 'indisponibilite2commentaire', 'periodeindisponibilite2commentairecourt', 'periodedindisponibilite2commentairecourt', 'absence2commentaire', 'periode2commentairecourt'] },
  ],
  reglages: [
    { header: 'Langue et région du logiciel', field: 'langue', aliases: ['langueetregiondulogiciel', 'langueetregion', 'langue', 'language', 'localisation', 'regionlogiciel'] },
    { header: 'Nom commercial', field: 'name', aliases: ['nomcommercial', 'name', 'nomentreprise', 'entreprise', 'denomination', 'raisonsociale'] },
    { header: 'URL source du logo', field: 'logo', aliases: ['urlsourcedulogo', 'urllogo', 'logo', 'logosource', 'lienlogo'] },
    { header: 'URL du site internet', field: 'website', aliases: ['urldusiteinternet', 'urlsiteinternet', 'siteinternet', 'siteweb', 'website', 'urlsite'] },
    { header: 'Email de l’entreprise', field: 'email', aliases: ['emaildelentreprise', 'emailentreprise', 'email', 'mail', 'courriel'] },
    { header: 'Téléphone de l’entreprise', field: 'phone', aliases: ['telephonedelentreprise', 'telephoneentreprise', 'telephone', 'phone', 'tel'] },
    { header: 'Nom du logiciel', field: 'nomLogiciel', aliases: ['nomdulogiciel', 'nomlogiciel', 'logiciel', 'appname'] },
    { header: 'Lien vers les conditions légales', field: 'conditionsLegalesLink', aliases: ['lienverslesconditionslegales', 'conditionslegaleslink', 'conditionslegales', 'cgu', 'cgv', 'liencgv'] },
    { header: 'Mentions légales pour les pièces comptables', field: 'mentionsLegalesFactures', aliases: ['mentionslegalespourlespiecescomptables', 'mentionslegalesfactures', 'mentionslegales', 'mentionscomptables', 'pieddepagefacture'] },
    { header: 'Gmail Partage Localisation', field: 'gmailPartageLocalisation', aliases: ['gmailpartagelocalisation', 'gmailpartage', 'emailpartagelocalisation', 'partagelocalisation'] },
    { header: 'Activer le texte invitant le client à laisser un avis (mesure de satisfaction)', field: 'enableSatisfactionAvis', aliases: ['activerletexteinvitantleclientalaisserunavismesuredesatisfaction', 'activeravisclient', 'enablesatisfactionavis', 'mesuredesatisfaction', 'avissatisfaction'], type: 'yesno' },
    { header: "Activer l'infogérance et la maintenance de d'autres types d'équipements", field: 'enableOtherEquipments', aliases: ['activerlinfogeranceetlamaintenancededautrestypesdequipements', 'activerautrestypesequipements', 'activerautresmateriels', 'enableotherequipments', 'autresmateriels'], type: 'yesno' },
    { header: 'Activer les emails automatiques destinés aux clients', field: 'enableAutoEmails', aliases: ['activerlesemailsautomatiquesdestinesauxclients', 'activeremailsautomatiques', 'emailsautomatiques', 'enableautoemails'], type: 'yesno' },
    { header: 'Utiliser Commandes sur Defibeo', field: 'enableDevisFactures', aliases: ['utilisercommandessurdefibeo', 'utilisercommandes', 'enabledevisfactures', 'commandesdefibeo', 'devisetfactures'], type: 'yesno' },
    { header: 'Désactiver les aides et tutoriels', field: 'disableHelpsAndTutorials', aliases: ['desactiverlesaidesettutoriels', 'desactiveraidestutoriels', 'disablehelpsandtutorials', 'aidestutoriels'], type: 'yesno' },
    { header: 'Personnaliser la visibilité des onglets', field: 'hiddenTabs', aliases: ['personnaliserlavisibilitedesonglets', 'visibilitedesonglets', 'visibiliteonglets', 'ongletsmasques', 'hiddentabs', 'onglets'] },
  ],
  apparenceRapportsPdf: [
    { header: 'Image source d’entête pour illustration', field: 'pdfHeaderImg', aliases: ['imagesourcedentetepourillustration', 'imagesourceentete', 'imageentete', 'pdfheaderimg', 'illustrationentete'] },
    { header: 'Texte d’entête de page', field: 'pdfPageHeaderText', aliases: ['textedentetedepage', 'texteentetedepage', 'texteentete', 'pdfpageheadertext', 'entetedepage'] },
    { header: 'Texte de bas de page', field: 'pdfPageFooterText', aliases: ['textedebasdepage', 'textebasdepage', 'pieddepage', 'pdfpagefootertext', 'basdepage'] },
    { header: 'Texte d’information dernière page', field: 'pdfLastPageInfoText', aliases: ['textedinformationdernierepage', 'texteinformationdernierepage', 'textedernierepage', 'pdflastpageinfotext', 'dernierepage'] },
    { header: "Couleur d'arrière plan des entêtes des sections", field: 'pdfHeaderBgColor', aliases: ['couleurdarriereplandesentetesdessections', 'couleurarriereplanentetes', 'couleurentetes', 'pdfheaderbgcolor'] },
    { header: 'Couleur de bordure des sections', field: 'pdfCardBorderColor', aliases: ['couleurdeborduredessections', 'couleurborduresections', 'couleurbordure', 'pdfcardbordercolor'] },
    { header: "Couleur d'arrière plan des sections", field: 'pdfCardBgColor', aliases: ['couleurdarriereplandessections', 'couleurarriereplansections', 'couleurfondsections', 'pdfcardbgcolor'] },
    { header: 'Couleur du texte des labels des champs', field: 'pdfLabelTextColor', aliases: ['couleurdutextedeslabelsdeschamps', 'couleurtextelabels', 'couleurlabels', 'pdflabeltextcolor'] },
    { header: 'Masquer les champs concernant l’Électrode Adulte ou Mixte (A) de secours', field: 'pdfHideElectrodeSecoursA', aliases: ['masquerleschampsconcernantlelectrodeadulteoumixteadesecours', 'masquerelectrodeadultesecours', 'masquerelectrodeasecours', 'pdfhideelectrodesecoursa'], type: 'yesno' },
    { header: 'Masquer les champs concernant l’Électrode Pédiatrique (P) de secours', field: 'pdfHideElectrodeSecoursP', aliases: ['masquerleschampsconcernantlelectrodepediatriquepdesecours', 'masquerelectrodepediatriquesecours', 'masquerelectrodepsecours', 'pdfhideelectrodesecoursp'], type: 'yesno' },
    { header: 'Masquer l’inventaire du Kit/Trousse de secours', field: 'pdfHideKitSecours', aliases: ['masquerlinventairedukittroussedesecours', 'masquerinventairekitsecours', 'masquerkitsecours', 'pdfhidekitsecours'], type: 'yesno' },
    { header: 'Simplifier les champs du Coffret/Boîtier', field: 'pdfSimplifyCoffret', aliases: ['simplifierleschampsducoffretboitier', 'simplifiercoffretboitier', 'simplifiercoffret', 'pdfsimplifycoffret'], type: 'yesno' },
    { header: 'Masquer la section Vérifications techniques', field: 'pdfHideVerificationsTechniques', aliases: ['masquerlasectionverificationstechniques', 'masquerverificationstechniques', 'pdfhideverificationstechniques'], type: 'yesno' },
    { header: 'Masquer les horodatages de Début et Fin d’intervention à la section Diagnostic et Clôture', field: 'pdfHideHorodatagesDiagnostic', aliases: ['masquerleshorodatagesdedebutetfindinterventionalasectiondiagnosticetcloture', 'masquerhorodatagesdiagnostic', 'masquerhorodatages', 'pdfhidehorodatagesdiagnostic'], type: 'yesno' },
    { header: 'Afficher les informations sur la demande de devis à la section Diagnostic et clôture', field: 'pdfShowDemandeDevisDetails', aliases: ['afficherlesinformationssurlademandededevisalasectiondiagnosticetcloture', 'afficherdemandededevis', 'pdfshowdemandedevisdetails'], type: 'yesno' },
  ],
  communicationPortailClient: [
    { header: 'Message à afficher', field: 'communicationPortailClient', aliases: ['messageaafficher', 'message', 'communicationportailclient', 'texte', 'annonce', 'communication', 'informationclient', 'messageportailclient'] },
  ],
  observateurActionsSuspectes: [
    { header: 'ID', field: 'id', aliases: ['id', 'identifiant', 'idtrace', 'reference'] },
    { header: 'Date & Heure', field: 'timestamp', aliases: ['dateheure', 'dateetheure', 'horodatage', 'timestamp', 'date', 'createdat'] },
    { header: 'Utilisateur', field: 'userName', aliases: ['utilisateur', 'username', 'collaborateur', 'membre', 'auteur', 'nom'] },
    { header: 'Adresse IP', field: 'userIp', aliases: ['adresseip', 'userip', 'ip', 'iputilisateur'] },
    { header: 'Type d’action', field: 'actionType', aliases: ['typedaction', 'typeaction', 'actiontype', 'categorie', 'type', 'action'] },
    { header: 'Observateur - Événement', field: 'message', aliases: ['evenement', 'message', 'description', 'trace', 'detail', 'details', 'intitule', 'actioneffectuee'] },
  ],
  rapportsPdf: [
    // Section 0 - Configuration
    { header: 'Section 0 - Référence intervention', field: 'interventionReference', aliases: ['section0referenceintervention', 'referenceintervention', 'interventionreference', 'reportnumber', 'numerorapport', 'idrapport', 'reference', 'id'] },
    { header: 'Section 0 - Autre référence', field: 'autreReference', aliases: ['section0autrereference', 'autrereference'] },
    { header: 'Section 0 - Équipement sélectionné', field: 'selectedEquipmentLabel', aliases: ['section0equipementselectionne', 'equipementselectionne', 'selectedequipmentlabel'] },
    { header: 'Section 0 - Nouveau matériel créé (Type)', field: 'createdEquipmentType', aliases: ['section0nouveaumaterielcreetype', 'nouveaumaterielcreetype', 'nouveaumateriel', 'createdequipmenttype'] },
    { header: 'Section 0 - Titre du document', field: 'reportTitle', aliases: ['section0titredudocument', 'titredudocument', 'reporttitle', 'titrerapport'] },
    { header: 'Section 0 - Raison(s) de la prestation', field: 'reasons', aliases: ['section0raisonsdelaprestation', 'raisonsdelaprestation', 'raisondelaprestation', 'reasons', 'reason', 'typeintervention', 'motif'] },
    { header: 'Section 0 - Technicien', field: 'techName', aliases: ['section0technicien', 'technicien', 'techname', 'intervenant', 'redacteur'] },
    { header: 'Section 0 - Horodatage entrant', field: 'date', aliases: ['section0horodatageentrant', 'horodatageentrant', 'dateintervention', 'datemaintenance', 'dernieremaintenance', 'date', 'datestr'] },
    { header: 'Section 0 - Site de la mission', field: 'missionSite', aliases: ['section0sitedelamission', 'sitedelamission', 'missionsite'] },
    { header: 'Section 0 - Bon de commande', field: 'bonDeCommande', aliases: ['section0bondecommande', 'bondecommande', 'boncommandeid', 'customboncommande'] },
    // Section 1 - Identification et photos
    { header: "Section 1 - Identifiant de l'appareil", field: 'identifiant', aliases: ['section1identifiantdelappareil', 'identifiantdelappareil', 'identifiantappareil', 'identifiant', 'defibidentifiant', 'equipement'] },
    { header: 'Section 1 - Numéro de série', field: 'numeroSerie', aliases: ['section1numerodeserie', 'numerodeserie', 'numeroserie', 'numserie', 'sn'] },
    { header: "Section 1 - Catégorie d'équipement", field: 'categorie', aliases: ['section1categoriedequipement', 'categoriedequipement', 'categorieequipement', 'categorie'] },
    { header: "Section 1 - Modèle de l'appareil", field: 'modele', aliases: ['section1modeledelappareil', 'modeledelappareil', 'modeleappareil', 'modele', 'modeleid'] },
    { header: 'Section 1 - Défibrillateur entièrement automatique (DEA)', field: 'dea', aliases: ['section1defibrillateurentierementautomatiquedea', 'defibrillateurentierementautomatiquedea', 'dea'], type: 'yesno' },
    { header: 'Section 1 - Écran intégré', field: 'ecran', aliases: ['section1ecranintegre', 'ecranintegre', 'ecran'], type: 'yesno' },
    { header: 'Section 1 - Compteur de chocs délivrés', field: 'chocs', aliases: ['section1compteurdechocsdelivres', 'compteurdechocsdelivres', 'chocsdelivres', 'chocs'] },
    { header: 'Section 1 - Dispositif RCP intégré', field: 'rcp', aliases: ['section1dispositifrcpintegre', 'dispositifrcpintegre', 'rcp'], type: 'yesno' },
    { header: 'Section 1 - Hors service', field: 'horsService', aliases: ['section1horsservice', 'horsservice'], type: 'yesno' },
    { header: "Section 1 - Prêt d'appareil en cours", field: 'pretEnCours', aliases: ['section1pretdappareilencours', 'pretdappareilencours', 'pretencours'], type: 'yesno' },
    { header: 'Section 1 - Appareil de prêt sélectionné', field: 'pretId', aliases: ['section1appareildepretselectionne', 'appareildepretselectionne', 'pretid'] },
    { header: 'Section 1 - Dénomination du site', field: 'denomination', aliases: ['section1denominationdusite', 'denominationdusite', 'denominationsite', 'denomination', 'site'] },
    { header: 'Section 1 - Emplacement précis', field: 'emplacement', aliases: ['section1emplacementprecis', 'emplacementprecis', 'emplacement'] },
    { header: 'Section 1 - Photographie 1 (Appareil / Coffret)', field: 'photoUrl', aliases: ['section1photographie1appareilcoffret', 'photographie1appareilcoffret', 'photographie1', 'photourl'] },
    { header: 'Section 1 - Photographie 2 (Environnement / Électrodes)', field: 'photo2Url', aliases: ['section1photographie2environnementelectrodes', 'photographie2environnementelectrodes', 'photographie2', 'photo2url'] },
    // Section 2 - Client
    { header: 'Section 2 - Client', field: 'clientName', aliases: ['section2client', 'client', 'clientname', 'entreprise', 'clientid'] },
    { header: 'Section 2 - Contact sur site', field: 'nomPrenomSite', aliases: ['section2contactsursite', 'contactsursite', 'nomprenomsite'] },
    { header: 'Section 2 - Téléphone du contact', field: 'telephoneSite', aliases: ['section2telephoneducontact', 'telephoneducontact', 'telephonesite'] },
    { header: 'Section 2 - Email du contact', field: 'emailSite', aliases: ['section2emailducontact', 'emailducontact', 'emailsite'] },
    { header: 'Section 2 - Contrat actif', field: 'contrat', aliases: ['section2contratactif', 'contratactif', 'contrat'], type: 'yesno' },
    { header: 'Section 2 - Référence du contrat', field: 'referenceContrat', aliases: ['section2referenceducontrat', 'referenceducontrat', 'referencecontrat'] },
    { header: 'Section 2 - Catégorie de contrat', field: 'nomContrat', aliases: ['section2categoriedecontrat', 'categoriedecontrat', 'nomcontrat'] },
    { header: 'Section 2 - Émettre une facture brouillon', field: 'emettreFactureBrouillon', aliases: ['section2emettreunefacturebrouillon', 'emettreunefacturebrouillon', 'emettrefacturebrouillon'], type: 'yesno' },
    { header: 'Section 2 - Service sélectionné (Facturation)', field: 'serviceEmettreId', aliases: ['section2serviceselectionnefacturation', 'serviceselectionnefacturation', 'selectiondunservice', 'serviceemettreid'] },
    // Section 3 - Coffret
    { header: 'Section 3 - Modèle de boîtier / coffret', field: 'modeleCoffret', aliases: ['section3modeledeboitiercoffret', 'modeledeboitiercoffret', 'modeledeboitier', 'modelecoffret', 'modelecoffretid'] },
    { header: 'Section 3 - Lot de boîtier', field: 'numeroLotCoffret', aliases: ['section3lotdeboitier', 'lotdeboitier', 'numerolotcoffret'] },
    { header: "Section 3 - Équipé d'une alarme", field: 'equipeAlarme', aliases: ['section3equipedunealarme', 'equipedunealarme', 'equipealarme'], type: 'yesno' },
    { header: 'Section 3 - Alarme fonctionnelle', field: 'alarme', aliases: ['section3alarmefonctionnelle', 'alarmefonctionnelle', 'alarme', 'alarmecoffret'], type: 'yesno' },
    { header: "Section 3 - Dispositif d'armoire connectée", field: 'armoireConnectee', aliases: ['section3dispositifdarmoireconnectee', 'dispositifdarmoireconnectee', 'armoireconnectee'], type: 'yesno' },
    { header: 'Section 3 - Dispositif handicap', field: 'dispositifHandicap', aliases: ['section3dispositifhandicap', 'dispositifhandicap'], type: 'yesno' },
    { header: 'Section 3 - Signalétique conforme', field: 'signaletiqueConforme', aliases: ['section3signaletiqueconforme', 'signaletiqueconforme', 'signaletiqueboitier'], type: 'yesno' },
    { header: 'Section 3 - Installé en extérieur', field: 'installeExterieur', aliases: ['section3installeenexterieur', 'installeenexterieur', 'installeexterieur'], type: 'yesno' },
    { header: 'Section 3 - Commentaire concernant le boîtier', field: 'commentaireCoffret', aliases: ['section3commentaireconcernantleboitier', 'commentaireconcernantleboitier', 'commentairecoffret'] },
    // Section 4 - Accès
    { header: 'Section 4 - Voie (Numéro et rue)', field: 'numVoie', aliases: ['section4voienumeroetrue', 'voienumeroetrue', 'voie', 'numvoie', 'numeroetvoie'] },
    { header: 'Section 4 - Ville', field: 'ville', aliases: ['section4ville', 'ville'] },
    { header: 'Section 4 - Code postal', field: 'cp', aliases: ['section4codepostal', 'codepostal', 'cp'] },
    { header: 'Section 4 - Région', field: 'region', aliases: ['section4region', 'region'] },
    { header: 'Section 4 - Pays', field: 'pays', aliases: ['section4pays', 'pays'] },
    { header: 'Section 4 - Latitude GPS', field: 'latitude', aliases: ['section4latitudegps', 'latitudegps', 'latitude'] },
    { header: 'Section 4 - Longitude GPS', field: 'longitude', aliases: ['section4longitudegps', 'longitudegps', 'longitude'] },
    // Section 5 - Dates
    { header: 'Section 5 - Date de fabrication', field: '_s5_fabrication', aliases: ['section5datedefabrication', 'section5fabrication', 'fabrication'] },
    { header: 'Section 5 - Date de mise en service', field: '_s5_miseEnService', aliases: ['section5datedemiseenservice', 'section5miseenservice', 'miseenservice'] },
    { header: 'Section 5 - Date de fin de garantie', field: 'finGarantie', aliases: ['section5datedefindegarantie', 'section5findegarantie', 'findegarantie', 'fingarantie'] },
    // Section 6 - Électrode Adulte (A)
    { header: 'Section 6 - Modèle sélectionné', field: '_s6_modeleElectrodeA', aliases: ['section6modeleselectionne', 'modeleelectrodea', 'modeleelectrodeaid'] },
    { header: 'Section 6 - Numéro de lot', field: '_s6_lotElectrodeA', aliases: ['section6numerodelot', 'lotelectrodea'] },
    { header: 'Section 6 - Date de fabrication', field: '_s6_fabricationElectrodeA', aliases: ['section6datedefabrication', 'fabricationelectrodea'] },
    { header: 'Section 6 - Date de péremption', field: '_s6_peremptionElectrodeA', aliases: ['section6datedeperemption', 'peremptionelectrodea'] },
    { header: "Section 6 - Remplacée lors de l'intervention", field: '_s6_remplaceElectrodeA', aliases: ['section6remplaceelorsdelintervention', 'remplaceelectrodea'], type: 'yesno' },
    { header: "Section 6 - Déstocké depuis l'emplacement", field: '_s6_destockElectrodeA', aliases: ['section6destockedepuislemplacement', 'destockelectrodea'] },
    // Section 6 (Secours) - Électrode Adulte de secours
    { header: 'Section 6 (Secours) - Modèle sélectionné', field: '_s6s_modeleElectrodeSecoursA', aliases: ['section6secoursmodeleselectionne', 'modeleelectrodesecoursa', 'modeleelectrodesecoursaid'] },
    { header: 'Section 6 (Secours) - Numéro de lot', field: '_s6s_lotElectrodeSecoursA', aliases: ['section6secoursnumerodelot', 'lotelectrodesecoursa'] },
    { header: 'Section 6 (Secours) - Date de péremption', field: '_s6s_peremptionElectrodeSecoursA', aliases: ['section6secoursdatedeperemption', 'peremptionelectrodesecoursa'] },
    { header: "Section 6 (Secours) - Remplacée lors de l'intervention", field: '_s6s_remplaceElectrodeSecoursA', aliases: ['section6secoursremplaceelorsdelintervention', 'remplaceelectrodesecoursa'], type: 'yesno' },
    { header: "Section 6 (Secours) - Déstocké depuis l'emplacement", field: '_s6s_destockElectrodeSecoursA', aliases: ['section6secoursdestockedepuislemplacement', 'destockelectrodesecoursa'] },
    // Section 7 - Électrode Pédiatrique (P)
    { header: 'Section 7 - Modèle sélectionné', field: '_s7_modeleElectrodeP', aliases: ['section7modeleselectionne', 'modeleelectrodep', 'modeleelectrodepid'] },
    { header: 'Section 7 - Numéro de lot', field: '_s7_lotElectrodeP', aliases: ['section7numerodelot', 'lotelectrodep'] },
    { header: 'Section 7 - Date de fabrication', field: '_s7_fabricationElectrodeP', aliases: ['section7datedefabrication', 'fabricationelectrodep'] },
    { header: 'Section 7 - Date de péremption', field: '_s7_peremptionElectrodeP', aliases: ['section7datedeperemption', 'peremptionelectrodep'] },
    { header: "Section 7 - Remplacée lors de l'intervention", field: '_s7_remplaceElectrodeP', aliases: ['section7remplaceelorsdelintervention', 'remplaceelectrodep'], type: 'yesno' },
    { header: "Section 7 - Déstocké depuis l'emplacement", field: '_s7_destockElectrodeP', aliases: ['section7destockedepuislemplacement', 'destockelectrodep'] },
    // Section 7 (Secours) - Électrode Pédiatrique de secours
    { header: 'Section 7 (Secours) - Modèle sélectionné', field: '_s7s_modeleElectrodeSecoursP', aliases: ['section7secoursmodeleselectionne', 'modeleelectrodesecoursp', 'modeleelectrodesecourspid'] },
    { header: 'Section 7 (Secours) - Numéro de lot', field: '_s7s_lotElectrodeSecoursP', aliases: ['section7secoursnumerodelot', 'lotelectrodesecoursp'] },
    { header: 'Section 7 (Secours) - Date de péremption', field: '_s7s_peremptionElectrodeSecoursP', aliases: ['section7secoursdatedeperemption', 'peremptionelectrodesecoursp'] },
    { header: "Section 7 (Secours) - Remplacée lors de l'intervention", field: '_s7s_remplaceElectrodeSecoursP', aliases: ['section7secoursremplaceelorsdelintervention', 'remplaceelectrodesecoursp'], type: 'yesno' },
    { header: "Section 7 (Secours) - Déstocké depuis l'emplacement", field: '_s7s_destockElectrodeSecoursP', aliases: ['section7secoursdestockedepuislemplacement', 'destockelectrodesecoursp'] },
    // Section 8 - Batterie (B)
    { header: 'Section 8 - Modèle sélectionné', field: '_s8_modeleBatterie', aliases: ['section8modeleselectionne', 'modelebatterie', 'modelebatterieid'] },
    { header: 'Section 8 - Numéro de lot', field: '_s8_lotBatterie', aliases: ['section8numerodelot', 'lotbatterie'] },
    { header: 'Section 8 - Date de fabrication', field: '_s8_fabricationBatterie', aliases: ['section8datedefabrication', 'fabricationbatterie'] },
    { header: 'Section 8 - Date de mise en service', field: '_s8_miseEnServiceBatterie', aliases: ['section8datedemiseenservice', 'miseenservicebatterie'] },
    { header: 'Section 8 - Date de péremption', field: '_s8_peremptionBatterie', aliases: ['section8datedeperemption', 'peremptionbatterie'] },
    { header: 'Section 8 - Pourcentage constaté (%)', field: 'pourcentageBatterie', aliases: ['section8pourcentageconstate', 'pourcentageconstate', 'pourcentagebatterie'] },
    { header: "Section 8 - Remplacée lors de l'intervention", field: '_s8_remplaceBatterie', aliases: ['section8remplaceelorsdelintervention', 'remplacebatterie'], type: 'yesno' },
    { header: "Section 8 - Déstocké depuis l'emplacement", field: '_s8_destockBatterie', aliases: ['section8destockedepuislemplacement', 'destockbatterie'] },
    // Section 9 - Pile (B2)
    { header: 'Section 9 - Modèle sélectionné', field: '_s9_modelePile', aliases: ['section9modeleselectionne', 'modelepile', 'modelepileid'] },
    { header: 'Section 9 - Numéro de lot', field: '_s9_lotPile', aliases: ['section9numerodelot', 'lotpile'] },
    { header: 'Section 9 - Date de fabrication', field: '_s9_fabricationPile', aliases: ['section9datedefabrication', 'fabricationpile'] },
    { header: 'Section 9 - Date de mise en service', field: '_s9_miseEnServicePile', aliases: ['section9datedemiseenservice', 'miseenservicepile'] },
    { header: 'Section 9 - Date de péremption', field: '_s9_peremptionPile', aliases: ['section9datedeperemption', 'peremptionpile'] },
    { header: "Section 9 - Remplacée lors de l'intervention", field: '_s9_remplacePile', aliases: ['section9remplaceelorsdelintervention', 'remplacepile'], type: 'yesno' },
    { header: "Section 9 - Déstocké depuis l'emplacement", field: '_s9_destockPile', aliases: ['section9destockedepuislemplacement', 'destockpile'] },
    // Section 10 - Kit / Trousse de secours
    { header: 'Section 10 - Modèle sélectionné', field: '_s10_modeleKit', aliases: ['section10modeleselectionne', 'modelekit', 'modelekitid'] },
    { header: 'Section 10 - Numéro de lot', field: '_s10_lotKit', aliases: ['section10numerodelot', 'lotkit'] },
    { header: 'Section 10 - Date de péremption', field: '_s10_peremptionKit', aliases: ['section10datedeperemption', 'peremptionkit'] },
    { header: "Section 10 - Remplacé lors de l'intervention", field: '_s10_remplaceKit', aliases: ['section10remplacelorsdelintervention', 'remplacekit'], type: 'yesno' },
    { header: "Section 10 - Déstocké depuis l'emplacement", field: '_s10_destockKit', aliases: ['section10destockedepuislemplacement', 'destockkit'] },
    { header: 'Section 10 - Paire de ciseaux', field: 'kitCiseaux', aliases: ['section10pairedeciseaux', 'pairedeciseaux', 'kitciseaux'], type: 'yesno' },
    { header: 'Section 10 - Compresses stériles', field: 'kitCompresses', aliases: ['section10compressessteriles', 'compressessteriles', 'kitcompresses'], type: 'yesno' },
    { header: 'Section 10 - Rasoir', field: 'kitRasoir', aliases: ['section10rasoir', 'rasoir', 'kitrasoir'], type: 'yesno' },
    { header: 'Section 10 - Gants', field: 'kitGants', aliases: ['section10gants', 'gants', 'kitgants'], type: 'yesno' },
    { header: 'Section 10 - Masque bouche-à-bouche', field: 'kitMasque', aliases: ['section10masqueboucheabouche', 'masqueboucheabouche', 'kitmasque'], type: 'yesno' },
    // Section 11 - Vérifications, Diagnostic et Clôture
    { header: 'Section 11 - Tests et contrôles fonctionnels conformes', field: 'verificationsConformes', aliases: ['section11testsetcontrolesfonctionnelsconformes', 'testsetcontrolesfonctionnelsconformes', 'verificationsconformes'], type: 'yesno' },
    { header: 'Section 11 - Demande de devis', field: 'demandeDevis', aliases: ['section11demandededevis', 'demandededevis', 'demandedevis'], type: 'yesno' },
    { header: 'Section 11 - Motif de la demande de devis', field: 'motifDemandeDevis', aliases: ['section11motifdelademandededevis', 'motifdelademandededevis', 'motifdemandedevis'] },
    { header: "Section 11 - Description pour l'élaboration du devis", field: 'descriptionDemandeDevis', aliases: ['section11descriptionpourlelaborationdudevis', 'descriptionpourlelaborationdudevis', 'descriptiondemandedevis'] },
    { header: 'Section 11 - Pièce jointe (Devis)', field: 'pieceJointeDevisName', aliases: ['section11piecejointedevis', 'piecejointedevis', 'piecejointedevisname'] },
    { header: "Section 11 - Défibrillateur conforme et prêt à l'usage", field: 'conforme', aliases: ['section11defibrillateurconformeetpretalusage', 'defibrillateurconformeetpretalusage', 'conforme', 'isconforme'], type: 'yesno' },
    { header: 'Section 11 - Commentaire de diagnostic et de clôture', field: 'diagnosticCommentaire', aliases: ['section11commentairedediagnosticetdecloture', 'commentairedediagnosticetdecloture', 'diagnosticcommentaire', 'remarques'] },
    { header: 'Section 11 - Signature du technicien', field: 'techSignature', aliases: ['section11signaturedutechnicien', 'signaturedutechnicien', 'techsignature'] },
    { header: 'Section 11 - Horodatage de clôture', field: 'endTimeStamp', aliases: ['section11horodatagedecloture', 'horodatagedecloture', 'endtimestamp'] },
    { header: 'Section 11 - Code PIN client (Validation sur site)', field: 'clientPinCode', aliases: ['section11codepinclientvalidationsursite', 'codepinclientvalidationsursite', 'codepinclient', 'clientpincode'] },
    // Section 12 - Pièces jointes, Étiquettes & Modération
    { header: 'Section 12 - Photographie 3 / Pièce jointe interne', field: 'photo3Url', aliases: ['section12photographie3piecejointeinterne', 'photographie3piecejointeinterne', 'photographie3', 'photo3url'] },
    { header: 'Section 12 - Étiquette de maintenance conforme et complétée', field: 'etiquetteConforme', aliases: ['section12etiquettedemaintenanceconformeetcompletee', 'etiquettedemaintenanceconformeetcompletee', 'etiquetteconforme'], type: 'yesno' },
    { header: 'Section 12 - Scellé de sécurité posé', field: 'scellePose', aliases: ['section12scelledesecuritepose', 'scelledesecuritepose', 'scellepose'], type: 'yesno' },
    { header: 'Section 12 - Autocollant posé ou existant conforme', field: 'autocollantConforme', aliases: ['section12autocollantposeouexistantconforme', 'autocollantposeouexistantconforme', 'autocollantconforme'], type: 'yesno' },
    { header: 'Section 12 - Commentaire interne', field: 'internalComment', aliases: ['section12commentaireinterne', 'commentaireinterne', 'internalcomment'] },
    { header: 'Statut du rapport', field: 'status', aliases: ['statutdurapport', 'statutrapport', 'status', 'statut'] },
    { header: 'Drapeau ou indicateur', field: 'drapeaux', aliases: ['drapeauouindicateur', 'drapeaux', 'drapeau'] },
    { header: 'Situation', field: 'missionStatus', aliases: ['situation', 'missionstatus'] },
    { header: 'Validé par', field: 'notifiedBy', aliases: ['validepar', 'notifiedby'] },
    { header: 'Date et heure de validation', field: 'notifiedAt', aliases: ['dateetheuredevalidation', 'datevalidation', 'notifiedat'] },
    { header: 'Lien / URL du rapport PDF', field: 'pdfUrl', aliases: ['lienurldurapportpdf', 'urldurapportpdf', 'lienrapportpdf', 'rapporturl', 'pdfurl'] },
  ],
};

function getDefaultGenericHeaders(tabType: SheetTabType, sampleRecords: any[] = []): string[] {
  const canonical = GENERIC_CANONICAL_HEADERS[tabType];
  if (canonical && canonical.length > 0) {
    if (tabType === 'rapportsPdf') {
      return canonical.map(c => c.header);
    }
    return canonical.filter(c => !c.field.startsWith('_')).map(c => c.header);
  }
  const presets: Partial<Record<SheetTabType, string[]>> = {
    commandes: ['id', 'numeroCommande', 'clientId', 'clientNom', 'date', 'statut', 'totalHT', 'totalTTC', 'items', 'envId', 'tenantId'],
    stocks: ['id', 'ugs', 'nom', 'categorie', 'quantite', 'stockage', 'seuilAlerte', 'envId', 'tenantId'],
    formations: ['id', 'titre', 'date', 'formateur', 'lieu', 'statut', 'stagiaires', 'envId', 'tenantId'],
    variables: ['id', 'category', 'nom', 'marque', 'description', 'envId', 'tenantId'],
  };
  const base = presets[tabType] ? [...presets[tabType]!] : ['id', 'identifiant', 'nom', 'date', 'statut', 'envId', 'tenantId'];
  const seen = new Set(base.map(h => h.toLowerCase()));
  for (const rec of sampleRecords) {
    if (!rec || typeof rec !== 'object') continue;
    for (const k of Object.keys(rec)) {
      if (k.startsWith('_')) continue;
      if (!seen.has(k.toLowerCase())) {
        seen.add(k.toLowerCase());
        base.push(k);
      }
    }
  }
  if (!seen.has('_json')) base.push('_json');
  return base;
}

function resolveGenericColumnFieldMap(headers: string[], tabType: SheetTabType): Map<number, GenericColumnDef> {
  const defs = GENERIC_CANONICAL_HEADERS[tabType];
  const colToDef = new Map<number, GenericColumnDef>();
  if (!defs || defs.length === 0) return colToDef;

  const normFullHeaders = headers.map(normalizeHeaderKey);
  const normStrippedHeaders = headers.map(normalizeHeaderKeyStripSubSection);
  const usedCols = new Set<number>();

  // Pass 1: Match full normalized header (preserving numbered prefixes like plage1, plage2, section6, section7)
  for (const def of defs) {
    const allAliases = new Set([
      normalizeHeaderKey(def.header),
      normalizeHeaderKey(def.field),
      ...def.aliases,
    ]);
    for (let i = 0; i < normFullHeaders.length; i++) {
      if (usedCols.has(i) || !normFullHeaders[i]) continue;
      if (allAliases.has(normFullHeaders[i])) {
        colToDef.set(i, def);
        usedCols.add(i);
        break;
      }
    }
  }

  // Pass 2: Match stripped header (stripping "Section X — SubSection : " prefix) for non-numbered fields
  for (const def of defs) {
    if (def.field.startsWith('_')) continue;
    const allAliases = new Set([
      normalizeHeaderKey(def.header),
      normalizeHeaderKey(def.field),
      ...def.aliases,
    ]);
    for (let i = 0; i < normStrippedHeaders.length; i++) {
      if (usedCols.has(i) || !normStrippedHeaders[i]) continue;
      if (allAliases.has(normStrippedHeaders[i])) {
        colToDef.set(i, def);
        usedCols.add(i);
        break;
      }
    }
  }

  return colToDef;
}

function mapRowToGenericRecord(headers: string[], row: string[], rowIndexZeroBased: number, tenantId: string, tabType: SheetTabType): any {
  const rawByHeader: Record<string, string> = {};
  const obj: Record<string, any> = {};
  let parsedJsonFallback: Record<string, any> = {};
  const colToDef = resolveGenericColumnFieldMap(headers, tabType);

  headers.forEach((h, i) => {
    const val = row[i] !== undefined ? String(row[i]).trim() : '';
    if (!h) return;
    rawByHeader[h] = val;
    if (h.toLowerCase() === '_json' && val.startsWith('{')) {
      try {
        parsedJsonFallback = JSON.parse(val);
      } catch (_) {}
      return;
    }

    const matchedDef = colToDef.get(i);
    const targetField = matchedDef ? matchedDef.field : h;

    if (val === '') return;

    if ((val.startsWith('[') && val.endsWith(']')) || (val.startsWith('{') && val.endsWith('}'))) {
      try {
        const parsed = JSON.parse(val);
        obj[targetField] = parsed;
        if (targetField !== h) obj[h] = parsed;
        return;
      } catch (_) {}
    }

    let coercedVal: any = val;
    if (matchedDef?.type === 'yesno') {
      coercedVal = normalizeYesNo(val, 'Non');
    } else if (matchedDef?.type === 'bool') {
      coercedVal = normalizeBool(val, false);
    } else if (matchedDef?.type === 'date') {
      coercedVal = normalizeDateStr(val);
    } else if (matchedDef?.type === 'number') {
      const num = parseFloat(val.replace(',', '.').replace(/[^0-9.-]/g, ''));
      if (!isNaN(num)) coercedVal = num;
    }

    obj[targetField] = coercedVal;
    if (targetField !== h && !targetField.startsWith('_')) {
      obj[h] = val;
    }
  });

  const merged: any = {
    ...parsedJsonFallback,
    ...obj,
    envId: obj.envId || parsedJsonFallback.envId || tenantId,
    tenantId: obj.tenantId || parsedJsonFallback.tenantId || tenantId,
    _sheetRowNumber: rowIndexZeroBased + 2,
    _rawSheetRow: rawByHeader,
  };

  // Compartment-specific post-processing so UI components receive exact expected properties
  if (tabType === 'tournees') {
    merged.tourIdentifiant = String(merged.tourIdentifiant || merged.identifiant || merged.tourCode || merged.id || '').trim();
    merged.id = merged.id || merged.tourIdentifiant || `sheet_tour_${tenantId}_${rowIndexZeroBased + 2}`;
    merged.title = merged.title || merged.name || '';
    merged.name = merged.name || merged.title || '';
    merged.techName = merged.techName || merged.technicien || 'Non assigné';
    merged.startDate = normalizeDateStr(merged.startDate || merged.date || '');
    merged.date = merged.date || merged.startDate || '';
    merged.status = merged.status || 'Planifiée';
    if (!Array.isArray(merged.missions)) {
      merged.missions = [];
    }
  } else if (tabType === 'missionsTournees') {
    const rawTourId = String(merged.tourIdentifiant || merged.tourId || merged.tourCode || '').trim();
    const isNullOrATrier =
      !rawTourId ||
      ['null', 'undefined', 'vide', 'none', 'a-trier', 'a trier', 'à trier', 'à trier / ordres adv', 'ordres adv'].includes(
        rawTourId.toLowerCase()
      );
    merged.tourIdentifiant = isNullOrATrier ? '' : rawTourId;
    merged.tourId = merged.tourIdentifiant || 'a-trier';
    merged.interventionReference = String(merged.interventionReference || merged.id || `INT-2026-${String(rowIndexZeroBased + 2).padStart(5, '0')}`).trim();
    merged.id = merged.id || merged.interventionReference;
    merged.status = merged.status || 'Brouillon';
    merged.equipmentType = merged.equipmentType || merged.categorie || 'Défibrillateur';
    if (merged.reason && !Array.isArray(merged.reasons)) {
      merged.reasons = String(merged.reason)
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
    } else if (Array.isArray(merged.reasons) && !merged.reason) {
      merged.reason = merged.reasons.join(', ');
    }
    if (typeof merged.requiredParts === 'string') {
      merged.requiredParts = merged.requiredParts
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
    } else if (!Array.isArray(merged.requiredParts)) {
      merged.requiredParts = [];
    }
    if (!merged.clientAddress && (merged.cp || merged.ville)) {
      merged.clientAddress = [merged.cp, merged.ville].filter(Boolean).join(' ');
    }
  } else if (tabType === 'rapportsPdf') {
    // Map prefixed section fields to canonical properties
    const sectionFieldPairs: Array<[string, string]> = [
      ['_s5_fabrication', 'fabrication'],
      ['_s5_miseEnService', 'miseEnService'],
      ['_s6_modeleElectrodeA', 'modeleElectrodeA'],
      ['_s6_lotElectrodeA', 'lotElectrodeA'],
      ['_s6_fabricationElectrodeA', 'fabricationElectrodeA'],
      ['_s6_peremptionElectrodeA', 'peremptionElectrodeA'],
      ['_s6_remplaceElectrodeA', 'remplaceElectrodeA'],
      ['_s6_destockElectrodeA', 'destockElectrodeA'],
      ['_s6s_modeleElectrodeSecoursA', 'modeleElectrodeSecoursA'],
      ['_s6s_lotElectrodeSecoursA', 'lotElectrodeSecoursA'],
      ['_s6s_peremptionElectrodeSecoursA', 'peremptionElectrodeSecoursA'],
      ['_s6s_remplaceElectrodeSecoursA', 'remplaceElectrodeSecoursA'],
      ['_s6s_destockElectrodeSecoursA', 'destockElectrodeSecoursA'],
      ['_s7_modeleElectrodeP', 'modeleElectrodeP'],
      ['_s7_lotElectrodeP', 'lotElectrodeP'],
      ['_s7_fabricationElectrodeP', 'fabricationElectrodeP'],
      ['_s7_peremptionElectrodeP', 'peremptionElectrodeP'],
      ['_s7_remplaceElectrodeP', 'remplaceElectrodeP'],
      ['_s7_destockElectrodeP', 'destockElectrodeP'],
      ['_s7s_modeleElectrodeSecoursP', 'modeleElectrodeSecoursP'],
      ['_s7s_lotElectrodeSecoursP', 'lotElectrodeSecoursP'],
      ['_s7s_peremptionElectrodeSecoursP', 'peremptionElectrodeSecoursP'],
      ['_s7s_remplaceElectrodeSecoursP', 'remplaceElectrodeSecoursP'],
      ['_s7s_destockElectrodeSecoursP', 'destockElectrodeSecoursP'],
      ['_s8_modeleBatterie', 'modeleBatterie'],
      ['_s8_lotBatterie', 'lotBatterie'],
      ['_s8_fabricationBatterie', 'fabricationBatterie'],
      ['_s8_miseEnServiceBatterie', 'miseEnServiceBatterie'],
      ['_s8_peremptionBatterie', 'peremptionBatterie'],
      ['_s8_remplaceBatterie', 'remplaceBatterie'],
      ['_s8_destockBatterie', 'destockBatterie'],
      ['_s9_modelePile', 'modelePile'],
      ['_s9_lotPile', 'lotPile'],
      ['_s9_fabricationPile', 'fabricationPile'],
      ['_s9_miseEnServicePile', 'miseEnServicePile'],
      ['_s9_peremptionPile', 'peremptionPile'],
      ['_s9_remplacePile', 'remplacePile'],
      ['_s9_destockPile', 'destockPile'],
      ['_s10_modeleKit', 'modeleKit'],
      ['_s10_lotKit', 'lotKit'],
      ['_s10_peremptionKit', 'peremptionKit'],
      ['_s10_remplaceKit', 'remplaceKit'],
      ['_s10_destockKit', 'destockKit'],
    ];
    for (const [prefixedKey, targetKey] of sectionFieldPairs) {
      if (merged[prefixedKey] !== undefined && merged[prefixedKey] !== '') {
        merged[targetKey] = merged[prefixedKey];
      }
    }

    const refId = String(merged.interventionReference || merged.reportNumber || merged.id || merged.reportId || `RAPPORT-${rowIndexZeroBased + 2}`).trim();
    merged.interventionReference = refId;
    merged.reportNumber = merged.reportNumber || refId;
    merged.id = merged.id || refId;
    merged.reportId = merged.reportId || refId;

    merged.reportTitle = merged.reportTitle || 'RAPPORT D’INTERVENTION';
    merged.techName = merged.techName || merged.technicien || 'Non assigné';
    merged.technicien = merged.technicien || merged.techName;
    merged.date = merged.date || merged.dateStr || merged.interventionDate || merged.dateMaintenance || '';
    merged.dateStr = merged.dateStr || merged.date;
    merged.interventionDate = merged.interventionDate || merged.date;
    merged.missionSite = merged.missionSite || 'DÉPLACEMENT';

    if (typeof merged.reasons === 'string') {
      merged.reason = merged.reasons;
      merged.reasons = merged.reasons
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
    } else if (Array.isArray(merged.reasons)) {
      merged.reason = merged.reason || merged.reasons.join(', ');
    } else if (merged.reason) {
      merged.reasons = String(merged.reason)
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
    } else {
      merged.reasons = [];
    }

    merged.identifiant = merged.identifiant || merged.defibIdentifiant || merged.equipement || '';
    merged.defibIdentifiant = merged.defibIdentifiant || merged.identifiant;
    merged.equipement = merged.equipement || merged.identifiant;
    merged.categorie = merged.categorie || 'Défibrillateur';
    merged.denomination = merged.denomination || merged.site || '';
    merged.site = merged.site || merged.denomination;
    merged.clientName = merged.clientName || merged.entreprise || '';
    merged.entreprise = merged.entreprise || merged.clientName;
    merged.clientId = merged.clientId || merged.clientName || '';

    merged.conforme = normalizeYesNo(merged.conforme ?? (merged.isConforme === false ? 'Non' : 'Oui'), 'Oui');
    merged.isConforme = merged.conforme === 'Oui';
    merged.status = merged.status || merged.statut || (merged.validated ? 'Validé' : 'En modération');
    merged.statut = merged.statut || merged.status;
    merged.validated = Boolean(merged.validated || /^valid[eé]/i.test(String(merged.status || '')));
    merged.isUpcoming = Boolean(merged.isUpcoming || merged.status === 'À venir');

    if (Array.isArray(merged.drapeaux)) {
      merged.drapeaux = merged.drapeaux;
    } else if (typeof merged.drapeaux === 'string') {
      const rawFlagStr = merged.drapeaux.trim();
      if (!rawFlagStr || /^(ras|aucun|non|-)$/i.test(rawFlagStr)) {
        merged.drapeaux = [];
      } else if (rawFlagStr.startsWith('[')) {
        try {
          const parsedFlags = JSON.parse(rawFlagStr);
          merged.drapeaux = Array.isArray(parsedFlags) ? parsedFlags : [];
        } catch (_) {
          merged.drapeaux = [];
        }
      } else {
        merged.drapeaux = rawFlagStr
          .split(',')
          .map((s: string) => s.trim())
          .filter((s: string) => s && !/^(ras|aucun|non|-)$/i.test(s))
          .map((nom: string) => ({ id: nom, nom, couleurHex: '#000000' }));
      }
    } else {
      merged.drapeaux = [];
    }

    merged.missionStatus = merged.missionStatus || 'Exécutée';
    merged.pdfUrl = merged.pdfUrl || merged.rapportUrl || '';
    merged.rapportUrl = merged.rapportUrl || merged.pdfUrl;
    merged.internalComment = merged.internalComment || merged.commentaireInterne || merged.commentaire || '';
    merged.commentaireInterne = merged.commentaireInterne || merged.internalComment;
    merged.commentaire = merged.internalComment;
    merged.remarques = merged.diagnosticCommentaire || merged.remarques || '';

    // Synchronize GmaoCorrectionForm top-level state aliases
    merged.title = merged.reportTitle || merged.title || 'RAPPORT D’INTERVENTION';
    merged.siteMission = merged.missionSite || merged.siteMission || 'DÉPLACEMENT';
    merged.photoArriereUrl = merged.photoArriereUrl || merged.photo2Url || '';
    merged.photoResultatTestUrl = merged.photoResultatTestUrl || merged.photo3Url || '';
    merged.electrodeARemplacee = merged.electrodeARemplacee || merged.remplaceElectrodeA || 'Non';
    merged.selectionElectrodeARemplacee = merged.selectionElectrodeARemplacee || merged.destockElectrodeA || '';
    merged.electrodeASecoursRemplacee = merged.electrodeASecoursRemplacee || merged.remplaceElectrodeSecoursA || 'Non';
    merged.selectionElectrodeASecoursRemplacee = merged.selectionElectrodeASecoursRemplacee || merged.destockElectrodeSecoursA || '';
    merged.electrodePRemplacee = merged.electrodePRemplacee || merged.remplaceElectrodeP || 'Non';
    merged.selectionElectrodePRemplacee = merged.selectionElectrodePRemplacee || merged.destockElectrodeP || '';
    merged.electrodePSecoursRemplacee = merged.electrodePSecoursRemplacee || merged.remplaceElectrodeSecoursP || 'Non';
    merged.selectionElectrodePSecoursRemplacee = merged.selectionElectrodePSecoursRemplacee || merged.destockElectrodeSecoursP || '';
    merged.batterieRemplacee = merged.batterieRemplacee || merged.remplaceBatterie || 'Non';
    merged.selectionBatterieRemplacee = merged.selectionBatterieRemplacee || merged.destockBatterie || '';
    merged.kitPeremption = merged.kitPeremption || merged.peremptionKit || '';
    merged.kitSecoursRemplaceOuAjoute = merged.kitSecoursRemplaceOuAjoute || merged.remplaceKit || 'Non';
    merged.selectionKitSecoursRemplace = merged.selectionKitSecoursRemplace || merged.destockKit || '';
    merged.kitCiseauxPresents = merged.kitCiseauxPresents || merged.kitCiseaux || 'Oui';
    merged.kitServiettesPresentes = merged.kitServiettesPresentes || merged.kitCompresses || 'Oui';
    merged.kitRasoirPresent = merged.kitRasoirPresent || merged.kitRasoir || 'Oui';
    merged.kitGantsPresents = merged.kitGantsPresents || merged.kitGants || 'Oui';
    merged.kitMasquePresent = merged.kitMasquePresent || merged.kitMasque || 'Oui';
    if (merged.etiquetteObligatoireConforme === undefined) {
      merged.etiquetteObligatoireConforme = merged.etiquetteConforme ? merged.etiquetteConforme === 'Oui' : true;
    }
    if (merged.scelleConforme === undefined) {
      merged.scelleConforme = merged.scellePose ? merged.scellePose === 'Oui' : true;
    }
    if (merged.stickerEntrepriseApplique === undefined) {
      merged.stickerEntrepriseApplique = merged.autocollantConforme ? merged.autocollantConforme === 'Oui' : true;
    }
    if (typeof merged.demandeDevis === 'string') {
      merged.demandeDevis = merged.demandeDevis === 'Oui' || merged.demandeDevis === 'true';
    }
    if (!Array.isArray(merged.devisArticlesSelectionnes) && merged.motifDemandeDevis) {
      merged.devisArticlesSelectionnes = String(merged.motifDemandeDevis)
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
    merged.devisAutreInfo = merged.devisAutreInfo || merged.descriptionDemandeDevis || '';

    const existingSnap = merged.defibSnapshot && typeof merged.defibSnapshot === 'object' ? merged.defibSnapshot : {};
    merged.defibSnapshot = {
      ...existingSnap,
      id: existingSnap.id || merged.defibId || merged.defibrillateurId || merged.identifiant || '',
      identifiant: merged.identifiant || existingSnap.identifiant || '',
      numeroSerie: merged.numeroSerie || existingSnap.numeroSerie || '',
      categorie: merged.categorie || existingSnap.categorie || 'Défibrillateur',
      modele: merged.modele || existingSnap.modele || '',
      modeleId: existingSnap.modeleId || merged.modele || '',
      dea: merged.dea || existingSnap.dea || 'Non',
      ecran: merged.ecran || existingSnap.ecran || 'Non',
      chocs: merged.chocs !== undefined ? String(merged.chocs) : (existingSnap.chocs || '0'),
      rcp: merged.rcp || existingSnap.rcp || 'Non',
      horsService: merged.horsService || existingSnap.horsService || 'Non',
      pretEnCours: merged.pretEnCours || existingSnap.pretEnCours || 'Non',
      pretId: merged.pretId || existingSnap.pretId || '',
      denomination: merged.denomination || existingSnap.denomination || existingSnap.nomSite || '',
      nomSite: merged.denomination || existingSnap.nomSite || existingSnap.denomination || '',
      emplacement: merged.emplacement || existingSnap.emplacement || existingSnap.commentaireAdresse || '',
      commentaireAdresse: merged.emplacement || existingSnap.commentaireAdresse || existingSnap.emplacement || '',
      photoUrl: merged.photoUrl || existingSnap.photoUrl || '',
      photo2Url: merged.photo2Url || merged.photoArriereUrl || existingSnap.photo2Url || '',
      photo3Url: merged.photo3Url || merged.photoResultatTestUrl || existingSnap.photo3Url || '',
      clientId: merged.clientId || existingSnap.clientId || '',
      nomPrenomSite: merged.nomPrenomSite || existingSnap.nomPrenomSite || '',
      telephoneSite: merged.telephoneSite || existingSnap.telephoneSite || '',
      emailSite: merged.emailSite || existingSnap.emailSite || '',
      contrat: merged.contrat || existingSnap.contrat || 'Non',
      referenceContrat: merged.referenceContrat || existingSnap.referenceContrat || '',
      nomContrat: merged.nomContrat || existingSnap.nomContrat || '',
      emettreFactureBrouillon: merged.emettreFactureBrouillon || existingSnap.emettreFactureBrouillon || 'Non',
      serviceEmettreId: merged.serviceEmettreId || existingSnap.serviceEmettreId || '',
      modeleCoffret: merged.modeleCoffret || existingSnap.modeleCoffret || '',
      modeleCoffretId: existingSnap.modeleCoffretId || merged.modeleCoffret || '',
      numeroLotCoffret: merged.numeroLotCoffret || existingSnap.numeroLotCoffret || '',
      equipeAlarme: merged.equipeAlarme || existingSnap.equipeAlarme || 'Oui',
      alarme: merged.alarme || existingSnap.alarme || 'Oui',
      alarmeCoffret: merged.alarme || existingSnap.alarmeCoffret || 'Oui',
      armoireConnectee: merged.armoireConnectee || existingSnap.armoireConnectee || 'Non',
      dispositifHandicap: merged.dispositifHandicap || existingSnap.dispositifHandicap || 'Non',
      signaletiqueConforme: merged.signaletiqueConforme || existingSnap.signaletiqueConforme || 'Oui',
      signaletiqueBoitier: merged.signaletiqueConforme || existingSnap.signaletiqueBoitier || 'Oui',
      installeExterieur: merged.installeExterieur || existingSnap.installeExterieur || 'Non',
      exterieur: (merged.installeExterieur || existingSnap.installeExterieur) === 'Oui',
      interieurExterieur:
        merged.installeExterieur === 'Oui'
          ? 'Extérieur'
          : merged.installeExterieur === 'Non'
          ? 'Intérieur'
          : existingSnap.interieurExterieur || 'Intérieur',
      commentaireCoffret: merged.commentaireCoffret || existingSnap.commentaireCoffret || '',
      numVoie: merged.numVoie || existingSnap.numVoie || '',
      ville: merged.ville || existingSnap.ville || '',
      cp: merged.cp || existingSnap.cp || '',
      region: merged.region || existingSnap.region || '',
      pays: merged.pays || existingSnap.pays || 'France',
      latitude: merged.latitude !== undefined ? String(merged.latitude) : (existingSnap.latitude || ''),
      longitude: merged.longitude !== undefined ? String(merged.longitude) : (existingSnap.longitude || ''),
      fabrication: merged.fabrication || existingSnap.fabrication || '',
      miseEnService: merged.miseEnService || existingSnap.miseEnService || '',
      finGarantie: merged.finGarantie || existingSnap.finGarantie || '',
      modeleElectrodeA: merged.modeleElectrodeA || existingSnap.modeleElectrodeA || '',
      modeleElectrodeAId: existingSnap.modeleElectrodeAId || merged.modeleElectrodeA || '',
      lotElectrodeA: merged.lotElectrodeA || existingSnap.lotElectrodeA || '',
      fabricationElectrodeA: merged.fabricationElectrodeA || existingSnap.fabricationElectrodeA || '',
      peremptionElectrodeA: merged.peremptionElectrodeA || existingSnap.peremptionElectrodeA || '',
      remplaceElectrodeA: merged.remplaceElectrodeA || existingSnap.remplaceElectrodeA || 'Non',
      destockElectrodeA: merged.destockElectrodeA || existingSnap.destockElectrodeA || '',
      modeleElectrodeSecoursA: merged.modeleElectrodeSecoursA || existingSnap.modeleElectrodeSecoursA || existingSnap.modeleElectrodeASecoursId || '',
      modeleElectrodeSecoursAId: existingSnap.modeleElectrodeSecoursAId || existingSnap.modeleElectrodeASecoursId || merged.modeleElectrodeSecoursA || '',
      modeleElectrodeASecoursId: existingSnap.modeleElectrodeASecoursId || existingSnap.modeleElectrodeSecoursAId || merged.modeleElectrodeSecoursA || '',
      lotElectrodeSecoursA: merged.lotElectrodeSecoursA || existingSnap.lotElectrodeSecoursA || existingSnap.lotElectrodeASecours || '',
      lotElectrodeASecours: merged.lotElectrodeSecoursA || existingSnap.lotElectrodeASecours || existingSnap.lotElectrodeSecoursA || '',
      peremptionElectrodeSecoursA: merged.peremptionElectrodeSecoursA || existingSnap.peremptionElectrodeSecoursA || existingSnap.peremptionSecoursElectrodeA || '',
      peremptionSecoursElectrodeA: merged.peremptionElectrodeSecoursA || existingSnap.peremptionSecoursElectrodeA || existingSnap.peremptionElectrodeSecoursA || '',
      remplaceElectrodeSecoursA: merged.remplaceElectrodeSecoursA || existingSnap.remplaceElectrodeSecoursA || 'Non',
      destockElectrodeSecoursA: merged.destockElectrodeSecoursA || existingSnap.destockElectrodeSecoursA || '',
      modeleElectrodeP: merged.modeleElectrodeP || existingSnap.modeleElectrodeP || '',
      modeleElectrodePId: existingSnap.modeleElectrodePId || merged.modeleElectrodeP || '',
      lotElectrodeP: merged.lotElectrodeP || existingSnap.lotElectrodeP || '',
      fabricationElectrodeP: merged.fabricationElectrodeP || existingSnap.fabricationElectrodeP || '',
      peremptionElectrodeP: merged.peremptionElectrodeP || existingSnap.peremptionElectrodeP || '',
      remplaceElectrodeP: merged.remplaceElectrodeP || existingSnap.remplaceElectrodeP || 'Non',
      destockElectrodeP: merged.destockElectrodeP || existingSnap.destockElectrodeP || '',
      modeleElectrodeSecoursP: merged.modeleElectrodeSecoursP || existingSnap.modeleElectrodeSecoursP || existingSnap.modeleElectrodePSecoursId || '',
      modeleElectrodeSecoursPId: existingSnap.modeleElectrodeSecoursPId || existingSnap.modeleElectrodePSecoursId || merged.modeleElectrodeSecoursP || '',
      modeleElectrodePSecoursId: existingSnap.modeleElectrodePSecoursId || existingSnap.modeleElectrodeSecoursPId || merged.modeleElectrodeSecoursP || '',
      lotElectrodeSecoursP: merged.lotElectrodeSecoursP || existingSnap.lotElectrodeSecoursP || existingSnap.lotElectrodePSecours || '',
      lotElectrodePSecours: merged.lotElectrodeSecoursP || existingSnap.lotElectrodePSecours || existingSnap.lotElectrodeSecoursP || '',
      peremptionElectrodeSecoursP: merged.peremptionElectrodeSecoursP || existingSnap.peremptionElectrodeSecoursP || existingSnap.peremptionSecoursElectrodeP || '',
      peremptionSecoursElectrodeP: merged.peremptionElectrodeSecoursP || existingSnap.peremptionSecoursElectrodeP || existingSnap.peremptionElectrodeSecoursP || '',
      remplaceElectrodeSecoursP: merged.remplaceElectrodeSecoursP || existingSnap.remplaceElectrodeSecoursP || 'Non',
      destockElectrodeSecoursP: merged.destockElectrodeSecoursP || existingSnap.destockElectrodeSecoursP || '',
      modeleBatterie: merged.modeleBatterie || existingSnap.modeleBatterie || '',
      modeleBatterieId: existingSnap.modeleBatterieId || merged.modeleBatterie || '',
      lotBatterie: merged.lotBatterie || existingSnap.lotBatterie || '',
      fabricationBatterie: merged.fabricationBatterie || existingSnap.fabricationBatterie || '',
      miseEnServiceBatterie: merged.miseEnServiceBatterie || existingSnap.miseEnServiceBatterie || existingSnap.insertionBatterie || '',
      insertionBatterie: merged.miseEnServiceBatterie || existingSnap.insertionBatterie || existingSnap.miseEnServiceBatterie || '',
      peremptionBatterie: merged.peremptionBatterie || existingSnap.peremptionBatterie || '',
      pourcentageBatterie: merged.pourcentageBatterie !== undefined ? String(merged.pourcentageBatterie) : (existingSnap.pourcentageBatterie || ''),
      remplaceBatterie: merged.remplaceBatterie || existingSnap.remplaceBatterie || 'Non',
      destockBatterie: merged.destockBatterie || existingSnap.destockBatterie || '',
      modelePile: merged.modelePile || existingSnap.modelePile || '',
      modelePileId: existingSnap.modelePileId || merged.modelePile || '',
      lotPile: merged.lotPile || existingSnap.lotPile || '',
      fabricationPile: merged.fabricationPile || existingSnap.fabricationPile || '',
      miseEnServicePile: merged.miseEnServicePile || existingSnap.miseEnServicePile || '',
      peremptionPile: merged.peremptionPile || existingSnap.peremptionPile || '',
      remplacePile: merged.remplacePile || existingSnap.remplacePile || 'Non',
      destockPile: merged.destockPile || existingSnap.destockPile || '',
      modeleKit: merged.modeleKit || existingSnap.modeleKit || '',
      modeleKitId: existingSnap.modeleKitId || merged.modeleKit || '',
      lotKit: merged.lotKit || existingSnap.lotKit || '',
      peremptionKit: merged.peremptionKit || existingSnap.peremptionKit || existingSnap.peremptionTrousse || '',
      peremptionTrousse: merged.peremptionKit || existingSnap.peremptionTrousse || existingSnap.peremptionKit || '',
      remplaceKit: merged.remplaceKit || existingSnap.remplaceKit || 'Non',
      destockKit: merged.destockKit || existingSnap.destockKit || '',
      kitCiseaux: merged.kitCiseaux || existingSnap.kitCiseaux || existingSnap.kitCiseauxPresents || 'Oui',
      kitCiseauxPresents: merged.kitCiseaux || existingSnap.kitCiseauxPresents || existingSnap.kitCiseaux || 'Oui',
      kitCompresses: merged.kitCompresses || existingSnap.kitCompresses || existingSnap.kitServiettesPresentes || 'Oui',
      kitServiettesPresentes: merged.kitCompresses || existingSnap.kitServiettesPresentes || existingSnap.kitCompresses || 'Oui',
      kitRasoir: merged.kitRasoir || existingSnap.kitRasoir || existingSnap.kitRasoirPresent || 'Oui',
      kitRasoirPresent: merged.kitRasoir || existingSnap.kitRasoirPresent || existingSnap.kitRasoir || 'Oui',
      kitGants: merged.kitGants || existingSnap.kitGants || existingSnap.kitGantsPresents || 'Oui',
      kitGantsPresents: merged.kitGants || existingSnap.kitGantsPresents || existingSnap.kitGants || 'Oui',
      kitMasque: merged.kitMasque || existingSnap.kitMasque || existingSnap.kitMasquePresent || 'Oui',
      kitMasquePresent: merged.kitMasque || existingSnap.kitMasquePresent || existingSnap.kitMasque || 'Oui',
      verificationsConformes: merged.verificationsConformes || existingSnap.verificationsConformes || 'Oui',
      demandeDevis: merged.demandeDevis ? 'Oui' : (existingSnap.demandeDevis || 'Non'),
      motifDemandeDevis: merged.motifDemandeDevis || existingSnap.motifDemandeDevis || '',
      descriptionDemandeDevis: merged.descriptionDemandeDevis || existingSnap.descriptionDemandeDevis || '',
      pieceJointeDevisName: merged.pieceJointeDevisName || existingSnap.pieceJointeDevisName || '',
      conforme: merged.conforme || existingSnap.conforme || 'Oui',
      commentaire: merged.diagnosticCommentaire || existingSnap.commentaire || merged.remarques || '',
      commentaireInterne: merged.internalComment || existingSnap.commentaireInterne || existingSnap.internalComment || '',
      techSignature: merged.techSignature || existingSnap.techSignature || '',
      endTimeStamp: merged.endTimeStamp || existingSnap.endTimeStamp || '',
      clientPinCode: merged.clientPinCode || existingSnap.clientPinCode || '',
      etiquetteConforme: merged.etiquetteConforme || existingSnap.etiquetteConforme || 'Oui',
      scellePose: merged.scellePose || existingSnap.scellePose || 'Oui',
      autocollantConforme: merged.autocollantConforme || existingSnap.autocollantConforme || 'Oui',
      internalComment: merged.internalComment || existingSnap.internalComment || '',
      bonCommandeId: merged.bonDeCommande || existingSnap.bonCommandeId || '',
      customBonCommande: merged.bonDeCommande || existingSnap.customBonCommande || '',
      autreReference: merged.autreReference || existingSnap.autreReference || '',
    };
  } else if (tabType === 'crm') {
    merged.id = merged.id || `#${100000 + rowIndexZeroBased}`;
    merged.crmCategory = merged.crmCategory || 'SAV / Maintenance';
    merged.status = merged.status || 'Nouveau';
    merged.objet = merged.objet || '';
    merged.message = merged.message || '';
    merged.date = merged.date || new Date().toLocaleDateString('fr-FR');
  } else if (tabType === 'satisfaction') {
    merged.id = merged.id || `rev_${rowIndexZeroBased + 2}`;
    merged.clientName = merged.clientName || '';
    merged.collaboratorName = merged.collaboratorName || '';
    merged.rating = typeof merged.rating === 'number' ? merged.rating : (parseInt(String(merged.rating || '5'), 10) || 5);
    merged.comment = merged.comment || '';
    merged.missionRef = merged.missionRef || '';
    merged.date = merged.date || '';
  } else if (tabType === 'achatsFournisseurs') {
    merged.id = merged.id || merged.reference || `af_${rowIndexZeroBased + 2}`;
    merged.reference = merged.reference || merged.id;
    merged.orderRef = merged.orderRef || merged.orderReference || '';
    merged.orderReference = merged.orderReference || merged.orderRef || '';
    merged.supplierName = merged.supplierName || '';
    merged.supplierId = merged.supplierId || merged.supplierName || '';
    merged.comment = merged.comment || '';
    merged.date = merged.date || merged.dateStr || '';
    merged.dateStr = merged.dateStr || merged.date || '';
    merged.pdfFileName = merged.pdfFileName || merged.pdfName || '';
    merged.pdfName = merged.pdfName || merged.pdfFileName || '';
    merged.pdfDataUrl = merged.pdfDataUrl || merged.pdfUrl || '';
    merged.pdfUrl = merged.pdfUrl || merged.pdfDataUrl || '';
  } else if (tabType === 'temps') {
    merged.id = merged.id || `pt_${rowIndexZeroBased + 2}`;
    merged.techName = merged.techName || '';
    merged.startDate = normalizeDateStr(merged.startDate || '');
    merged.startTime = merged.startTime || '08:00';
    merged.isOngoing = Boolean(merged.isOngoing);
    if (typeof merged.durationSeconds === 'string') {
      const s = merged.durationSeconds.trim();
      if (s.includes(':')) {
        const parts = s.split(':').map((p: string) => parseInt(p, 10) || 0);
        merged.durationSeconds = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
      } else {
        merged.durationSeconds = parseInt(s, 10) || 0;
      }
    }
  } else if (tabType === 'ticketsCaisse') {
    merged.id = merged.id || `exp_${rowIndexZeroBased + 2}`;
    merged.user = merged.user || merged.techName || '';
    merged.techName = merged.techName || merged.user || '';
    merged.merchant = merged.merchant || merged.title || '';
    merged.title = merged.title || merged.merchant || '';
    merged.date = normalizeDateStr(merged.date || merged.dateStr || '');
    merged.dateStr = merged.dateStr || merged.date || '';
    const parsedTtc = typeof merged.amount === 'number' ? merged.amount : (typeof merged.amountTtc === 'number' ? merged.amountTtc : (parseFloat(String(merged.amount ?? merged.amountTtc ?? '0').replace(',', '.')) || 0));
    const parsedHt = typeof merged.amountHT === 'number' ? merged.amountHT : (typeof merged.amountHt === 'number' ? merged.amountHt : (parseFloat(String(merged.amountHT ?? merged.amountHt ?? '0').replace(',', '.')) || 0));
    const parsedTva = typeof merged.tva === 'number' ? merged.tva : (typeof merged.amountTva === 'number' ? merged.amountTva : (parseFloat(String(merged.tva ?? merged.amountTva ?? '0').replace(',', '.')) || 0));
    merged.amount = parsedTtc;
    merged.amountTtc = parsedTtc;
    merged.amountHT = parsedHt;
    merged.amountHt = parsedHt;
    merged.tva = parsedTva;
    merged.amountTva = parsedTva;
    merged.receiptUrl = merged.receiptUrl || merged.photoUrl || '';
    merged.photoUrl = merged.photoUrl || merged.receiptUrl || '';
    merged.category = merged.category || 'Frais';
    merged.status = merged.status || 'Validé';
  } else if (tabType === 'releveConcurrentiel') {
    merged.id = merged.id || `vc_${rowIndexZeroBased + 2}`;
    merged.commune = merged.commune || '';
    merged.volume = typeof merged.volume === 'number' ? merged.volume : (parseInt(String(merged.volume || '0'), 10) || 0);
    merged.mainteneurActuel = merged.mainteneurActuel || '';
    merged.prochaineMaintenance = normalizeDateStr(merged.prochaineMaintenance || '');
    merged.contactNomPrenom = merged.contactNomPrenom || '';
    merged.contactEmail = merged.contactEmail || '';
    merged.contactTelephone = merged.contactTelephone || '';
  } else if (tabType === 'messagesInternes') {
    merged.id = merged.id || `msg_${rowIndexZeroBased + 2}`;
    merged.authorName = merged.authorName || merged.sender || 'Membre';
    merged.sender = merged.sender || merged.authorName;
    merged.authorEmail = merged.authorEmail || '';
    merged.role = merged.role || 'Administrateur';
    merged.tag = merged.tag || merged.channel || 'Exploitation';
    merged.channel = merged.channel || merged.tag;
    merged.content = merged.content || merged.text || '';
    merged.text = merged.text || merged.content;
    merged.createdAt = merged.createdAt ? (isNaN(Number(merged.createdAt)) ? Date.parse(String(merged.createdAt)) || Date.now() : Number(merged.createdAt)) : Date.now();
    merged.dateStr = merged.dateStr || merged.time || new Date(merged.createdAt).toLocaleDateString('fr-FR');
    merged.time = merged.time || merged.dateStr;
  } else if (tabType === 'ged') {
    merged.id = merged.id || `ged_${rowIndexZeroBased + 2}`;
    merged.title = merged.title || '';
    merged.category = merged.category || 'Autre';
    merged.date = normalizeDateStr(merged.date || merged.dateStr || '');
    merged.dateStr = merged.dateStr || merged.date || '';
    merged.fileUrl = merged.fileUrl || '';
    merged.fileName = merged.fileName || merged.title || 'document.pdf';
    merged.fileSize = merged.fileSize || '';
  } else if (tabType === 'membresEnvironnement') {
    merged.id = merged.id || merged.email || merged.name || `mem_${rowIndexZeroBased + 2}`;
    merged.name = merged.name || '';
    merged.email = merged.email || '';
    merged.role = merged.role || 'Administrateur';
    merged.pin = String(merged.pin || '1234');
    // Reconstruct semaineTypique from flat columns if not already provided as JSON array
    if (!Array.isArray(merged.semaineTypique)) {
      const schedules: any[] = [];
      for (const idx of [1, 2]) {
        const prefix = `_st${idx}_`;
        const hasAny =
          merged[`${prefix}days`] ||
          merged[`${prefix}openContinuous`] ||
          merged[`${prefix}openMorning`] ||
          merged[`${prefix}commentaire`];
        if (hasAny) {
          const rawDays = merged[`${prefix}days`];
          const daysArr = Array.isArray(rawDays)
            ? rawDays
            : String(rawDays || '')
                .split(/[,;/|]/)
                .map(s => s.trim())
                .filter(Boolean);
          schedules.push({
            fermetureMidi: normalizeBool(merged[`${prefix}fermetureMidi`], false),
            openForMissions: merged[`${prefix}openForMissions`] !== undefined ? normalizeBool(merged[`${prefix}openForMissions`], true) : true,
            openMorning: merged[`${prefix}openMorning`] || '09:00',
            closeMorning: merged[`${prefix}closeMorning`] || '12:00',
            openAfternoon: merged[`${prefix}openAfternoon`] || '14:00',
            closeAfternoon: merged[`${prefix}closeAfternoon`] || '18:00',
            openContinuous: merged[`${prefix}openContinuous`] || '09:00',
            closeContinuous: merged[`${prefix}closeContinuous`] || '17:00',
            days: daysArr,
            commentaire: merged[`${prefix}commentaire`] || '',
          });
        }
      }
      if (schedules.length > 0) merged.semaineTypique = schedules;
    }
    // Reconstruct absences from flat columns if not already provided as JSON array
    if (!Array.isArray(merged.absences)) {
      const absList: any[] = [];
      for (const idx of [1, 2]) {
        const prefix = `_abs${idx}_`;
        if (merged[`${prefix}startDate`] || merged[`${prefix}endDate`] || merged[`${prefix}commentaire`]) {
          absList.push({
            startDate: normalizeDateStr(merged[`${prefix}startDate`] || ''),
            endDate: normalizeDateStr(merged[`${prefix}endDate`] || ''),
            commentaire: merged[`${prefix}commentaire`] || '',
          });
        }
      }
      if (absList.length > 0) merged.absences = absList;
    }
  } else if (tabType === 'reglages') {
    merged.id = merged.id || 'tenant_reglages';
    if (merged.name) merged.nomCommercial = merged.name;
    if (typeof merged.hiddenTabs === 'string') {
      merged.hiddenTabs = merged.hiddenTabs
        .split(/[,;|]/)
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
  } else if (tabType === 'apparenceRapportsPdf') {
    merged.id = merged.id || 'tenant_pdf_template';
  } else if (tabType === 'communicationPortailClient') {
    merged.id = merged.id || 'tenant_portal_com';
    merged.communicationPortailClient = merged.communicationPortailClient || merged.message || '';
  } else if (tabType === 'intituleEmplacements') {
    merged.id = merged.id || merged.emplacement || 'emplacements_config';
  } else if (tabType === 'observateurActionsSuspectes') {
    merged.id = merged.id || `sus_${rowIndexZeroBased + 2}`;
    merged.timestamp = merged.timestamp || new Date().toISOString();
    merged.userName = merged.userName || 'Utilisateur';
    merged.userIp = merged.userIp || 'Non renseignée';
    merged.actionType = merged.actionType || 'CONNEXION';
    merged.message = merged.message || '';
  }

  if (!merged.id) {
    merged.id =
      merged.identifiant ||
      merged.interventionReference ||
      merged.tourIdentifiant ||
      merged.reportId ||
      merged.numeroCommande ||
      merged.ugs ||
      merged.tourCode ||
      merged.reference ||
      merged.email ||
      `sheet_gen_${tabType}_${tenantId}_${rowIndexZeroBased + 2}`;
  }
  return merged;
}

function mapGenericRecordToRow(headers: string[], record: any, tabType?: SheetTabType): string[] {
  const rawExisting: Record<string, string> = record?._rawSheetRow || {};
  const outRow: string[] = headers.map(h => (rawExisting[h] !== undefined ? String(rawExisting[h]) : ''));
  const normHeaderMap = new Map<string, number>();
  headers.forEach((h, i) => {
    if (h) normHeaderMap.set(h.trim().toLowerCase(), i);
  });

  // Prepare an enriched record with derived flat fields (e.g. for membresEnvironnement, tournees, missionsTournees, rapportsPdf)
  const enriched: Record<string, any> = { ...(record || {}) };
  if (tabType === 'tournees') {
    enriched.tourIdentifiant = enriched.tourIdentifiant || enriched.identifiant || enriched.tourCode || enriched.id || '';
    enriched.title = enriched.title || enriched.name || '';
    enriched.startDate = enriched.startDate || enriched.date || '';
  } else if (tabType === 'missionsTournees') {
    const rawTid = String(enriched.tourIdentifiant ?? enriched.tourId ?? '').trim();
    enriched.tourIdentifiant = rawTid === 'a-trier' ? '' : rawTid;
    enriched.interventionReference = enriched.interventionReference || enriched.id || '';
    if (Array.isArray(enriched.reasons) && !enriched.reason) {
      enriched.reason = enriched.reasons.join(', ');
    }
    if (Array.isArray(enriched.requiredParts)) {
      enriched.requiredParts = enriched.requiredParts.join(', ');
    }
  } else if (tabType === 'rapportsPdf') {
    const snap = enriched.defibSnapshot && typeof enriched.defibSnapshot === 'object' ? enriched.defibSnapshot : {};
    for (const [sk, sv] of Object.entries(snap)) {
      if (sk === 'id' || sk === '_sheetRowNumber' || sk === '_rawSheetRow') continue;
      if (sv !== undefined && sv !== '' && sv !== null) {
        enriched[sk] = sv;
      }
    }
    enriched.interventionReference = enriched.interventionReference || enriched.reportNumber || enriched.id || enriched.reportId || '';
    enriched.autreReference = enriched.autreReference || snap.autreReference || '';
    enriched.identifiant = snap.identifiant || enriched.defibIdentifiant || enriched.identifiant || enriched.equipement || '';
    enriched.numeroSerie = snap.numeroSerie || enriched.numeroSerie || '';
    enriched.selectedEquipmentLabel =
      enriched.selectedEquipmentLabel ||
      (enriched.identifiant
        ? `${enriched.categorie || snap.categorie || 'Défibrillateur'} - ${enriched.identifiant}${enriched.numeroSerie ? ` - ${enriched.numeroSerie}` : ''}`
        : '');
    enriched.createdEquipmentType = enriched.createdEquipmentType || '';
    enriched.reportTitle = enriched.title || enriched.reportTitle || 'RAPPORT D’INTERVENTION';
    if (Array.isArray(enriched.reasons)) {
      enriched.reasons = enriched.reasons.join(', ');
    } else {
      enriched.reasons = enriched.reasons || enriched.reason || enriched.typeIntervention || '';
    }
    enriched.techName = enriched.techName || enriched.technicien || '';
    enriched.date = enriched.date || enriched.dateStr || enriched.interventionDate || enriched.dateMaintenance || '';
    enriched.missionSite = enriched.siteMission || enriched.missionSite || 'DÉPLACEMENT';
    enriched.bonDeCommande = enriched.bonDeCommande || snap.customBonCommande || snap.bonCommandeId || '';
    enriched.categorie = snap.categorie || enriched.categorie || 'Défibrillateur';
    enriched.modele = snap.modele || snap.modeleId || enriched.modele || '';
    enriched.denomination = snap.nomSite || snap.denomination || enriched.denomination || enriched.site || '';
    enriched.emplacement = snap.emplacement || snap.commentaireAdresse || enriched.emplacement || '';
    enriched.photoUrl = enriched.photoUrl || snap.photoUrl || '';
    enriched.photo2Url = enriched.photoArriereUrl || enriched.photo2Url || snap.photo2Url || '';
    enriched.photo3Url = enriched.photoResultatTestUrl || enriched.photo3Url || snap.photo3Url || '';
    enriched.clientName = enriched.clientName || enriched.entreprise || snap.clientNom || snap.clientId || enriched.clientId || '';
    enriched.modeleCoffret = snap.modeleCoffret || snap.modeleCoffretId || enriched.modeleCoffret || '';
    enriched.alarme = enriched.alarme || snap.alarme || snap.alarmeCoffret || '';
    enriched.signaletiqueConforme = enriched.signaletiqueConforme || snap.signaletiqueConforme || snap.signaletiqueBoitier || '';
    enriched.installeExterieur =
      enriched.installeExterieur ||
      snap.installeExterieur ||
      (snap.interieurExterieur === 'Extérieur' ? 'Oui' : snap.interieurExterieur === 'Intérieur' ? 'Non' : '');
    enriched.conforme =
      snap.conforme ||
      enriched.conforme ||
      (enriched.isConforme === true ? 'Oui' : enriched.isConforme === false ? 'Non' : 'Oui');
    enriched.diagnosticCommentaire = snap.commentaire || enriched.diagnosticCommentaire || enriched.remarques || '';
    enriched.internalComment =
      enriched.commentaireInterne ||
      snap.commentaireInterne ||
      enriched.internalComment ||
      record?.commentaire ||
      snap.internalComment ||
      '';
    enriched.status = enriched.validated ? 'Validé' : (enriched.status || enriched.statut || 'En modération');
    if (Array.isArray(enriched.drapeaux)) {
      enriched.drapeaux =
        enriched.drapeaux.length > 0
          ? enriched.drapeaux
              .map((f: any) => (typeof f === 'string' ? f : f?.nom || f?.id || ''))
              .filter(Boolean)
              .join(', ')
          : 'RAS';
    } else {
      enriched.drapeaux = enriched.drapeaux || 'RAS';
    }
    enriched.missionStatus = enriched.missionStatus || 'Exécutée';
    enriched.pdfUrl = enriched.pdfUrl || enriched.rapportUrl || snap.rapportUrl || '';

    // Section 11 / 12 boolean & array field conversions from GmaoCorrectionForm
    enriched.kitCiseaux = enriched.kitCiseauxPresents || snap.kitCiseauxPresents || enriched.kitCiseaux || snap.kitCiseaux || 'Oui';
    enriched.kitCompresses = enriched.kitServiettesPresentes || snap.kitServiettesPresentes || enriched.kitCompresses || snap.kitCompresses || 'Oui';
    enriched.kitRasoir = enriched.kitRasoirPresent || snap.kitRasoirPresent || enriched.kitRasoir || snap.kitRasoir || 'Oui';
    enriched.kitGants = enriched.kitGantsPresents || snap.kitGantsPresents || enriched.kitGants || snap.kitGants || 'Oui';
    enriched.kitMasque = enriched.kitMasquePresent || snap.kitMasquePresent || enriched.kitMasque || snap.kitMasque || 'Oui';
    enriched.demandeDevis =
      typeof enriched.demandeDevis === 'boolean'
        ? (enriched.demandeDevis ? 'Oui' : 'Non')
        : (enriched.demandeDevis || snap.demandeDevis || 'Non');
    if (Array.isArray(enriched.devisArticlesSelectionnes) && enriched.devisArticlesSelectionnes.length > 0) {
      enriched.motifDemandeDevis = enriched.devisArticlesSelectionnes.join(', ');
    } else {
      enriched.motifDemandeDevis = enriched.motifDemandeDevis || snap.motifDemandeDevis || '';
    }
    enriched.descriptionDemandeDevis = enriched.devisAutreInfo || enriched.descriptionDemandeDevis || snap.descriptionDemandeDevis || '';
    if (Array.isArray(enriched.attachments) && enriched.attachments.length > 0 && !enriched.pieceJointeDevisName) {
      enriched.pieceJointeDevisName = enriched.attachments.map((a: any) => a?.name || a?.url || '').filter(Boolean).join(', ');
    }
    if (enriched.etiquetteObligatoireConforme !== undefined) {
      enriched.etiquetteConforme = enriched.etiquetteObligatoireConforme ? 'Oui' : 'Non';
    }
    if (enriched.scelleConforme !== undefined) {
      enriched.scellePose = enriched.scelleConforme ? 'Oui' : 'Non';
    }
    if (enriched.stickerEntrepriseApplique !== undefined) {
      enriched.autocollantConforme = enriched.stickerEntrepriseApplique ? 'Oui' : 'Non';
    }

    // Populate prefixed section keys for canonical mapping
    enriched._s5_fabrication = snap.fabrication || enriched.fabrication || '';
    enriched._s5_miseEnService = snap.miseEnService || enriched.miseEnService || '';
    enriched._s6_modeleElectrodeA = snap.modeleElectrodeA || snap.modeleElectrodeAId || enriched.modeleElectrodeA || '';
    enriched._s6_lotElectrodeA = snap.lotElectrodeA || enriched.lotElectrodeA || '';
    enriched._s6_fabricationElectrodeA = snap.fabricationElectrodeA || enriched.fabricationElectrodeA || '';
    enriched._s6_peremptionElectrodeA = snap.peremptionElectrodeA || enriched.peremptionElectrodeA || '';
    enriched._s6_remplaceElectrodeA = enriched.electrodeARemplacee || enriched.remplaceElectrodeA || snap.remplaceElectrodeA || '';
    enriched._s6_destockElectrodeA =
      (enriched.selectionElectrodeARemplacee === 'Autre' ? enriched.customElectrodeARemplacee : enriched.selectionElectrodeARemplacee) ||
      enriched.destockElectrodeA ||
      snap.destockElectrodeA ||
      '';
    enriched._s6s_modeleElectrodeSecoursA =
      snap.modeleElectrodeSecoursA ||
      snap.modeleElectrodeASecoursId ||
      snap.modeleElectrodeSecoursAId ||
      enriched.modeleElectrodeSecoursA ||
      '';
    enriched._s6s_lotElectrodeSecoursA = snap.lotElectrodeASecours || snap.lotElectrodeSecoursA || enriched.lotElectrodeSecoursA || '';
    enriched._s6s_peremptionElectrodeSecoursA =
      snap.peremptionSecoursElectrodeA ||
      snap.peremptionElectrodeSecoursA ||
      enriched.peremptionElectrodeSecoursA ||
      '';
    enriched._s6s_remplaceElectrodeSecoursA =
      enriched.electrodeASecoursRemplacee || enriched.remplaceElectrodeSecoursA || snap.remplaceElectrodeSecoursA || '';
    enriched._s6s_destockElectrodeSecoursA =
      (enriched.selectionElectrodeASecoursRemplacee === 'Autre'
        ? enriched.customElectrodeASecoursRemplacee
        : enriched.selectionElectrodeASecoursRemplacee) ||
      enriched.destockElectrodeSecoursA ||
      snap.destockElectrodeSecoursA ||
      '';
    enriched._s7_modeleElectrodeP = snap.modeleElectrodeP || snap.modeleElectrodePId || enriched.modeleElectrodeP || '';
    enriched._s7_lotElectrodeP = snap.lotElectrodeP || enriched.lotElectrodeP || '';
    enriched._s7_fabricationElectrodeP = snap.fabricationElectrodeP || enriched.fabricationElectrodeP || '';
    enriched._s7_peremptionElectrodeP = snap.peremptionElectrodeP || enriched.peremptionElectrodeP || '';
    enriched._s7_remplaceElectrodeP = enriched.electrodePRemplacee || enriched.remplaceElectrodeP || snap.remplaceElectrodeP || '';
    enriched._s7_destockElectrodeP =
      (enriched.selectionElectrodePRemplacee === 'Autre' ? enriched.customElectrodePRemplacee : enriched.selectionElectrodePRemplacee) ||
      enriched.destockElectrodeP ||
      snap.destockElectrodeP ||
      '';
    enriched._s7s_modeleElectrodeSecoursP =
      snap.modeleElectrodeSecoursP ||
      snap.modeleElectrodePSecoursId ||
      snap.modeleElectrodeSecoursPId ||
      enriched.modeleElectrodeSecoursP ||
      '';
    enriched._s7s_lotElectrodeSecoursP = snap.lotElectrodePSecours || snap.lotElectrodeSecoursP || enriched.lotElectrodeSecoursP || '';
    enriched._s7s_peremptionElectrodeSecoursP =
      snap.peremptionSecoursElectrodeP ||
      snap.peremptionElectrodeSecoursP ||
      enriched.peremptionElectrodeSecoursP ||
      '';
    enriched._s7s_remplaceElectrodeSecoursP =
      enriched.electrodePSecoursRemplacee || enriched.remplaceElectrodeSecoursP || snap.remplaceElectrodeSecoursP || '';
    enriched._s7s_destockElectrodeSecoursP =
      (enriched.selectionElectrodePSecoursRemplacee === 'Autre'
        ? enriched.customElectrodePSecoursRemplacee
        : enriched.selectionElectrodePSecoursRemplacee) ||
      enriched.destockElectrodeSecoursP ||
      snap.destockElectrodeSecoursP ||
      '';
    enriched._s8_modeleBatterie = snap.modeleBatterie || snap.modeleBatterieId || enriched.modeleBatterie || '';
    enriched._s8_lotBatterie = snap.lotBatterie || enriched.lotBatterie || '';
    enriched._s8_fabricationBatterie = snap.fabricationBatterie || enriched.fabricationBatterie || '';
    enriched._s8_miseEnServiceBatterie =
      snap.insertionBatterie || snap.miseEnServiceBatterie || enriched.miseEnServiceBatterie || '';
    enriched._s8_peremptionBatterie = snap.peremptionBatterie || enriched.peremptionBatterie || '';
    enriched._s8_remplaceBatterie = enriched.batterieRemplacee || enriched.remplaceBatterie || snap.remplaceBatterie || '';
    enriched._s8_destockBatterie =
      (enriched.selectionBatterieRemplacee === 'Autre' ? enriched.customBatterieRemplacee : enriched.selectionBatterieRemplacee) ||
      enriched.destockBatterie ||
      snap.destockBatterie ||
      '';
    enriched._s9_modelePile = snap.modelePile || snap.modelePileId || enriched.modelePile || '';
    enriched._s9_lotPile = snap.lotPile || enriched.lotPile || '';
    enriched._s9_fabricationPile = snap.fabricationPile || enriched.fabricationPile || '';
    enriched._s9_miseEnServicePile = snap.miseEnServicePile || enriched.miseEnServicePile || '';
    enriched._s9_peremptionPile = snap.peremptionPile || enriched.peremptionPile || '';
    enriched._s9_remplacePile = enriched.remplacePile || snap.remplacePile || '';
    enriched._s9_destockPile = enriched.destockPile || snap.destockPile || '';
    enriched._s10_modeleKit = snap.modeleKit || snap.modeleKitId || enriched.modeleKit || '';
    enriched._s10_lotKit = snap.lotKit || enriched.lotKit || '';
    enriched._s10_peremptionKit = enriched.kitPeremption || snap.peremptionTrousse || snap.peremptionKit || enriched.peremptionKit || '';
    enriched._s10_remplaceKit = enriched.kitSecoursRemplaceOuAjoute || enriched.remplaceKit || snap.remplaceKit || '';
    enriched._s10_destockKit =
      (enriched.selectionKitSecoursRemplace === 'Autre' ? enriched.customKitSecoursRemplace : enriched.selectionKitSecoursRemplace) ||
      enriched.destockKit ||
      snap.destockKit ||
      '';
  } else if (tabType === 'achatsFournisseurs') {
    enriched.orderRef = enriched.orderRef || enriched.orderReference || '';
    enriched.date = enriched.date || enriched.dateStr || '';
    enriched.pdfFileName = enriched.pdfFileName || enriched.pdfName || '';
    enriched.pdfDataUrl = enriched.pdfDataUrl || enriched.pdfUrl || '';
  } else if (tabType === 'ticketsCaisse') {
    enriched.user = enriched.user || enriched.techName || '';
    enriched.merchant = enriched.merchant || enriched.title || '';
    enriched.date = enriched.date || enriched.dateStr || '';
    enriched.amountHT = enriched.amountHT ?? enriched.amountHt ?? 0;
    enriched.tva = enriched.tva ?? enriched.amountTva ?? 0;
    enriched.amount = enriched.amount ?? enriched.amountTtc ?? 0;
    enriched.receiptUrl = enriched.receiptUrl || enriched.photoUrl || '';
  } else if (tabType === 'ged') {
    enriched.date = enriched.date || enriched.dateStr || '';
  } else if (tabType === 'messagesInternes') {
    enriched.authorName = enriched.authorName || enriched.sender || '';
    enriched.tag = enriched.tag || enriched.channel || 'Exploitation';
    enriched.content = enriched.content || enriched.text || '';
    enriched.dateStr = enriched.dateStr || enriched.time || '';
  } else if (tabType === 'membresEnvironnement') {
    const stList = Array.isArray(enriched.semaineTypique) ? enriched.semaineTypique.slice(0, 2) : [];
    stList.forEach((st: any, i: number) => {
      const p = `_st${i + 1}_`;
      enriched[`${p}fermetureMidi`] = st.fermetureMidi ? 'Oui' : 'Non';
      enriched[`${p}openForMissions`] = st.openForMissions !== false ? 'Oui' : 'Non';
      enriched[`${p}openMorning`] = st.openMorning || '';
      enriched[`${p}closeMorning`] = st.closeMorning || '';
      enriched[`${p}openAfternoon`] = st.openAfternoon || '';
      enriched[`${p}closeAfternoon`] = st.closeAfternoon || '';
      enriched[`${p}openContinuous`] = st.openContinuous || '';
      enriched[`${p}closeContinuous`] = st.closeContinuous || '';
      enriched[`${p}days`] = Array.isArray(st.days) ? st.days.join(', ') : (st.days || '');
      enriched[`${p}commentaire`] = st.commentaire || '';
    });
    const absList = Array.isArray(enriched.absences) ? enriched.absences.slice(0, 2) : [];
    absList.forEach((ab: any, i: number) => {
      const p = `_abs${i + 1}_`;
      enriched[`${p}startDate`] = ab.startDate || '';
      enriched[`${p}endDate`] = ab.endDate || '';
      enriched[`${p}commentaire`] = ab.commentaire || '';
    });
  } else if (tabType === 'reglages') {
    if (Array.isArray(enriched.hiddenTabs)) {
      enriched.hiddenTabs = enriched.hiddenTabs.join(', ');
    }
  }

  // 1. Map via canonical definitions if tabType is known
  if (tabType && GENERIC_CANONICAL_HEADERS[tabType]) {
    const colToDef = resolveGenericColumnFieldMap(headers, tabType);
    for (const [colIdx, def] of colToDef.entries()) {
      const v = enriched[def.field];
      if (v !== undefined && v !== null) {
        outRow[colIdx] = typeof v === 'object' ? JSON.stringify(v) : String(v);
      }
    }
  }

  // 2. Also map any direct key matches
  for (const [k, v] of Object.entries(enriched)) {
    if (k.startsWith('_') || v === undefined || v === null) continue;
    const colIdx = normHeaderMap.get(k.trim().toLowerCase());
    if (colIdx !== undefined) {
      outRow[colIdx] = typeof v === 'object' ? JSON.stringify(v) : String(v);
    }
  }

  const jsonColIdx = normHeaderMap.get('_json');
  if (jsonColIdx !== undefined) {
    const cleanCopy: Record<string, any> = {};
    for (const [k, v] of Object.entries(record || {})) {
      if (!k.startsWith('_')) cleanCopy[k] = v;
    }
    try {
      outRow[jsonColIdx] = JSON.stringify(cleanCopy);
    } catch (_) {}
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
    return [
      item.id,
      !isPlaceholderClientValue(item.clientIdField) ? item.clientIdField : '',
      item.denomination,
    ]
      .filter(Boolean)
      .map(s => String(s).trim().toLowerCase());
  }
  if (tabType === 'autresMateriels') {
    return [item.id, item.identifiant, item.numeroSerie, item.specifiques?.numSerie, item.denomination]
      .filter(Boolean)
      .map(s => String(s).trim().toLowerCase());
  }
  if (tabType === 'tournees') {
    return [item.tourIdentifiant, item.identifiant, item.tourCode, item.id]
      .filter(Boolean)
      .map(s => String(s).trim().toLowerCase());
  }
  if (tabType === 'missionsTournees') {
    return [item.interventionReference, item.id]
      .filter(Boolean)
      .map(s => String(s).trim().toLowerCase());
  }
  if (tabType === 'rapportsPdf') {
    return [item.interventionReference, item.reportNumber, item.id, item.reportId]
      .filter(Boolean)
      .map(s => String(s).trim().toLowerCase());
  }
  if (tabType === 'membresEnvironnement') {
    return [item.email, item.id, item.name]
      .filter(Boolean)
      .map(s => String(s).trim().toLowerCase());
  }
  if (tabType === 'reglages' || tabType === 'apparenceRapportsPdf' || tabType === 'communicationPortailClient') {
    return [item.id || `singleton_${tabType}`, 'row_2']
      .filter(Boolean)
      .map(s => String(s).trim().toLowerCase());
  }
  if (tabType === 'intituleEmplacements') {
    return [item.id, item.emplacement, 'emplacements_config']
      .filter(Boolean)
      .map(s => String(s).trim().toLowerCase());
  }
  if (tabType !== 'defibrillateurs') {
    return [item.id, item.identifiant, item.interventionReference, item.tourIdentifiant, item.reportId, item.numeroCommande, item.ugs, item.tourCode, item.reference, item.orderRef, item.email, item.nom]
      .filter(Boolean)
      .map(s => String(s).trim().toLowerCase());
  }
  return [item.id, item.identifiant, item.numeroSerie]
    .filter(Boolean)
    .map(s => String(s).trim().toLowerCase());
}

const sheetWriteLocks = new Map<string, Promise<any>>();

async function withSheetWriteLock<T>(spreadsheetId: string, fn: () => Promise<T>): Promise<T> {
  const prev = sheetWriteLocks.get(spreadsheetId) || Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>(resolve => {
    release = resolve;
  });
  sheetWriteLocks.set(spreadsheetId, prev.then(() => next, () => next));
  try {
    await prev.catch(() => {});
    return await fn();
  } finally {
    release();
  }
}

// ==========================================
// 5. LIVE GOOGLE SHEET FETCHING & WRITING
// ==========================================
const sheetTabMetaCache = new Map<string, { title: string; sheetId: number }>();

async function resolveSheetTabMeta(spreadsheetId: string, gid?: string | null): Promise<{ title: string | null; sheetId: number | null }> {
  const cacheKey = `${spreadsheetId}_${gid || '0'}`;
  if (sheetTabMetaCache.has(cacheKey)) {
    return sheetTabMetaCache.get(cacheKey)!;
  }

  const cfg = getGlobalGoogleConfig();
  const accessToken = await getServiceAccountAccessToken();

  const tryFetchMeta = async (useBearer: boolean): Promise<{ title: string; sheetId: number } | null> => {
    try {
      const headersInit: Record<string, string> = useBearer && accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
      const queryKey = !useBearer && cfg.apiKey ? `&key=${encodeURIComponent(cfg.apiKey)}` : '';
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties(sheetId,title)${queryKey}`,
        { headers: headersInit, signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) return null;
      const json = await res.json();
      const sheets = Array.isArray(json?.sheets) ? json.sheets : [];
      if (sheets.length === 0) return null;
      if (gid !== undefined && gid !== null && gid !== '') {
        const matched = sheets.find((s: any) => String(s?.properties?.sheetId) === String(gid));
        if (matched?.properties?.title !== undefined && matched?.properties?.sheetId !== undefined) {
          const meta = { title: String(matched.properties.title), sheetId: Number(matched.properties.sheetId) };
          sheetTabMetaCache.set(cacheKey, meta);
          return meta;
        }
      }
      const firstProps = sheets[0]?.properties;
      if (firstProps?.title !== undefined && firstProps?.sheetId !== undefined) {
        const meta = { title: String(firstProps.title), sheetId: Number(firstProps.sheetId) };
        sheetTabMetaCache.set(cacheKey, meta);
        return meta;
      }
    } catch (_) {}
    return null;
  };

  if (accessToken) {
    const meta = await tryFetchMeta(true);
    if (meta) return meta;
  }
  if (cfg.apiKey) {
    const meta = await tryFetchMeta(false);
    if (meta) return meta;
  }
  return { title: null, sheetId: gid ? Number(gid) : null };
}

async function resolveSheetTabTitle(spreadsheetId: string, gid?: string | null): Promise<string | null> {
  const meta = await resolveSheetTabMeta(spreadsheetId, gid);
  return meta.title;
}

function buildSheetRangePrefix(sheetTitle: string | null): string {
  if (!sheetTitle) return '';
  return `'${sheetTitle.replace(/'/g, "''")}'!`;
}

const inFlightSheetFetches = new Map<
  string,
  Promise<{
    items: any[];
    headers: string[];
    totalCount: number;
    stats: SheetCollectionStats;
    fromSpreadsheet: boolean;
    hasRemoteHeaders?: boolean;
  }>
>();

function parseSheetDateHelper(dStr: string | undefined | null): Date | null {
  if (!dStr) return null;
  const s = String(dStr).trim();
  if (!s) return null;
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        return new Date(year, month, day);
      }
    }
  }
  if (s.includes('-')) {
    const parts = s.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        return new Date(year, month, day);
      }
    }
  }
  const fallback = Date.parse(s);
  if (!isNaN(fallback)) {
    return new Date(fallback);
  }
  return null;
}

function computeNextMaintFromLast(lastStr: string | undefined | null): string {
  const d = parseSheetDateHelper(lastStr);
  if (!d) return '';
  const next = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, '0');
  const day = String(next.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function computeSheetCollectionStats(items: any[], tabType: SheetTabType): SheetCollectionStats {
  if (tabType !== 'defibrillateurs') {
    return {
      totalCount: items.length,
      totalMainOui: items.length,
      totalMainNon: 0,
      conformeEtAJourCount: items.length,
      eligibleMainOuiCount: items.length,
      compliancePercent: 100,
      distinctModels: [],
      distinctCoffrets: [],
      distinctElectrodes: [],
      distinctBatteries: [],
    };
  }

  let totalMainOui = 0;
  let totalMainNon = 0;
  let eligibleMainOuiCount = 0;
  let conformeEtAJourCount = 0;
  const modelsSet = new Set<string>();
  const coffretsSet = new Set<string>();
  const electrodesSet = new Set<string>();
  const batteriesSet = new Set<string>();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();

  for (let i = 0; i < items.length; i++) {
    const df = items[i];
    if (!df) continue;

    if (df.modeleId) modelsSet.add(String(df.modeleId).trim());
    if (df.modeleCoffretId) coffretsSet.add(String(df.modeleCoffretId).trim());
    if (df.modeleElectrodeAId) electrodesSet.add(String(df.modeleElectrodeAId).trim());
    if (df.modeleElectrodeASecoursId) electrodesSet.add(String(df.modeleElectrodeASecoursId).trim());
    if (df.modeleElectrodePId) electrodesSet.add(String(df.modeleElectrodePId).trim());
    if (df.modeleElectrodePSecoursId) electrodesSet.add(String(df.modeleElectrodePSecoursId).trim());
    if (df.modeleBatterieId) batteriesSet.add(String(df.modeleBatterieId).trim());
    if (df.modeleBatterieSecoursId) batteriesSet.add(String(df.modeleBatterieSecoursId).trim());

    const rawFsm = String(
      df.fsmAutorise ?? df.maintenanceAutorisee ?? df.maintenance_autorisee ?? df.fsm_autorise ?? 'Oui'
    )
      .trim()
      .toLowerCase();

    if (rawFsm === 'non' || rawFsm === 'false' || rawFsm === '0') {
      totalMainNon++;
    } else {
      totalMainOui++;
      eligibleMainOuiCount++;

      let isCompliant = df.conforme !== 'Non';
      if (isCompliant) {
        const nextMaintStr = df.prochaineMaintenance || computeNextMaintFromLast(df.derniereMaintenance);
        const datesToCheck = [
          parseSheetDateHelper(nextMaintStr),
          parseSheetDateHelper(df.peremptionElectrodeA),
          parseSheetDateHelper(df.peremptionElectrodeP),
          parseSheetDateHelper(df.peremptionBatterie),
        ];
        for (const d of datesToCheck) {
          if (d) {
            d.setHours(0, 0, 0, 0);
            if (d.getTime() < todayTime) {
              isCompliant = false;
              break;
            }
          }
        }
      }
      if (isCompliant) {
        conformeEtAJourCount++;
      }
    }
  }

  const compliancePercent =
    eligibleMainOuiCount > 0
      ? Math.max(0, Math.min(100, Math.round((conformeEtAJourCount / eligibleMainOuiCount) * 100)))
      : 0;

  return {
    totalCount: items.length,
    totalMainOui,
    totalMainNon,
    conformeEtAJourCount,
    eligibleMainOuiCount,
    compliancePercent,
    distinctModels: Array.from(modelsSet).filter(Boolean),
    distinctCoffrets: Array.from(coffretsSet).filter(Boolean),
    distinctElectrodes: Array.from(electrodesSet).filter(Boolean),
    distinctBatteries: Array.from(batteriesSet).filter(Boolean),
  };
}

async function fetchRawSheetMatrix(spreadsheetUrl: string): Promise<{ headers: string[]; rows: string[][] } | null> {
  const extracted = extractSpreadsheetIdAndGid(spreadsheetUrl);
  if (!extracted) return null;
  const { spreadsheetId, gid } = extracted;
  const cfg = getGlobalGoogleConfig();

  // Strategy 1: Google Sheets API v4 (Service Account first, then API Key fallback)
  const accessToken = await getServiceAccountAccessToken();
  const metaCacheKey = `${spreadsheetId}_${gid || '0'}`;
  const cachedMeta = sheetTabMetaCache.get(metaCacheKey);
  const sheetTitle =
    cachedMeta?.title ||
    (gid && gid !== '0' ? await resolveSheetTabTitle(spreadsheetId, gid) : null);
  const rangeStr = sheetTitle ? `'${sheetTitle.replace(/'/g, "''")}'` : 'A1:ZZ100000';
  const targetRange = encodeURIComponent(rangeStr);

  if (accessToken) {
    try {
      const apiRes = await fetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${targetRange}`,
        { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(60000) },
        2
      );
      if (apiRes.ok) {
        const json = await apiRes.json();
        if (Array.isArray(json?.values) && json.values.length > 0) {
          const headers = (json.values[0] || []).map((c: any) => String(c || '').trim());
          const rows = json.values.slice(1).map((r: any[]) => r.map(c => String(c ?? '').trim()));
          return { headers, rows };
        }
        return { headers: [], rows: [] };
      }
    } catch (_) {}
  }

  if (cfg.apiKey) {
    try {
      const apiRes = await fetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${targetRange}?key=${encodeURIComponent(cfg.apiKey)}`,
        { signal: AbortSignal.timeout(45000) },
        2
      );
      if (apiRes.ok) {
        const json = await apiRes.json();
        if (Array.isArray(json?.values) && json.values.length > 0) {
          const headers = (json.values[0] || []).map((c: any) => String(c || '').trim());
          const rows = json.values.slice(1).map((r: any[]) => r.map(c => String(c ?? '').trim()));
          return { headers, rows };
        }
        return { headers: [], rows: [] };
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
        signal: AbortSignal.timeout(35000),
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
          return { headers: [], rows: [] };
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
        signal: AbortSignal.timeout(35000),
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

const recentSheetUpserts = new Map<string, Map<string, { item: any; updatedAtMs: number; syncedToRemoteSheet: boolean }>>();

export function getSheetCacheKey(tabType: SheetTabType, spreadsheetId: string, gid?: string | null): string {
  return `${tabType}_${spreadsheetId}_${gid || '0'}`;
}

export function isSheetCollectionCached(spreadsheetUrl: string, tabType: SheetTabType): boolean {
  const extracted = extractSpreadsheetIdAndGid(spreadsheetUrl);
  if (!extracted) return false;
  const cacheKey = getSheetCacheKey(tabType, extracted.spreadsheetId, extracted.gid);
  return sheetMemoryCache.has(cacheKey);
}

export async function fetchTenantSheetCollection(
  spreadsheetUrl: string,
  tenantId: string,
  tabType: SheetTabType,
  forceRefresh = false
): Promise<{
  items: any[];
  headers: string[];
  totalCount: number;
  stats: SheetCollectionStats;
  fromSpreadsheet: boolean;
  hasRemoteHeaders?: boolean;
}> {
  const extracted = extractSpreadsheetIdAndGid(spreadsheetUrl);
  if (!extracted) {
    return {
      items: [],
      headers: [],
      totalCount: 0,
      stats: computeSheetCollectionStats([], tabType),
      fromSpreadsheet: false,
      hasRemoteHeaders: false,
    };
  }

  const cacheKey = getSheetCacheKey(tabType, extracted.spreadsheetId, extracted.gid);
  if (!sheetMemoryCache.has(cacheKey)) {
    const diskSnap = loadDiskSnapshot(cacheKey);
    if (diskSnap && Array.isArray(diskSnap.items) && diskSnap.items.length > 0) {
      sheetMemoryCache.set(cacheKey, diskSnap);
    }
  }

  if (!forceRefresh && sheetMemoryCache.has(cacheKey)) {
    const cached = sheetMemoryCache.get(cacheKey)!;
    if (cached.items.length > 0) {
      if (Date.now() - cached.fetchedAt > 300000 && !inFlightSheetFetches.has(cacheKey)) {
        setImmediate(() => {
          fetchTenantSheetCollection(spreadsheetUrl, tenantId, tabType, true).catch(() => {});
        });
      }
      return {
        items: cached.items,
        headers: cached.headers,
        totalCount: cached.items.length,
        stats: cached.stats,
        fromSpreadsheet: true,
        hasRemoteHeaders: cached.headers.length > 0,
      };
    }
  }

  if (inFlightSheetFetches.has(cacheKey)) {
    return inFlightSheetFetches.get(cacheKey)!;
  }

  const fetchStartedAt = Date.now();
  const fetchPromise = (async () => {
    try {
      const overlay = loadMirrorOverlay(tenantId, tabType, extracted.spreadsheetId);
      const rawMatrix = await fetchRawSheetMatrix(spreadsheetUrl);
      const hasRemoteHeaders = Boolean(rawMatrix && rawMatrix.headers && rawMatrix.headers.length > 0);

      const defaultHeaders =
        tabType === 'defibrillateurs'
          ? DEFIB_CANONICAL_HEADERS.map(d => d.header)
          : tabType === 'autresMateriels'
          ? AUTRES_CANONICAL_HEADERS.map(d => d.header)
          : tabType === 'clients'
          ? CLIENTS_CANONICAL_HEADERS.map(d => d.header)
          : getDefaultGenericHeaders(tabType);

      const headers = hasRemoteHeaders
        ? rawMatrix!.headers
        : (overlay.headers.length > 0 ? overlay.headers : defaultHeaders);

      if (hasRemoteHeaders && JSON.stringify(overlay.headers) !== JSON.stringify(rawMatrix!.headers)) {
        overlay.headers = rawMatrix!.headers;
        saveMirrorOverlay(tenantId, tabType, extracted.spreadsheetId, overlay);
      }

      const deletedSet = new Set((overlay.deletedIds || []).map(k => String(k).trim().toLowerCase()));
      const baseItems: any[] = [];

      const canonicalDefs =
        tabType === 'defibrillateurs'
          ? DEFIB_CANONICAL_HEADERS
          : tabType === 'autresMateriels'
          ? AUTRES_CANONICAL_HEADERS
          : tabType === 'clients'
          ? CLIENTS_CANONICAL_HEADERS
          : [];
      const precomputedMatches = canonicalDefs.length > 0 ? buildColumnMatches(headers, canonicalDefs) : [];

      if (rawMatrix && Array.isArray(rawMatrix.rows)) {
        for (let i = 0; i < rawMatrix.rows.length; i++) {
          const r = rawMatrix.rows[i];
          if (!r || r.every(c => !c || String(c).trim() === '')) continue;

          const mapped =
            tabType === 'defibrillateurs'
              ? mapRowToDefib(headers, r, i, tenantId, precomputedMatches)
              : tabType === 'autresMateriels'
              ? mapRowToAutreMateriel(headers, r, i, tenantId, precomputedMatches)
              : tabType === 'clients'
              ? mapRowToClient(headers, r, i, tenantId, precomputedMatches)
              : mapRowToGenericRecord(headers, r, i, tenantId, tabType);

          // Ignore phantom rows where primary identifying columns were cleared in Google Sheets
          if (tabType === 'defibrillateurs') {
            const hasRealDefibIdentity =
              (mapped.identifiant && !String(mapped.identifiant).startsWith('sheet_df_')) ||
              Boolean(mapped.numeroSerie);
            if (!hasRealDefibIdentity) continue;
          } else if (tabType === 'clients') {
            const hasRealClientIdentity =
              (mapped.clientIdField && !String(mapped.clientIdField).startsWith('sheet_cli_')) ||
              Boolean(mapped.denomination) ||
              Boolean(mapped.siret);
            if (!hasRealClientIdentity) continue;
          } else if (tabType === 'autresMateriels') {
            const hasRealAutreIdentity =
              (mapped.identifiant && !String(mapped.identifiant).startsWith('sheet_am_')) ||
              Boolean(mapped.denomination) ||
              Boolean(mapped.specifiques?.numSerie);
            if (!hasRealAutreIdentity) continue;
          }

          if (deletedSet.size > 0) {
            const keys = getRecordLookupKeys(mapped, tabType);
            if (keys.some(k => deletedSet.has(k))) continue;
          }

          baseItems.push(mapped);
        }
      }

      // Merge upserted records from overlay (matching by ID / Identifiant / SIRET / _sheetRowNumber)
      const upsertedEntries = Object.values(overlay.upsertedById || {});
      if (upsertedEntries.length > 0) {
        for (const upItem of upsertedEntries) {
          if (!upItem || typeof upItem !== 'object') continue;
          if (
            String(upItem.id || '').startsWith('sheet_df_') ||
            String(upItem.identifiant || '').startsWith('sheet_df_') ||
            String(upItem.id || '').startsWith('sheet_am_') ||
            String(upItem.identifiant || '').startsWith('sheet_am_') ||
            String(upItem.id || '').startsWith('sheet_cli_')
          ) {
            continue;
          }
          const upKeys = getRecordLookupKeys(upItem, tabType);
          if (deletedSet.size > 0 && upKeys.some(k => deletedSet.has(k))) continue;

          const existingIdx = baseItems.findIndex(b => {
            if (upItem._sheetRowNumber && b._sheetRowNumber && upItem._sheetRowNumber === b._sheetRowNumber) {
              return true;
            }
            const bKeys = getRecordLookupKeys(b, tabType);
            return bKeys.some(bk => upKeys.includes(bk));
          });

          if (existingIdx >= 0) {
            const { _rawSheetRow: _ignoreRaw, ...cleanUp } = upItem;
            if (tabType === 'clients' && isPlaceholderClientValue(cleanUp.id)) {
              delete cleanUp.id;
            }
            if (tabType === 'defibrillateurs') {
              if (isPlaceholderClientValue(cleanUp.clientId)) cleanUp.clientId = '';
              if (isPlaceholderClientValue(cleanUp.clientIdField)) cleanUp.clientIdField = '';
            }
            baseItems[existingIdx] = {
              ...baseItems[existingIdx],
              ...cleanUp,
              _sheetRowNumber: baseItems[existingIdx]._sheetRowNumber || upItem._sheetRowNumber,
            };
          } else {
            const { _rawSheetRow: _ignoreRaw, ...cleanUp } = upItem;
            if (tabType === 'clients' && isPlaceholderClientValue(cleanUp.id)) {
              const slug = String(cleanUp.denomination || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '');
              cleanUp.id = slug ? `cli_${slug}` : `cli_up_${baseItems.length + 1}`;
            }
            baseItems.push(cleanUp);
          }
        }
      }

      // Also merge any in-memory recent upserts that occurred during or shortly before this fetch
      const recentMap = recentSheetUpserts.get(cacheKey);
      if (recentMap && recentMap.size > 0) {
        for (const [rk, entry] of recentMap.entries()) {
          if (!entry || !entry.item) continue;
          if (entry.syncedToRemoteSheet && fetchStartedAt > entry.updatedAtMs + 30000) {
            recentMap.delete(rk);
            continue;
          }
          const recItem = entry.item;
          const upKeys = getRecordLookupKeys(recItem, tabType);
          if (deletedSet.size > 0 && upKeys.some(k => deletedSet.has(k))) continue;
          const existingIdx = baseItems.findIndex(b => {
            if (recItem._sheetRowNumber && b._sheetRowNumber && recItem._sheetRowNumber === b._sheetRowNumber) {
              return true;
            }
            const bKeys = getRecordLookupKeys(b, tabType);
            return bKeys.some(bk => upKeys.includes(bk));
          });
          if (existingIdx >= 0) {
            baseItems[existingIdx] = {
              ...baseItems[existingIdx],
              ...recItem,
              _sheetRowNumber: recItem._sheetRowNumber || baseItems[existingIdx]._sheetRowNumber,
            };
          } else {
            baseItems.push(recItem);
          }
        }
      }

      if (tabType === 'clients') {
        const seenClientIds = new Set<string>();
        for (let i = 0; i < baseItems.length; i++) {
          const item = baseItems[i];
          if (!item) continue;
          let cid = String(item.id || '').trim();
          if (!cid || isPlaceholderClientValue(cid)) {
            const slug = String(item.denomination || '')
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '_')
              .replace(/^_+|_+$/g, '');
            cid = slug ? `cli_${slug}` : `cli_row_${item._sheetRowNumber || i + 2}`;
          }
          if (seenClientIds.has(cid)) {
            cid = `${cid}_r${item._sheetRowNumber || i + 2}`;
          }
          seenClientIds.add(cid);
          item.id = cid;
        }
      }

      // Never overwrite a warm non-empty cache with an empty result caused by a transient Google API timeout/rate-limit (when rawMatrix is null)
      const prevCached = sheetMemoryCache.get(cacheKey);
      if (baseItems.length === 0 && prevCached && prevCached.items.length > 0 && !rawMatrix) {
        return {
          items: prevCached.items,
          headers: prevCached.headers,
          totalCount: prevCached.items.length,
          stats: prevCached.stats,
          fromSpreadsheet: true,
          hasRemoteHeaders: prevCached.headers.length > 0,
        };
      }

      const stats = computeSheetCollectionStats(baseItems, tabType);

      const snapshotToStore: CachedSheetResult = {
        headers,
        items: baseItems,
        stats,
        fetchedAt: Date.now(),
        spreadsheetUrl,
      };

      if (rawMatrix !== null || baseItems.length > 0 || !prevCached) {
        sheetMemoryCache.set(cacheKey, snapshotToStore);
      }
      if (rawMatrix !== null || baseItems.length > 0) {
        saveDiskSnapshotAsync(cacheKey, snapshotToStore);
      }

      return {
        items: baseItems,
        headers,
        totalCount: baseItems.length,
        stats,
        fromSpreadsheet: true,
        hasRemoteHeaders,
      };
    } finally {
      inFlightSheetFetches.delete(cacheKey);
    }
  })();

  inFlightSheetFetches.set(cacheKey, fetchPromise);
  return fetchPromise;
}

export async function queryTenantSheetCollection(
  spreadsheetUrl: string,
  tenantId: string,
  tabType: SheetTabType,
  params: SheetQueryFilterParams
): Promise<{
  items: any[];
  totalFilteredCount: number;
  totalCount: number;
  stats: SheetCollectionStats;
  fromSpreadsheet: boolean;
}> {
  const data = await fetchTenantSheetCollection(spreadsheetUrl, tenantId, tabType, false);
  const allItems = data.items || [];
  const searchLower = String(params.search || '').trim().toLowerCase();
  const advTerms = Array.isArray(params.advancedSearchTerms)
    ? params.advancedSearchTerms.map(t => String(t || '').trim().toLowerCase()).filter(t => t.length >= 2)
    : [];
  const advOp = params.advancedSearchOperator === 'AND' ? 'AND' : 'OR';
  const region = params.region && params.region !== 'Tous' ? params.region.trim() : '';
  const modeleId = params.modeleId && params.modeleId !== 'Tous' ? params.modeleId.trim().toLowerCase() : '';
  const modeleAliases = Array.isArray(params.modeleAliases)
    ? params.modeleAliases.map(a => String(a || '').trim().toLowerCase()).filter(Boolean)
    : [];
  const clientId = params.clientId && params.clientId !== 'Tous' ? params.clientId.trim().toLowerCase() : '';
  const clientMatchTerms = Array.isArray(params.clientMatchTerms)
    ? params.clientMatchTerms.map(c => String(c || '').trim().toLowerCase()).filter(Boolean)
    : [];
  const categorie = params.categorie && params.categorie !== 'Tous' ? params.categorie.trim() : '';
  const contrat = params.contrat && params.contrat !== 'Tous' ? params.contrat.trim() : '';
  const maintenanceFilter = params.maintenanceFilter || 'all';
  const selectedDepartment =
    params.selectedDepartment && params.selectedDepartment !== '__ALL__' ? params.selectedDepartment.trim().toUpperCase() : '';
  const needDates = Boolean(params.actionExpired || params.actionUnder3 || params.action3To6);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();

  let filtered = allItems.filter(df => {
    if (!df) return false;

    if (region && df.region !== region) return false;

    if (modeleId) {
      const dfMod = String(df.modeleId || df.modele || '').trim().toLowerCase();
      const matched = dfMod === modeleId || modeleAliases.includes(dfMod);
      if (!matched) return false;
    }

    if (clientId) {
      const dfCliId = String(df.clientId || '').trim().toLowerCase();
      const dfCliField = String(df.clientIdField || '').trim().toLowerCase();
      const dfNomSite = String(df.nomSite || '').trim().toLowerCase();
      const dfCliNom = String(df.clientNom || '').trim().toLowerCase();
      const matched =
        dfCliId === clientId ||
        dfCliField === clientId ||
        clientMatchTerms.includes(dfCliId) ||
        clientMatchTerms.includes(dfCliField) ||
        clientMatchTerms.includes(dfNomSite) ||
        clientMatchTerms.includes(dfCliNom);
      if (!matched) return false;
    }

    if (categorie) {
      if (categorie === 'Loué' && df.loue !== 'Oui') return false;
      if (categorie === 'Prêté' && df.prete !== 'Oui') return false;
      if (categorie === 'Stocké' && df.stocke !== 'Oui') return false;
      if (categorie === 'Archivé' && df.archive !== 'Oui') return false;
      if (categorie === 'Sous-Traitance' && df.sousTraitance !== 'Oui') return false;
    }

    if (maintenanceFilter === 'oui' || maintenanceFilter === 'non') {
      const rawFsm = String(df.fsmAutorise || 'Oui').trim().toLowerCase();
      const fsmVal = rawFsm === 'non' ? 'non' : 'oui';
      if (maintenanceFilter !== fsmVal) return false;
    }

    if (contrat) {
      const activeContrat = df.contrat || 'Non';
      if (activeContrat !== contrat) return false;
    }

    if (selectedDepartment) {
      const rawCp = String(df.codePostal || df.cp || '').trim().replace(/\s+/g, '').toUpperCase();
      if (!rawCp) return false;
      if (selectedDepartment === '2A') {
        if (!rawCp.startsWith('2A') && !rawCp.startsWith('200') && !rawCp.startsWith('201')) return false;
      } else if (selectedDepartment === '2B') {
        if (!rawCp.startsWith('2B') && !rawCp.startsWith('202') && !rawCp.startsWith('206')) return false;
      } else {
        const normalized = /^\d{4}$/.test(rawCp) ? '0' + rawCp : rawCp;
        if (!normalized.startsWith(selectedDepartment)) return false;
      }
    }

    if (searchLower && advTerms.length === 0) {
      const haystacks = [
        df.identifiant,
        df.numeroSerie,
        df.ville,
        df.cp,
        df.nomSite,
        df.clientNom,
        df.modeleId,
        df.numeroAtlasante,
        df.versionLogiciel,
        df.nomPrenomSite,
        df.categorieEtablissement,
        df.commentaire,
        df.commentaireCoffret,
        df.commentaireAdresse,
        df.commentaireElectrodeA,
        df.commentaireElectrodeP,
        df.commentaireBatterie,
        df.commentaireCampagneRappel,
      ];
      const matches = haystacks.some(v => v && String(v).toLowerCase().includes(searchLower));
      if (!matches) return false;
    }

    if (advTerms.length > 0) {
      const defibValues = [
        df.identifiant,
        df.numeroSerie,
        df.numeroAtlasante,
        df.ville,
        df.nomSite,
        df.clientNom,
        df.cp,
        df.numVoie,
        df.region,
        df.pays,
        df.modeleId,
        df.lotBatterie,
        df.lotElectrodeA,
        df.lotElectrodeP,
        df.numeroLotCoffret,
        df.nomPrenomSite,
        df.telephoneSite,
        df.emailSite,
        df.versionLogiciel,
        df.categorieEtablissement,
        df.commentaire,
        df.commentaireCoffret,
        df.commentaireAdresse,
        df.commentaireElectrodeA,
        df.commentaireElectrodeP,
        df.commentaireBatterie,
        df.commentaireCampagneRappel,
      ]
        .filter(Boolean)
        .map(v => String(v).toLowerCase());

      const matchesTerm = (term: string) => defibValues.some(val => val.includes(term));
      if (advOp === 'AND') {
        if (!advTerms.every(matchesTerm)) return false;
      } else {
        if (!advTerms.some(matchesTerm)) return false;
      }
    }

    if (needDates) {
      const timesToCheck: number[] = [];
      const nextMaintStr = df.prochaineMaintenance || computeNextMaintFromLast(df.derniereMaintenance);
      const mDate = parseSheetDateHelper(nextMaintStr);
      if (mDate) {
        mDate.setHours(0, 0, 0, 0);
        timesToCheck.push(mDate.getTime());
      }
      const eADate = parseSheetDateHelper(df.peremptionElectrodeA);
      if (eADate) {
        eADate.setHours(0, 0, 0, 0);
        timesToCheck.push(eADate.getTime());
      }
      const ePDate = parseSheetDateHelper(df.peremptionElectrodeP);
      if (ePDate) {
        ePDate.setHours(0, 0, 0, 0);
        timesToCheck.push(ePDate.getTime());
      }
      const bDate = parseSheetDateHelper(df.peremptionBatterie);
      if (bDate) {
        bDate.setHours(0, 0, 0, 0);
        timesToCheck.push(bDate.getTime());
      }

      if (params.actionExpired) {
        if (!timesToCheck.some(t => t < todayTime)) return false;
      }
      if (params.actionUnder3) {
        if (
          !timesToCheck.some(t => {
            const diffDays = Math.ceil((t - todayTime) / (1000 * 60 * 60 * 24));
            return diffDays >= 0 && diffDays < 90;
          })
        ) {
          return false;
        }
      }
      if (params.action3To6) {
        if (
          !timesToCheck.some(t => {
            const diffDays = Math.ceil((t - todayTime) / (1000 * 60 * 60 * 24));
            return diffDays >= 90 && diffDays <= 180;
          })
        ) {
          return false;
        }
      }
    }

    return true;
  });

  if (params.sortFilter === 'recent') {
    filtered = [...filtered].reverse();
  } else if (params.sortFilter === 'closest_maintenance') {
    filtered = [...filtered].sort((a, b) => {
      const nextA = parseSheetDateHelper(a.prochaineMaintenance || computeNextMaintFromLast(a.derniereMaintenance));
      const nextB = parseSheetDateHelper(b.prochaineMaintenance || computeNextMaintFromLast(b.derniereMaintenance));
      const tA = nextA ? nextA.getTime() : Infinity;
      const tB = nextB ? nextB.getTime() : Infinity;
      return tA - tB;
    });
  }

  const totalFilteredCount = filtered.length;
  const offset = Math.max(0, Number(params.offset) || 0);
  const limit = Math.max(1, Math.min(25000, Number(params.limit) || 25000));
  const sliced = filtered.slice(offset, offset + limit);

  return {
    items: sliced,
    totalFilteredCount,
    totalCount: data.totalCount,
    stats: data.stats,
    fromSpreadsheet: data.fromSpreadsheet,
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

function extractRowNumFromSyntheticId(idVal?: string): number | undefined {
  if (!idVal) return undefined;
  const m = String(idVal).trim().match(/^sheet_(?:df|am|cli|gen_[a-z0-9]+)_[^_]+_(\d+)$/i);
  if (m && m[1]) {
    const rn = parseInt(m[1], 10);
    if (!isNaN(rn) && rn >= 2) return rn;
  }
  return undefined;
}

async function fetchWithRetry(url: string, init: RequestInit, maxAttempts = 3): Promise<Response> {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408)) {
        return res;
      }
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 250 * attempt));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 250 * attempt));
      }
    }
  }
  throw lastErr || new Error('Network error contacting Google Sheets API');
}

async function fetchLightweightSheetContextForColdUpsert(
  spreadsheetId: string,
  gid: string | null,
  tabType: SheetTabType,
  tenantId: string,
  records: any[],
  accessToken: string | null
): Promise<{
  headers: string[];
  hasRemoteHeaders: boolean;
  matchedByRecordIdx: Map<number, any>;
}> {
  const defaultHeaders =
    tabType === 'defibrillateurs'
      ? DEFIB_CANONICAL_HEADERS.map(d => d.header)
      : tabType === 'autresMateriels'
      ? AUTRES_CANONICAL_HEADERS.map(d => d.header)
      : tabType === 'clients'
      ? CLIENTS_CANONICAL_HEADERS.map(d => d.header)
      : getDefaultGenericHeaders(tabType, records);

  const matchedByRecordIdx = new Map<number, any>();
  if (!accessToken) {
    return { headers: defaultHeaders, hasRemoteHeaders: false, matchedByRecordIdx };
  }

  try {
    const sheetTitle = await resolveSheetTabTitle(spreadsheetId, gid);
    const rangePrefix = buildSheetRangePrefix(sheetTitle);
    const candidateRowNums = new Map<number, number>();
    let anyMissingRowNum = false;

    const isSingletonTab =
      tabType === 'reglages' ||
      tabType === 'apparenceRapportsPdf' ||
      tabType === 'communicationPortailClient' ||
      (tabType === 'intituleEmplacements' && records.length === 1 && !records[0]?.emplacement);

    records.forEach((rec, idx) => {
      if (!rec || typeof rec !== 'object') return;
      const rn =
        (typeof rec._sheetRowNumber === 'number' && rec._sheetRowNumber >= 2 ? rec._sheetRowNumber : undefined) ||
        extractRowNumFromSyntheticId(rec.id) ||
        extractRowNumFromSyntheticId(rec.identifiant) ||
        (isSingletonTab && idx === 0 ? 2 : undefined);
      if (rn) {
        candidateRowNums.set(idx, rn);
      } else {
        anyMissingRowNum = true;
      }
    });

    // Step 1: Fetch header row A1:ZZ1 + any candidate rows in a single lightweight batchGet (~120ms)
    const uniqueCandidateRows = Array.from(new Set(candidateRowNums.values()));
    const initialRanges = [`${rangePrefix}A1:ZZ1`, ...uniqueCandidateRows.map(rn => `${rangePrefix}A${rn}:ZZ${rn}`)];
    const queryParams = initialRanges.map(r => `ranges=${encodeURIComponent(r)}`).join('&');
    const batchRes = await fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${queryParams}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8000),
      },
      2
    );

    let headers: string[] = [];
    let hasRemoteHeaders = false;
    const fetchedRowsByNumber = new Map<number, string[]>();

    if (batchRes.ok) {
      const batchJson = await batchRes.json();
      const valueRanges: any[] = Array.isArray(batchJson?.valueRanges) ? batchJson.valueRanges : [];
      if (valueRanges[0]?.values?.[0]?.length > 0) {
        headers = valueRanges[0].values[0].map((c: any) => String(c ?? '').trim());
        hasRemoteHeaders = true;
      }
      uniqueCandidateRows.forEach((rn, i) => {
        const vr = valueRanges[i + 1];
        if (vr?.values?.[0]) {
          fetchedRowsByNumber.set(rn, vr.values[0].map((c: any) => String(c ?? '').trim()));
        }
      });
    }

    const effectiveHeaders = headers.length > 0 ? headers : defaultHeaders;
    const canonicalDefs =
      tabType === 'defibrillateurs'
        ? DEFIB_CANONICAL_HEADERS
        : tabType === 'autresMateriels'
        ? AUTRES_CANONICAL_HEADERS
        : tabType === 'clients'
        ? CLIENTS_CANONICAL_HEADERS
        : [];
    const precomputedMatches = canonicalDefs.length > 0 ? buildColumnMatches(effectiveHeaders, canonicalDefs) : [];

    const mapSingleRow = (rowArr: string[], rowNumber: number) =>
      tabType === 'defibrillateurs'
        ? mapRowToDefib(effectiveHeaders, rowArr, rowNumber - 2, tenantId, precomputedMatches)
        : tabType === 'autresMateriels'
        ? mapRowToAutreMateriel(effectiveHeaders, rowArr, rowNumber - 2, tenantId, precomputedMatches)
        : tabType === 'clients'
        ? mapRowToClient(effectiveHeaders, rowArr, rowNumber - 2, tenantId, precomputedMatches)
        : mapRowToGenericRecord(effectiveHeaders, rowArr, rowNumber - 2, tenantId, tabType);

    // Verify candidate rows
    for (const [recIdx, rn] of candidateRowNums.entries()) {
      const rowArr = fetchedRowsByNumber.get(rn);
      if (rowArr && rowArr.some(c => c !== '')) {
        const mapped = mapSingleRow(rowArr, rn);
        const recKeys = getRecordLookupKeys(records[recIdx], tabType);
        const mappedKeys = getRecordLookupKeys(mapped, tabType);
        if (isSingletonTab || recKeys.length === 0 || mappedKeys.some(mk => recKeys.includes(mk))) {
          matchedByRecordIdx.set(recIdx, mapped);
        } else {
          anyMissingRowNum = true;
        }
      } else if (!isSingletonTab) {
        anyMissingRowNum = true;
      }
    }

    // Step 2: If any record lacked a verified _sheetRowNumber, scan identifier/serial columns A2:Z50000 (~180ms)
    if (anyMissingRowNum && hasRemoteHeaders) {
      const idRange = encodeURIComponent(`${rangePrefix}A2:Z50000`);
      const idRes = await fetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${idRange}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(10000),
        },
        2
      );
      if (idRes.ok) {
        const idJson = await idRes.json();
        const idRows: any[][] = Array.isArray(idJson?.values) ? idJson.values : [];
        const rowsToFetchFull = new Map<number, number>(); // recIdx -> rowNumber

        records.forEach((rec, recIdx) => {
          if (!rec || matchedByRecordIdx.has(recIdx)) return;
          const targetKeys = new Set(getRecordLookupKeys(rec, tabType));
          if (targetKeys.size === 0) return;
          for (let i = 0; i < idRows.length; i++) {
            const r = idRows[i];
            if (!r || r.length === 0) continue;
            for (let c = 0; c < r.length; c++) {
              const cellVal = String(r[c] ?? '').trim().toLowerCase();
              if (cellVal && targetKeys.has(cellVal)) {
                rowsToFetchFull.set(recIdx, i + 2);
                break;
              }
            }
            if (rowsToFetchFull.has(recIdx)) break;
          }
        });

        if (rowsToFetchFull.size > 0) {
          const fullRowNums = Array.from(new Set(rowsToFetchFull.values()));
          const fullQuery = fullRowNums.map(rn => `ranges=${encodeURIComponent(`${rangePrefix}A${rn}:ZZ${rn}`)}`).join('&');
          const fullRes = await fetchWithRetry(
            `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${fullQuery}`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
              signal: AbortSignal.timeout(8000),
            },
            2
          );
          if (fullRes.ok) {
            const fullJson = await fullRes.json();
            const vrs: any[] = Array.isArray(fullJson?.valueRanges) ? fullJson.valueRanges : [];
            const rowMap = new Map<number, string[]>();
            fullRowNums.forEach((rn, idx) => {
              if (vrs[idx]?.values?.[0]) {
                rowMap.set(rn, vrs[idx].values[0].map((c: any) => String(c ?? '').trim()));
              }
            });
            for (const [recIdx, rn] of rowsToFetchFull.entries()) {
              const rArr = rowMap.get(rn);
              if (rArr) {
                matchedByRecordIdx.set(recIdx, mapSingleRow(rArr, rn));
              }
            }
          }
        }
      }
    }

    return { headers: effectiveHeaders, hasRemoteHeaders, matchedByRecordIdx };
  } catch (err) {
    console.warn('[GoogleSheetsEngine] Lightweight cold upsert lookup warning:', err);
    return { headers: defaultHeaders, hasRemoteHeaders: false, matchedByRecordIdx };
  }
}

export async function upsertRecordsToTenantSheet(
  spreadsheetUrl: string,
  tenantId: string,
  tabType: SheetTabType,
  records: any[]
): Promise<{ success: boolean; count: number; syncedToRemoteSheet: boolean; records?: any[]; remoteError?: string }> {
  const extracted = extractSpreadsheetIdAndGid(spreadsheetUrl);
  if (!extracted || !Array.isArray(records) || records.length === 0) {
    return { success: false, count: 0, syncedToRemoteSheet: false };
  }

  return withSheetWriteLock(extracted.spreadsheetId, async () => {
    const cacheKey = getSheetCacheKey(tabType, extracted.spreadsheetId, extracted.gid);
    const accessToken = await getServiceAccountAccessToken();
    const cfg = getGlobalGoogleConfig();

    const isCacheWarm = sheetMemoryCache.has(cacheKey);
    const warmCached = isCacheWarm ? sheetMemoryCache.get(cacheKey)! : null;

    let headers: string[] = [];
    let hasRemoteHeaders = false;
    let coldMatchedByRecordIdx = new Map<number, any>();

    if (warmCached && warmCached.headers.length > 0) {
      headers = warmCached.headers;
      hasRemoteHeaders = true;
    } else {
      // FAST PATH: Never block on downloading 18,000+ rows when cache is cold!
      // Fetch only the header row + target row(s) directly from Google Sheets in ~150-300ms.
      const lightCtx = await fetchLightweightSheetContextForColdUpsert(
        extracted.spreadsheetId,
        extracted.gid,
        tabType,
        tenantId,
        records,
        accessToken
      );
      headers = lightCtx.headers;
      hasRemoteHeaders = lightCtx.hasRemoteHeaders;
      coldMatchedByRecordIdx = lightCtx.matchedByRecordIdx;
    }

    const overlay = loadMirrorOverlay(tenantId, tabType, extracted.spreadsheetId);
    overlay.headers = headers;

    const deletedSet = new Set((overlay.deletedIds || []).map(k => String(k).trim().toLowerCase()));
    const rowsToUpdateRemote: Array<{ rowNumber: number; values: string[]; key: string }> = [];
    const rowsToAppendRemote: Array<{ values: string[]; key: string; itemRef: any }> = [];
    const upsertedList: any[] = [];
    const processedPrimaryKeys = new Set<string>();
    const updatedItemsList = warmCached ? warmCached.items : [];
    const isSingletonTab =
      tabType === 'reglages' ||
      tabType === 'apparenceRapportsPdf' ||
      tabType === 'communicationPortailClient' ||
      (tabType === 'intituleEmplacements' && records.length === 1 && !records[0]?.emplacement);

    for (let rIdx = 0; rIdx < records.length; rIdx++) {
      const rec = records[rIdx];
      if (!rec || typeof rec !== 'object') continue;
      const recKeys = getRecordLookupKeys(rec, tabType);
      const primaryKey = recKeys[0] || `item_${Date.now()}_${Math.random()}`;
      if (processedPrimaryKeys.has(primaryKey)) continue;
      processedPrimaryKeys.add(primaryKey);

      recKeys.forEach(k => deletedSet.delete(k));

      let existingIdx = -1;
      let existingItem: any = undefined;

      if (warmCached) {
        const candidateRn =
          (typeof rec._sheetRowNumber === 'number' && rec._sheetRowNumber >= 2 ? rec._sheetRowNumber : undefined) ||
          extractRowNumFromSyntheticId(rec.id) ||
          extractRowNumFromSyntheticId(rec.identifiant) ||
          (isSingletonTab && rIdx === 0 ? 2 : undefined);

        if (candidateRn) {
          existingIdx = updatedItemsList.findIndex(b => b && b._sheetRowNumber === candidateRn);
        }
        if (existingIdx < 0) {
          existingIdx = updatedItemsList.findIndex(b => {
            if (!b) return false;
            const bKeys = getRecordLookupKeys(b, tabType);
            return bKeys.some(bk => recKeys.includes(bk));
          });
        }
        if (existingIdx < 0 && isSingletonTab && updatedItemsList.length > 0) {
          existingIdx = 0;
        }
        if (existingIdx >= 0) {
          existingItem = updatedItemsList[existingIdx];
        }
      } else {
        existingItem = coldMatchedByRecordIdx.get(rIdx);
      }

      const resolvedRowNum =
        (typeof rec._sheetRowNumber === 'number' && rec._sheetRowNumber >= 2 ? rec._sheetRowNumber : undefined) ||
        existingItem?._sheetRowNumber ||
        extractRowNumFromSyntheticId(rec.id) ||
        extractRowNumFromSyntheticId(rec.identifiant);

      const mergedItem = existingItem
        ? {
            ...existingItem,
            ...rec,
            ...(resolvedRowNum ? { _sheetRowNumber: resolvedRowNum } : {}),
            _rawSheetRow: {
              ...(existingItem._rawSheetRow || {}),
              ...(rec._rawSheetRow || {}),
            },
          }
        : {
            ...rec,
            ...(resolvedRowNum ? { _sheetRowNumber: resolvedRowNum } : {}),
          };

      if (tabType === 'clients' && !mergedItem.clientIdField && mergedItem.id) {
        mergedItem.clientIdField = mergedItem.id;
      }
      if (tabType === 'autresMateriels' && !mergedItem.identifiant && mergedItem.id) {
        mergedItem.identifiant = mergedItem.id;
      }

      const rowValues =
        tabType === 'defibrillateurs'
          ? mapDefibToRow(headers, mergedItem)
          : tabType === 'autresMateriels'
          ? mapAutreMaterielToRow(headers, mergedItem)
          : tabType === 'clients'
          ? mapClientToRow(headers, mergedItem)
          : mapGenericRecordToRow(headers, mergedItem, tabType);

      const rawByHeader: Record<string, string> = {};
      headers.forEach((h, i) => {
        rawByHeader[h] = rowValues[i] ?? '';
      });
      mergedItem._rawSheetRow = rawByHeader;

      if (existingItem) {
        const oldKeys = getRecordLookupKeys(existingItem, tabType);
        for (const ok of oldKeys) {
          if (ok !== primaryKey && overlay.upsertedById[ok]) {
            delete overlay.upsertedById[ok];
          }
        }
      }

      if (warmCached) {
        if (existingIdx >= 0) {
          updatedItemsList[existingIdx] = mergedItem;
        } else {
          updatedItemsList.push(mergedItem);
        }
      }

      upsertedList.push(mergedItem);

      if (mergedItem._sheetRowNumber && typeof mergedItem._sheetRowNumber === 'number' && mergedItem._sheetRowNumber >= 2) {
        rowsToUpdateRemote.push({ rowNumber: mergedItem._sheetRowNumber, values: rowValues, key: primaryKey });
      } else {
        rowsToAppendRemote.push({ values: rowValues, key: primaryKey, itemRef: mergedItem });
      }
    }

    // Push to live Google Sheet via Service Account or Apps Script Bridge
    let syncedToRemoteSheet = false;
    let remoteError = '';

    if (accessToken) {
      try {
        const sheetTitle = await resolveSheetTabTitle(extracted.spreadsheetId, extracted.gid);
        const rangePrefix = buildSheetRangePrefix(sheetTitle);
        const lastColLetter = columnIndexToLetter(headers.length - 1);

        // If remote sheet was completely blank (no header row), write the canonical header row first
        if (!hasRemoteHeaders && (!warmCached || warmCached.items.length === 0)) {
          await fetchWithRetry(
            `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(extracted.spreadsheetId)}/values:batchUpdate`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                valueInputOption: 'USER_ENTERED',
                data: [
                  {
                    range: `${rangePrefix}A1:${lastColLetter}1`,
                    values: [headers],
                  },
                ],
              }),
              signal: AbortSignal.timeout(10000),
            },
            2
          ).catch(() => {});
        }

        if (rowsToUpdateRemote.length > 0) {
          const dataPayload = rowsToUpdateRemote.map(u => ({
            range: `${rangePrefix}A${u.rowNumber}:${lastColLetter}${u.rowNumber}`,
            values: [u.values],
          }));
          const batchRes = await fetchWithRetry(
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
              signal: AbortSignal.timeout(12000),
            },
            3
          );
          if (batchRes.ok) {
            syncedToRemoteSheet = true;
          } else {
            const errText = await batchRes.text().catch(() => '');
            remoteError = `HTTP ${batchRes.status}: ${errText.slice(0, 300)}`;
            console.warn('[GoogleSheetsEngine] Remote Sheets API batchUpdate error:', remoteError);
          }
        }

        if (rowsToAppendRemote.length > 0) {
          const appendTarget = encodeURIComponent(`${rangePrefix}A1`);
          const appendRes = await fetchWithRetry(
            `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(extracted.spreadsheetId)}/values/${appendTarget}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                values: rowsToAppendRemote.map(r => r.values),
              }),
              signal: AbortSignal.timeout(12000),
            },
            3
          );
          if (appendRes.ok) {
            syncedToRemoteSheet = true;
            try {
              const appendJson = await appendRes.json();
              const updatedRange: string = appendJson?.updates?.updatedRange || '';
              const rowMatch = updatedRange.match(/![A-Z]+(\d+)/i) || updatedRange.match(/^[A-Z]+(\d+)/i);
              if (rowMatch && rowMatch[1]) {
                const startRowNum = parseInt(rowMatch[1], 10);
                if (!isNaN(startRowNum) && startRowNum >= 2) {
                  rowsToAppendRemote.forEach((appItem, idx) => {
                    if (appItem.itemRef) {
                      appItem.itemRef._sheetRowNumber = startRowNum + idx;
                    }
                  });
                }
              }
            } catch (_) {}
          } else {
            const errText = await appendRes.text().catch(() => '');
            remoteError = `HTTP ${appendRes.status}: ${errText.slice(0, 300)}`;
            console.warn('[GoogleSheetsEngine] Remote Sheets API append error:', remoteError);
          }
        }
      } catch (err: any) {
        remoteError = err?.message || String(err);
        console.warn('[GoogleSheetsEngine] Remote Sheets API write warning:', err);
      }
    }

    if (!syncedToRemoteSheet && cfg.appsScriptBridgeUrl) {
      try {
        const bridgeRes = await fetchWithRetry(
          cfg.appsScriptBridgeUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'upsertRows',
              spreadsheetUrl,
              spreadsheetId: extracted.spreadsheetId,
              gid: extracted.gid,
              headers,
              updates: rowsToUpdateRemote,
              appends: rowsToAppendRemote.map(r => ({ values: r.values, key: r.key })),
            }),
            redirect: 'follow',
            signal: AbortSignal.timeout(12000),
          },
          2
        );
        if (bridgeRes.ok) {
          syncedToRemoteSheet = true;
          remoteError = '';
        }
      } catch (err) {
        console.warn('[GoogleSheetsEngine] Apps Script Bridge write warning:', err);
      }
    }

    // Track in recentSheetUpserts in memory so any in-flight or immediate subsequent read sees the exact saved row
    let sheetRecentMap = recentSheetUpserts.get(cacheKey);
    if (!sheetRecentMap) {
      sheetRecentMap = new Map();
      recentSheetUpserts.set(cacheKey, sheetRecentMap);
    }
    const nowMs = Date.now();
    for (const item of upsertedList) {
      const itemKeys = getRecordLookupKeys(item, tabType);
      const pk = itemKeys[0] || `item_${nowMs}`;
      sheetRecentMap.set(pk, { item, updatedAtMs: nowMs, syncedToRemoteSheet });
    }

    // Update overlay asynchronously in background so disk I/O never slows down the HTTP response
    setImmediate(() => {
      try {
        if (syncedToRemoteSheet) {
          overlay.upsertedById = {};
        } else {
          for (const item of upsertedList) {
            const itemKeys = getRecordLookupKeys(item, tabType);
            const pk = itemKeys[0] || `item_${nowMs}`;
            overlay.upsertedById[pk] = item;
          }
        }
        overlay.deletedIds = Array.from(deletedSet);
        overlay.lastSyncedAt = nowMs;
        saveMirrorOverlay(tenantId, tabType, extracted.spreadsheetId, overlay);
      } catch (_) {}
    });

    if (warmCached) {
      warmCached.fetchedAt = Date.now();
      warmCached.headers = headers;
      // Recompute collection stats and save disk snapshot asynchronously in background
      setImmediate(() => {
        try {
          warmCached.stats = computeSheetCollectionStats(warmCached.items, tabType);
          saveDiskSnapshotAsync(cacheKey, warmCached);
        } catch (_) {}
      });
    } else {
      // Warm full sheet cache in background without blocking the response
      setImmediate(() => {
        fetchTenantSheetCollection(spreadsheetUrl, tenantId, tabType, false).catch(() => {});
      });
    }

    return {
      success: syncedToRemoteSheet,
      count: upsertedList.length,
      syncedToRemoteSheet,
      records: upsertedList,
      ...(remoteError ? { remoteError } : {}),
    };
  });
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

  return withSheetWriteLock(extracted.spreadsheetId, async () => {
    const cacheKey = getSheetCacheKey(tabType, extracted.spreadsheetId, extracted.gid);
    const currentData = await fetchTenantSheetCollection(spreadsheetUrl, tenantId, tabType, false);
    const overlay = loadMirrorOverlay(tenantId, tabType, extracted.spreadsheetId);
    const normTargets = new Set(targetKeys.filter(Boolean).map(k => String(k).trim().toLowerCase()));

    const rowNumbersToClearSet = new Set<number>();

    // Also parse explicit row numbers from any synthetic sheet_df_ / sheet_am_ / sheet_cli_ / sheet_gen_ keys
    for (const tk of targetKeys) {
      if (!tk) continue;
      const m = String(tk).trim().match(/^sheet_(?:df|am|cli|gen_[a-z0-9]+)_[^_]+_(\d+)$/i);
      if (m && m[1]) {
        const rn = parseInt(m[1], 10);
        if (!isNaN(rn) && rn >= 2) {
          rowNumbersToClearSet.add(rn);
        }
      }
    }

    const remainingItems: any[] = [];
    for (const item of currentData.items) {
      const iKeys = getRecordLookupKeys(item, tabType);
      const isRowTargeted = item._sheetRowNumber && rowNumbersToClearSet.has(item._sheetRowNumber);
      if (isRowTargeted || iKeys.some(k => normTargets.has(k))) {
        if (item._sheetRowNumber && typeof item._sheetRowNumber === 'number' && item._sheetRowNumber >= 2) {
          rowNumbersToClearSet.add(item._sheetRowNumber);
        }
        iKeys.forEach(k => normTargets.add(k));
      } else {
        remainingItems.push(item);
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

    const rowNumbersToClear = Array.from(rowNumbersToClearSet).sort((a, b) => b - a);
    let syncedToRemoteSheet = false;
    const accessToken = await getServiceAccountAccessToken();
    const cfg = getGlobalGoogleConfig();

    if (accessToken && rowNumbersToClear.length > 0) {
      try {
        const tabMeta = await resolveSheetTabMeta(extracted.spreadsheetId, extracted.gid);
        const rangePrefix = buildSheetRangePrefix(tabMeta.title);
        // 1. Clear full rows using A1 whole-row notation (e.g. 'Feuille 1'!4:4) so no trailing columns (e.g. col > 90) ever remain
        const ranges = rowNumbersToClear.map(rn => `${rangePrefix}${rn}:${rn}`);
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

        // 2. Physically delete the rows from the Google Sheet in descending row order so no blank row gap stays
        if (tabMeta.sheetId !== null && !isNaN(tabMeta.sheetId)) {
          const deleteRequests = rowNumbersToClear.map(rn => ({
            deleteDimension: {
              range: {
                sheetId: tabMeta.sheetId,
                dimension: 'ROWS',
                startIndex: rn - 1,
                endIndex: rn,
              },
            },
          }));
          const delDimRes = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(extracted.spreadsheetId)}:batchUpdate`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ requests: deleteRequests }),
            }
          );
          if (delDimRes.ok) {
            syncedToRemoteSheet = true;
            // Adjust _sheetRowNumber in remainingItems for rows below deleted rows
            for (const deletedRn of rowNumbersToClear) {
              for (const rem of remainingItems) {
                if (rem._sheetRowNumber && rem._sheetRowNumber > deletedRn) {
                  rem._sheetRowNumber -= 1;
                }
              }
            }
          }
        }
      } catch (_) {}
    }

    if (!syncedToRemoteSheet && cfg.appsScriptBridgeUrl && rowNumbersToClear.length > 0) {
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

    if (syncedToRemoteSheet) {
      overlay.deletedIds = [];
      saveMirrorOverlay(tenantId, tabType, extracted.spreadsheetId, overlay);
    }

    if (currentData.headers.length > 0) {
      const updatedSnapshot: CachedSheetResult = {
        headers: currentData.headers,
        items: remainingItems,
        stats: computeSheetCollectionStats(remainingItems, tabType),
        fetchedAt: Date.now(),
        spreadsheetUrl,
      };
      sheetMemoryCache.set(cacheKey, updatedSnapshot);
      saveDiskSnapshotAsync(cacheKey, updatedSnapshot);
    }
    return { success: true, deletedCount: normTargets.size, syncedToRemoteSheet };
  });
}
