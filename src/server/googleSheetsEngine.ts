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
  | 'devisFactures'
  | 'stocks'
  | 'stocksGlobaux'
  | 'stocksDistribues'
  | 'historiqueNotifications'
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
  | 'observateurActionsSuspectes'
  | 'exportations';

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
  clientVolumes?: Record<string, number>;
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
  hasRemoteHeaders?: boolean;
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
  // Section 1
  { header: 'Section 1 - Identifiant.', field: 'identifiant', aliases: ['identifiant', 'id', 'identifiantdae', 'code', 'identifiantunique', 'identificationidentifiant'] },
  { header: 'Section 1 - Série.', field: 'numeroSerie', aliases: ['serie', 'numerodeserie', 'numeroserie', 'numserie', 'sn', 'serial', 'identificationserie', 'identificationnumerodeserie'] },
  { header: 'Section 1 - Modèle.', field: 'modeleId', aliases: ['modele', 'modeledae', 'modeledefibrillateur', 'modeleid', 'model', 'identificationmodele', 'identificationmodeleidentifiantunique', 'modeleidentifiantunique'] },
  { header: 'Section 1 - Numéro Atlasanté.', field: 'numeroAtlasante', aliases: ['numeroatlasante', 'atlasante', 'idatlasante', 'geodae', 'identificationnumeroatlasante'] },
  { header: 'Section 1 - Version du logiciel.', field: 'versionLogiciel', aliases: ['versiondulogiciel', 'versionlogiciel', 'firmware', 'version', 'identificationversionlogiciel', 'identificationversiondulogiciel'] },
  { header: 'Section 1 - Commentaire Général.', field: 'commentaire', aliases: ['commentairegeneral', 'commentaire', 'commentairedae', 'notes', 'note', 'observation', 'identificationcommentaire', 'identificationcommentairegeneral'] },

  // Section 2
  { header: 'Section 2 - Client.', field: 'clientNom', aliases: ['client', 'clientlie', 'clientnom', 'entreprise', 'denominationclient', 'clientclient', 'clientclientidentifiantunique', 'clientidentifiantunique'] },
  { header: 'Section 2 - Nom du site.', field: 'nomSite', aliases: ['nomdusite', 'nomsite', 'site', 'etablissement', 'clientsite', 'clientnomdusite'] },
  { header: 'Section 2 - Téléphone portable.', field: 'telephoneSite', aliases: ['telephoneportable', 'telephoneportablesursite', 'telephonesursite', 'telephonesite', 'telsite', 'portablesite', 'clienttelephoneportable', 'telephone', 'tel'] },
  { header: 'Section 2 - Email.', field: 'emailSite', aliases: ['email', 'emailsursite', 'emailsite', 'mailsite', 'courrielsite', 'clientemail', 'mail', 'courriel'] },
  { header: 'Section 2 - Nom et prénom.', field: 'nomPrenomSite', aliases: ['nometprenom', 'nometprenomsursite', 'nomprenomsite', 'contactsursite', 'contactsite', 'responsablesite', 'nomprenom', 'clientnometprenom', 'contact'] },
  { header: "Section 2 - Catégorie d'établissement.", field: 'categorieEtablissement', aliases: ['categoriedetablissement', 'categorieetablissement', 'typeetablissement', 'clientcategorieetablissement', 'clientcategoriedetablissement'] },
  { header: 'Section 2 - Titre du contrat.', field: 'nomContrat', aliases: ['titreducontrat', 'nomducontrat', 'nomcontrat', 'typecontrat', 'titrecontrat', 'clienttitreducontrat', 'clientnomducontrat'] },
  { header: 'Section 2 - Contrat en cours.', field: 'contrat', aliases: ['contratencours', 'contrat', 'aveccontrat', 'souscontrat', 'clientcontratencours', 'clientcontrat'], type: 'yesno' },
  { header: 'Section 2 - Payeur ID.', field: 'payeurId', aliases: ['payeurid', 'idpayeur', 'codepayeur', 'clientpayeurid'] },
  { header: 'Section 2 - Client ID.', field: 'clientIdField', aliases: ['clientid', 'idclient', 'codeclient', 'clientidfield', 'clientclientid'] },
  { header: 'Section 2 - Référence du contrat.', field: 'referenceContrat', aliases: ['referenceducontrat', 'referencecontrat', 'refcontrat', 'numerocontrat', 'clientreferenceducontrat'] },
  { header: 'Section 2 - Début du contrat.', field: 'debutContrat', aliases: ['debutducontrat', 'debutcontrat', 'datedebutcontrat', 'clientdebutducontrat'], type: 'date' },
  { header: 'Section 2 - Expiration du contrat.', field: 'finContrat', aliases: ['expirationducontrat', 'finducontrat', 'fincontrat', 'datefincontrat', 'echeancecontrat', 'clientexpirationducontrat', 'clientfinducontrat'], type: 'date' },

  // Section 3
  { header: 'Section 3 - Modèle Boîtier.', field: 'modeleCoffretId', aliases: ['modeleboitier', 'modelecoffret', 'coffret', 'boitiermodele', 'modelecoffretid', 'boitier', 'boitiermodeleidentifiantunique'] },
  { header: 'Section 3 - Lot Boîtier.', field: 'numeroLotCoffret', aliases: ['lotboitier', 'numerodelotcoffret', 'numerolotcoffret', 'lotcoffret', 'boitierlot'] },
  { header: 'Section 3  Commentaire Boîtier.', field: 'commentaireCoffret', aliases: ['commentaireboitier', 'commentairecoffret', 'notecoffret', 'boitiercommentaire', 'section3commentaireboitier'] },
  { header: 'Section 3 - Péremption de la trousse.', field: 'peremptionTrousse', aliases: ['peremptiondelatrousse', 'dateperemptiontrousse', 'peremptiontrousse', 'peremptionkit', 'dateperemptionkit', 'boitierperemptiontrousse', 'boitierperemptiondelatrousse'], type: 'date' },
  { header: 'Section 3 - Ciseaux présents.', field: 'kitCiseauxPresents', aliases: ['ciseauxpresents', 'kitciseauxpresents', 'ciseaux', 'boitierciseauxpresents'], type: 'yesno' },
  { header: 'Section 3 - Masque présent.', field: 'kitMasquePresent', aliases: ['masquepresent', 'kitmasquepresent', 'masque', 'boitiermasquepresent'], type: 'yesno' },
  { header: 'Section 3 - Péremption du masque.', field: 'kitPeremptionMasque', aliases: ['peremptiondumasque', 'peremptionmasque', 'kitperemptionmasque', 'dateperemptionmasque', 'boitierperemptiondumasque'], type: 'date' },
  { header: 'Section 3 - Serviettes présentes.', field: 'kitServiettesPresentes', aliases: ['serviettespresentes', 'kitserviettespresentes', 'serviettes', 'boitierserviettespresentes'], type: 'yesno' },
  { header: 'Section 3 - Péremption des serviettes.', field: 'kitPeremptionServiettes', aliases: ['peremptiondesserviettes', 'peremptionserviettes', 'kitperemptionserviettes', 'dateperemptionserviettes', 'boitierperemptiondesserviettes'], type: 'date' },
  { header: 'Section 3 - Paire de gants présents.', field: 'kitGantsPresents', aliases: ['pairedegantspresents', 'gantspresents', 'pairedegantspresente', 'kitgantspresents', 'gants', 'boitierpairedegantspresents'], type: 'yesno' },
  { header: 'Section 3 - Rasoir.', field: 'kitRasoirPresent', aliases: ['rasoir', 'rasoirpresent', 'kitrasoirpresent', 'boitierrasoir'], type: 'yesno' },

  // Section 4
  { header: 'Section 4 - Numéro et voie.', field: 'numVoie', aliases: ['numeroetvoie', 'numvoie', 'adresse', 'rue', 'voie', 'localisationnumeroetvoie', 'localisationrue'] },
  { header: 'Section 4 - Ville.', field: 'ville', aliases: ['ville', 'commune', 'localite', 'city', 'localisationville'] },
  { header: 'Section 4 - Code postal.', field: 'cp', aliases: ['codepostal', 'cp', 'zip', 'postalcode', 'localisationcodepostal'] },
  { header: 'Section 4 - Région.', field: 'region', aliases: ['region', 'departementregion', 'localisationregion'] },
  { header: 'Section 4 - Pays.', field: 'pays', aliases: ['pays', 'country', 'localisationpays'] },
  { header: 'Section 4 - Latitude.', field: 'latitude', aliases: ['latitude', 'lat', 'coordlat', 'localisationlatitude'] },
  { header: 'Section 4 - Longitude.', field: 'longitude', aliases: ['longitude', 'lng', 'lon', 'long', 'coordlng', 'localisationlongitude'] },
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

  // Section 5
  { header: 'Section 5 - Expiration de garantie.', field: 'finGarantie', aliases: ['expirationdegarantie', 'expirationgarantie', 'expirgarantie', 'fingarantie', 'garantie', 'datefingarantie', 'datesexpirationdegarantie'], type: 'date' },
  { header: 'Section 5 - Fabrication.', field: 'fabrication', aliases: ['fabrication', 'datedefabrication', 'datefabrication', 'datesfabrication'], type: 'date' },
  { header: 'Section 5 - Mise en service.', field: 'miseEnService', aliases: ['miseenservice', 'datemiseenservice', 'installation', 'datesmiseenservice'], type: 'date' },
  { header: 'Section 5 - Dernière maintenance.', field: 'derniereMaintenance', aliases: ['dernieremaintenance', 'datedernieremaintenance', 'dernierevisite', 'dermnt', 'datesdernieremaintenance'], type: 'date' },
  { header: "Section 5 - Sortie d'usine.", field: 'sortieFabricant', aliases: ['sortiedusine', 'sortiefabricant', 'datesortiefabricant', 'datessortiedusine'], type: 'date' },
  { header: 'Section 5 - Prochaine maintenance.', field: 'prochaineMaintenance', aliases: ['prochainemaintenance', 'prochainevisite', 'dateprochainemaintenance', 'prochainev', 'provisite', 'datesprochainemaintenance'], type: 'date' },

  // Section 6
  { header: 'Section 6 - Modèle A', field: 'modeleElectrodeAId', aliases: ['modelea', 'modeleelectrodea', 'electrodeamodele', 'modeleelectrodeaid', 'electrodeadulteoumixtemodele'] },
  { header: 'Section 6 - Lot A', field: 'lotElectrodeA', aliases: ['lota', 'lotelectrodea', 'electrodealot', 'electrodeadulteoumixtelot'] },
  { header: 'Section 6 - Insertion A', field: 'insertionElectrodeA', aliases: ['insertiona', 'insertionelectrodea', 'dateinsertionelectrodea', 'electrodeadulteoumixteinsertion'], type: 'date' },
  { header: 'Section 6 - Péremption A', field: 'peremptionElectrodeA', aliases: ['peremptiona', 'peremptionelectrodea', 'dateperemptionelectrodea', 'dateperemptiona', 'electrodeadulteoumixteperemption'], type: 'date' },
  { header: 'Section 6 - Livraison A', field: 'livraisonElectrodeA', aliases: ['livraisona', 'livraisonelectrodea', 'datelivraisonelectrodea', 'electrodeadulteoumixtelivraison'], type: 'date' },
  { header: 'Section 6 - Électrode de secours A', field: 'hasElectrodeASecours', aliases: ['electrodedesecoursa', 'electrodesecoursa', 'haselectrodeasecours', 'secoursa'], type: 'yesno' },
  { header: "Section 6 - Modèlé d'électrode de secours A", field: 'modeleElectrodeASecoursId', aliases: ['modeledelectrodedesecoursa', 'modeldelectrodedesecoursa', 'modelesecoursa', 'modeleelectrodeasecours', 'modeleelectrodeasecoursid', 'electrodeadulteoumixtemodeledelectrodedesecours', 'modeledelectrodedesecours'] },
  { header: "Section 6 - Lot de l'électrode de secours A", field: 'lotElectrodeASecours', aliases: ['lotdelelectrodedesecoursa', 'lotsecoursa', 'lotelectrodeasecours', 'electrodeadulteoumixtelotdelelectrodedesecours', 'lotdelelectrodedesecours'] },
  { header: "Section 6 - Péremption de l'électrode de secours A", field: 'peremptionSecoursElectrodeA', aliases: ['peremptiondelelectrodedesecoursa', 'peremptionsecoursa', 'peremptionsecourselectrodea', 'dateperemptionsecoursa', 'electrodeadulteoumixteperemptiondelelectrodedesecours', 'peremptiondelelectrodedesecours'], type: 'date' },
  { header: 'Section 6 - Statut A', field: 'situationElectrodeA', aliases: ['statuta', 'situationelectrodea', 'situationa', 'etatelectrodea', 'electrodeadulteoumixtestatut', 'statutelectrodea'] },
  { header: 'Section 6 - Commentaire A', field: 'commentaireElectrodeA', aliases: ['commentairea', 'commentaireelectrodea', 'noteelectrodea', 'electrodeadulteoumixtecommentaire'] },
  { header: 'Section 6 - Padpak A', field: 'hasPadpakA', aliases: ['padpaka', 'padpakadulte', 'haspadpaka'], type: 'yesno' },

  // Section 7
  { header: 'Section 7 - Modèle P', field: 'modeleElectrodePId', aliases: ['modelep', 'modeleelectrodep', 'electrodepModele', 'modeleelectrodepid', 'electrodepediatriquemodele'] },
  { header: 'Section 7 - Insertion P', field: 'insertionElectrodeP', aliases: ['insertionp', 'insertionelectrodep', 'dateinsertionelectrodep', 'electrodepediatriqueinsertion'], type: 'date' },
  { header: 'Section 7 - Livraison P', field: 'livraisonElectrodeP', aliases: ['livraisonp', 'livraisonelectrodep', 'datelivraisonelectrodep', 'electrodepediatriquelivraison'], type: 'date' },
  { header: 'Section 7 - Électrode de secours P', field: 'hasElectrodePSecours', aliases: ['electrodedesecoursp', 'electrodesecoursp', 'haselectrodepsecours', 'secoursp'], type: 'yesno' },
  { header: "Section 7 - Modèlé d'électrode de secours P", field: 'modeleElectrodePSecoursId', aliases: ['modeledelectrodedesecoursp', 'modeldelectrodedesecoursp', 'modelesecoursp', 'modeleelectrodepsecours', 'modeleelectrodepsecoursid', 'electrodepediatriquemodeledelectrodedesecours'] },
  { header: "Section 7 - Lot de l'électrode de secours P", field: 'lotElectrodePSecours', aliases: ['lotdelelectrodedesecoursp', 'lotsecoursp', 'lotelectrodepsecours', 'electrodepediatriquelotdelelectrodedesecours'] },
  { header: "Section 7 - Péremption de l'électrode de secours P", field: 'peremptionSecoursElectrodeP', aliases: ['peremptiondelelectrodedesecoursp', 'peremptionsecoursp', 'peremptionsecourselectrodep', 'dateperemptionsecoursp', 'electrodepediatriqueperemptiondelelectrodedesecours'], type: 'date' },
  { header: 'Section 7 - Statut P', field: 'situationElectrodeP', aliases: ['statutp', 'situationelectrodep', 'situationp', 'etatelectrodep', 'electrodepediatriquestatut', 'statutelectrodep'] },
  { header: 'Section 7 - Commentaire P', field: 'commentaireElectrodeP', aliases: ['commentairep', 'commentaireelectrodep', 'noteelectrodep', 'electrodepediatriquecommentaire'] },
  { header: 'Section 7 - Padpak P', field: 'hasPadpakP', aliases: ['padpakp', 'padpakpediatrique', 'haspadpakp'], type: 'yesno' },
  { header: 'Section 7 - Péremption P', field: 'peremptionElectrodeP', aliases: ['peremptionp', 'peremptionelectrodep', 'dateperemptionelectrodep', 'dateperemptionp', 'electrodepediatriqueperemption'], type: 'date' },
  { header: 'Section 7 - Lot P', field: 'lotElectrodeP', aliases: ['lotp', 'lotelectrodep', 'electrodeplot', 'electrodepediatriquelot'] },

  // Section 8
  { header: 'Section 8 - Modèle B', field: 'modeleBatterieId', aliases: ['modeleb', 'modelebatterieb', 'modelebatterie', 'batteriemodele', 'modelebatterieid'] },
  { header: 'Section 8 - Fabrication B', field: 'fabricationBatterie', aliases: ['fabricationb', 'fabricationbatterieb', 'fabricationbatterie', 'datefabricationbatterie', 'batteriefabrication'], type: 'date' },
  { header: 'Section 8 - Insertion B', field: 'insertionBatterie', aliases: ['insertionb', 'insertionbatterieb', 'insertionbatterie', 'dateinsertionbatterie', 'batterieinsertion'], type: 'date' },
  { header: 'Section 8 - Livraison B', field: 'livraisonBatterie', aliases: ['livraisonb', 'livraisonbatterieb', 'livraisonbatterie', 'datelivraisonbatterie', 'batterielivraison'], type: 'date' },
  { header: 'Section 8 - Batterie de secours B', field: 'hasBatterieSecours', aliases: ['batteriedesecoursb', 'batteriesecoursb', 'hasbatteriesecours', 'secoursb', 'batteriesecours'], type: 'yesno' },
  { header: 'Section 8 - Modèle de batterie de secours B', field: 'modeleBatterieSecoursId', aliases: ['modeledebatteriedesecoursb', 'modelesecoursb', 'modelebatteriesecours', 'modelebatteriesecoursid', 'batteriemodelesecours'] },
  { header: 'Section 8 - Lot de la batterie de secours B', field: 'lotBatterieSecours', aliases: ['lotdelabatteriedesecoursb', 'lotsecoursb', 'lotbatteriesecours', 'batterielotsecours'] },
  { header: 'Section 8 - Péremption de la batterie de secours B', field: 'peremptionBatterieSecours', aliases: ['peremptiondelabatteriedesecoursb', 'peremptionsecoursb', 'peremptionbatteriesecours', 'dateperemptionsecoursb', 'batterieperemptionsecours'], type: 'date' },
  { header: 'Section 8 - Statut B', field: 'situationBatterie', aliases: ['statutb', 'situationbatterieb', 'situationbatterie', 'situationb', 'etatbatterie', 'batteriestatut', 'statutbatterie'] },
  { header: 'Section 8 - Pourcentage constaté B', field: 'pourcentageBatterie', aliases: ['pourcentageconstateb', 'pourcentagebatterieb', 'pourcentagebatterie', 'pourcentageb', 'batteriepourcentage', 'batteriepourcentageconstate', 'pourcentageconstate'] },
  { header: 'Section 8 - Pourcentage constaté B', field: 'pourcentageBatterie', aliases: ['pourcentageconstateb', 'pourcentagebatterieb', 'pourcentagebatterie', 'pourcentageb', 'batteriepourcentage', 'batteriepourcentageconstate', 'pourcentageconstate'] },
  { header: 'Section 8 - Commentaire B', field: 'commentaireBatterie', aliases: ['commentaireb', 'commentairebatterieb', 'commentairebatterie', 'notebatterie', 'batteriecommentaire'] },
  { header: 'Section 8 - Péremption B', field: 'peremptionBatterie', aliases: ['peremptionb', 'peremptionbatterieb', 'peremptionbatterie', 'dateperemptionbatterie', 'dateperemptionb', 'batterieperemption'], type: 'date' },
  { header: 'Section 8 - Lot batterie B', field: 'lotBatterie', aliases: ['lotbatterieb', 'lotbatterie', 'lotb', 'batterielot'] },

  // Section 9
  { header: 'Section 9 - Loué', field: 'loue', aliases: ['loue', 'location', 'enlocation', 'categoriesloue'], type: 'yesno' },
  { header: 'Section 9 - Prêté', field: 'prete', aliases: ['prete', 'pret', 'enpret', 'categoriesprete'], type: 'yesno' },
  { header: 'Section 9 - Stocké', field: 'stocke', aliases: ['stocke', 'enstock', 'categoriesstocke'], type: 'yesno' },
  { header: 'Section 9 - Archivé.', field: 'archive', aliases: ['archive', 'inactif', 'categoriesarchive'], type: 'yesno' },
  { header: 'Section 9 - Conforme.', field: 'conforme', aliases: ['conforme', 'conformite', 'categoriesconforme'], type: 'yesno' },
  { header: 'Section 9 - Opéré en sous-traitance.', field: 'sousTraitance', aliases: ['opereensoustraitance', 'soustraitance', 'soustraitant', 'categoriesopereensoustraitance', 'categoriessoustraitance'], type: 'yesno' },
  { header: 'Section 9 - Maintenance autorisée.', field: 'fsmAutorise', aliases: ['maintenanceautorisee', 'fsmautorise', 'maintenance', 'autorisationmaintenance', 'categoriesmaintenanceautorisee'], type: 'yesno' },
  { header: "Section 9 - Email mensuel d'auto-vigilance.", field: 'rappelMensuelAuto', aliases: ['emailmensueldautovigilance', 'rappelmensuelauto', 'rappelmensuel', 'categoriesemailmensueldautovigilance'], type: 'yesno' },
  { header: "Section 9 - Email hebdomadaire d'auto-vigilance.", field: 'rappelHebdoAuto', aliases: ['emailhebdomadairedautovigilance', 'rappelhebdoauto', 'rappelhebdo', 'rappelhebdomadaire', 'categoriesemailhebdomadairedautovigilance'], type: 'yesno' },
  { header: "Section 9 - Email journalier d'auto-vigilance.", field: 'rappelJournalierAuto', aliases: ['emailjournalierdautovigilance', 'rappeljournalierauto', 'rappeljournalier', 'categoriesemailjournalierdautovigilance'], type: 'yesno' },
  { header: 'Section 9 - Utilisé par une victime. ', field: 'victimeSurvie', aliases: ['utiliseparunevictime', 'victimeavecsurvie', 'victimesurvie', 'categoriesvictimeavecsurvie', 'categoriesutiliseparunevictime'], type: 'yesno' },
  { header: 'Section 9 - Âge de la victime.', field: 'ageVictime', aliases: ['agedelavictime', 'agevictime', 'age', 'categoriesagevictime', 'categoriesagedelavictime'] },
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

const TENANT_SHORT_ENV_MAP: Record<string, string> = {
  demo: 'D10',
  tenant_pvzvub57h_1781513640995: 'D71',
  d1: 'D38',
  d2: 'D90',
  d3: 'D63',
  d4: 'D64',
  d5: 'D52',
  d6: 'D53',
  d7: 'D28',
  d8: 'D21',
  d9: 'D11',
  d10: 'D88',
  d11: 'D39',
  d12: 'D22',
  d13: 'D31',
  d14: 'D30',
  d15: 'D62',
  d16: 'D85',
  d17: 'D56',
  d18: 'D83',
  d19: 'D66',
  d20: 'D74',
  d21: 'D86',
  d22: 'D13',
  d23: 'D73',
  d24: 'D20',
  d25: 'D24',
  d26: 'D67',
  d27: 'D58',
  d28: 'D19',
};

function resolveTenantShortEnvCode(tenantId: string, existingUpperIds?: Set<string>): string {
  // 1. If existing rows in the spreadsheet already follow XXX-D58-XXX, infer the exact tenant code from the sheet
  if (existingUpperIds && existingUpperIds.size > 0) {
    const counts = new Map<string, number>();
    let bestCode = '';
    let bestCount = 0;
    for (const id of existingUpperIds) {
      const m = id.match(/^[A-Z0-9]{3}-(D\d+)-[A-Z0-9]{3}$/i);
      if (m && m[1]) {
        const code = m[1].toUpperCase();
        const nextCount = (counts.get(code) || 0) + 1;
        counts.set(code, nextCount);
        if (nextCount > bestCount) {
          bestCount = nextCount;
          bestCode = code;
        }
      }
    }
    if (bestCode) return bestCode;
  }

  // 2. Lookup in static known tenants registry
  const cleanTid = String(tenantId || 'demo').trim().toLowerCase();
  if (TENANT_SHORT_ENV_MAP[cleanTid]) {
    return TENANT_SHORT_ENV_MAP[cleanTid];
  }

  // 3. Check registered_tenants.json on disk for dynamically created tenants
  try {
    for (const relPath of ['data/collections/registered_tenants.json', '.data/collections/registered_tenants.json']) {
      const fullPath = path.join(process.cwd(), relPath);
      if (fs.existsSync(fullPath)) {
        const raw = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        const list = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
        const match = list.find(
          (t: any) =>
            t &&
            (String(t.id || '').trim().toLowerCase() === cleanTid ||
              String(t.shortEnvId || '').trim().toLowerCase() === cleanTid)
        );
        if (match?.shortEnvId) {
          return String(match.shortEnvId).trim().toUpperCase();
        }
      }
    }
  } catch (_) {}

  // 4. Fallback
  if (/^d\d+$/i.test(cleanTid)) {
    return cleanTid.toUpperCase();
  }
  return 'D26';
}

function generateUniqueTenantEquipmentCode(shortEnvCode: string, usedUpperSet: Set<string>): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let attempts = 0; attempts < 5000; attempts++) {
    const l1 = letters[Math.floor(Math.random() * 26)];
    const l2 = letters[Math.floor(Math.random() * 26)];
    const l3 = letters[Math.floor(Math.random() * 26)];
    const l4 = letters[Math.floor(Math.random() * 26)];
    const l5 = letters[Math.floor(Math.random() * 26)];
    const l6 = letters[Math.floor(Math.random() * 26)];
    const code = `${l1}${l2}${l3}-${shortEnvCode}-${l4}${l5}${l6}`;
    if (!usedUpperSet.has(code)) {
      usedUpperSet.add(code);
      return code;
    }
  }
  const fallback = `DAE-${shortEnvCode}-${Date.now().toString(36).slice(-3).toUpperCase()}`;
  usedUpperSet.add(fallback);
  return fallback;
}

export interface PrecomputedColumnMatch {
  colIdx: number;
  def: SheetColumnDef;
}

export function buildColumnMatches(headers: string[], canonicalDefs: SheetColumnDef[]): PrecomputedColumnMatch[] {
  const normHeaders = headers.map(normalizeHeaderKey);
  const matches: PrecomputedColumnMatch[] = [];
  const matchedColIndices = new Set<number>();
  for (const def of canonicalDefs) {
    for (let i = 0; i < normHeaders.length; i++) {
      if (matchedColIndices.has(i)) continue;
      if (def.aliases.includes(normHeaders[i])) {
        matchedColIndices.add(i);
        matches.push({ colIdx: i, def });
        break;
      }
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
      if (rawVal !== '') {
        const defVal = ['conforme', 'fsmAutorise', 'kitCiseauxPresents', 'kitMasquePresent', 'kitServiettesPresentes', 'kitGantsPresents', 'kitRasoirPresent'].includes(def.field) ? 'Oui' : 'Non';
        obj[def.field] = normalizeYesNo(rawVal, defVal);
      }
    } else if (def.type === 'bool') {
      if (rawVal !== '') {
        obj[def.field] = normalizeBool(rawVal, false);
      }
    } else if (def.type === 'date') {
      const dStr = normalizeDateStr(rawVal);
      if (dStr) obj[def.field] = dStr;
    } else if (def.field === 'situationElectrodeA' || def.field === 'situationElectrodeP' || def.field === 'situationBatterie') {
      if (rawVal !== '') {
        obj[def.field] = normalizeSituationFromSheet(rawVal);
      }
    } else if (rawVal !== '') {
      obj[def.field] = rawVal;
    }
  }

  // Reconstruct horaires JSON if Plage 1 or Plage 2 columns were populated in the sheet
  const normalizeDayToken = (rawDay: string): string => {
    const s = rawDay.trim().toLowerCase();
    if (s.startsWith('lun')) return 'Lundi';
    if (s.startsWith('mar')) return 'Mardi';
    if (s.startsWith('mer')) return 'Mercredi';
    if (s.startsWith('jeu')) return 'Jeudi';
    if (s.startsWith('ven')) return 'Vendredi';
    if (s.startsWith('sam')) return 'Samedi';
    if (s.startsWith('dim')) return 'Dimanche';
    return rawDay.trim();
  };

  const hasPlage1 = Boolean(
    obj._plage1_fermetureMidi !== undefined ||
      obj._plage1_days ||
      obj._plage1_openMorning ||
      obj._plage1_closeMorning ||
      obj._plage1_openAfternoon ||
      obj._plage1_closeAfternoon ||
      obj._plage1_openContinuous ||
      obj._plage1_closeContinuous
  );
  const hasPlage2 = Boolean(
    obj._plage2_fermetureMidi !== undefined ||
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
          .map(normalizeDayToken)
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
          .map(normalizeDayToken)
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

  // Auto-detect secours presence if model, lot, or expiry is populated in the sheet
  if (obj.modeleElectrodeASecoursId || obj.lotElectrodeASecours || obj.peremptionSecoursElectrodeA) {
    obj.hasElectrodeASecours = 'Oui';
  }
  if (obj.modeleElectrodePSecoursId || obj.lotElectrodePSecours || obj.peremptionSecoursElectrodeP) {
    obj.hasElectrodePSecours = 'Oui';
  }
  if (obj.modeleBatterieSecoursId || obj.lotBatterieSecours || obj.peremptionBatterieSecours) {
    obj.hasBatterieSecours = 'Oui';
  }

  // Keep convenient aliases so both table, form, and API work seamlessly without cross-overwriting distinct columns
  if (obj.commentaireAdresse) {
    obj.aideAcces = obj.commentaireAdresse;
    obj.aide_acces = obj.commentaireAdresse;
  }
  if (obj.modeleId && !obj.modele) obj.modele = obj.modeleId;
  if (obj.clientIdField && !isPlaceholderClientValue(obj.clientIdField) && !obj.clientId) {
    obj.clientId = obj.clientIdField;
  }

  const cleanIdent = String(obj.identifiant || '').trim();
  const cleanSn = String(obj.numeroSerie || '').trim();
  if (!cleanIdent) {
    obj._missingSheetIdentifiant = true;
    obj.identifiant = '';
  } else {
    obj.identifiant = cleanIdent;
  }
  obj.id = cleanIdent || cleanSn || `sheet_df_${tenantId}_${rowIndex + 2}`;
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
            val = sched[prop] ?? '';
          }
        } else {
          val = '';
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
        val = defib.clientNom ?? '';
      }

      if (val !== undefined && val !== null) {
        if (def.type === 'bool') {
          if (val === '') {
            outRow[i] = '';
          } else {
            outRow[i] = val ? 'Oui' : 'Non';
          }
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
  if (!cleanIdent) {
    obj._missingSheetIdentifiant = true;
    obj.identifiant = '';
  } else {
    obj.identifiant = cleanIdent;
  }
  obj.id = cleanIdent || cleanSn || `sheet_am_${tenantId}_${rowIndex + 2}`;

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
  let s = String(rawHeader || '').replace(/^Section\s*\d+\s*[—–\-:]?\s*/i, '');
  if (s.includes(':')) {
    s = s.replace(/^[^:]{1,120}:\s*/i, '');
  } else if (/\s+[—–\-]\s+/.test(s)) {
    s = s.split(/\s+[—–\-]\s+/).pop() || s;
  }
  s = s.replace(/\(\s*(?:optionnel|facultatif)\s*\)/gi, '');
  return s
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
    { header: 'Planificateur', field: 'plannerName', aliases: ['planificateur', 'planificateurassigne', 'plannername', 'planner', 'responsableplanification', 'nomplanificateur'] },
    { header: 'Date de la tournée', field: 'startDate', aliases: ['datedelatournee', 'datetournee', 'datededebut', 'datedebut', 'startdate', 'date', 'jour', 'echeance', 'dateperiode', 'periode'], type: 'date' },
    { header: 'Date de fin', field: 'endDate', aliases: ['datedefin', 'datefin', 'enddate', 'fin'], type: 'date' },
    { header: 'Région', field: 'region', aliases: ['region', 'departement', 'secteur', 'zone'] },
    { header: 'Statut', field: 'status', aliases: ['statut', 'status', 'etat', 'statutdelatournee', 'avancement', 'situation', 'situationdelatournee'] },
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
    { header: 'Référence', field: 'reference', aliases: ['reference', 'id', 'identifiantticket', 'numeroticket', 'refticket', 'ticketid'] },
    { header: 'Date Ouverture', field: 'dateOuverture', aliases: ['dateouverture', 'datecreation', 'datedecreation', 'date', 'horodatage', 'createdat'] },
    { header: 'Dernière Actualisation', field: 'dateDerniereActualisation', aliases: ['derniereactualisation', 'datederniereactualisation', 'updatedat', 'maj'] },
    { header: 'Statut', field: 'situation', aliases: ['statut', 'situation', 'status', 'etat', 'avancement'] },
    { header: 'Catégorie', field: 'categorie', aliases: ['categorie', 'categorieduticket', 'typecrm', 'crmcategory', 'typedeticket', 'typeticket', 'compartiment', 'motif', 'raison'] },
    { header: 'Criticité', field: 'criticite', aliases: ['criticite', 'priorite', 'urgence', 'niveau'] },
    { header: 'Collaborateur', field: 'collaborateur', aliases: ['collaborateur', 'collaborateurassigne', 'assignea', 'responsable', 'agent', 'membre', 'technicien'] },
    { header: 'Raison Sociale / Client', field: 'client', aliases: ['raisonsocialeclient', 'raisonsociale', 'cliententreprise', 'entreprise', 'client', 'denomination', 'societe', 'nomclient', 'clientlie'] },
    { header: 'Client ID', field: 'clientId', aliases: ['clientid', 'idclient', 'identifiantclient'] },
    { header: 'Prénom et Nom', field: 'prenomNom', aliases: ['prenometnom', 'prenomnom', 'contactnometprenom', 'contactnomprenom', 'nometprenom', 'nomprenom', 'contact', 'demandeur', 'interlocuteur'] },
    { header: 'Situation Interlocuteur', field: 'situationInterlocuteur', aliases: ['situationinterlocuteur', 'statutinterlocuteur', 'typeinterlocuteur'] },
    { header: 'Type Structure', field: 'typeStructure', aliases: ['typestructure', 'typedestructure', 'structure'] },
    { header: 'Fonction', field: 'fonction', aliases: ['fonction', 'poste', 'rolecontact'] },
    { header: 'Téléphone', field: 'telephone', aliases: ['telephone', 'tel', 'phone', 'portable', 'telephonecontact'] },
    { header: 'Email', field: 'email', aliases: ['email', 'mail', 'courriel', 'emailcontact', 'emailclient'] },
    { header: 'Objet', field: 'objet', aliases: ['objet', 'sujet', 'titre', 'objetduticket', 'intitule'] },
    { header: 'Description', field: 'description', aliases: ['description', 'messagedescription', 'message', 'contenu', 'demande', 'details'] },
    { header: 'Marché Public', field: 'marchePublic', aliases: ['marchepublic', 'appeldoffre'] },
    { header: 'Situation Devis', field: 'situationDevis', aliases: ['situationdevis', 'statutdevis', 'etatdevis'] },
    { header: 'Score Conversion (1-5)', field: 'scorePotentielConversion', aliases: ['scoreconversion15', 'scoreconversion', 'scorepotentielconversion', 'probabilite', 'chances', 'tauxconversion'], type: 'number' },
    { header: 'Référence Devis', field: 'referenceDevis', aliases: ['referencedevis', 'refdevis', 'numerodevis', 'devislie'] },
    { header: 'Catégorie Devis', field: 'categorieDevis', aliases: ['categoriedevis', 'typedevis'] },
    { header: 'Indicateur Temps Devis', field: 'indicateurTempsDevis', aliases: ['indicateurtempsdevis', 'delaidevis', 'horizon'] },
    { header: 'Total Affaire HT (€)', field: 'totalAffaireHT', aliases: ['totalaffaireht', 'totalaffairehteuro', 'montantestimeht', 'montantestime', 'montant', 'budget', 'valeurht'], type: 'number' },
    { header: 'Famille', field: 'famille', aliases: ['famille', 'gamme'] },
    { header: 'Indicatif Postal', field: 'indicatifPostal', aliases: ['indicatifpostal', 'departement', 'cp', 'codepostal'] },
    { header: 'Origine Lead', field: 'origineLead', aliases: ['originelead', 'sourceopportunite', 'source', 'origine', 'canal'] },
    { header: 'Description Offre Devis', field: 'descriptionOffreDevis', aliases: ['descriptionoffredevis', 'offredevis', 'detaildevis'] },
    { header: 'Date Devis', field: 'dateDevis', aliases: ['datedevis', 'dateemissiondevis'], type: 'date' },
    { header: 'Date Prochaine Relance', field: 'dateProchaineRelance', aliases: ['dateprochainerelance', 'daterelanceecheance', 'daterelance', 'echeance', 'relance', 'prochainerelance'], type: 'date' },
    { header: 'Date Commande', field: 'dateCommande', aliases: ['datecommande', 'datesignature'], type: 'date' },
    { header: 'Lien Devis / Fichiers', field: 'lienStockagePartageDevis', aliases: ['liendevisfichiers', 'lienstockagepartagedevis', 'photographiepiecejointe', 'photodataurl', 'photo', 'piecejointe', 'image', 'fichier', 'telechargerunfichier', 'liengoogledrive', 'urlfichier'] },
    { header: 'Identifiant Matériel', field: 'identifiant', aliases: ['identifiantmateriel', 'identifiantequipement', 'identifiantdae', 'identifiantdefibrillateur', 'identifiant', 'materiellie', 'equipementlie'] },
    { header: 'Type de matériel', field: 'materialType', aliases: ['typedemateriel', 'typemateriel', 'typeequipement', 'materialtype'] },
    { header: 'Commentaire Interne', field: 'commentaireInterne', aliases: ['commentaireinterne', 'noteinterne', 'notesinternes', 'commentaire', 'observations'] },
    { header: 'Réponse envoyée', field: 'reponse', aliases: ['reponseenvoyee', 'reponse', 'reponseclient', 'solution'] },
    { header: 'Événements Commercial', field: 'evenementsCommercial', aliases: ['evenementscommercial', 'historiquecommercial'], type: 'json' },
    { header: 'Messages Support', field: 'messagesSupport', aliases: ['messagessupport', 'historiquesupport'], type: 'json' },
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
    { header: 'Nom et prénom', field: 'name', aliases: ['nometprenom', 'nomprenom', 'nom', 'name', 'collaborateur', 'membre', 'utilisateur', 'prenometnom', 'nomcomplet'] },
    { header: 'Email', field: 'email', aliases: ['email', 'mail', 'courriel', 'adresseemail', 'identifiant', 'adressemail', 'emailutilisateur', 'emailmembre', 'login'] },
    { header: 'Rôle', field: 'role', aliases: ['role', 'profil', 'typeutilisateur', 'statutrole', 'typedecompte', 'typecompte', 'categorie', 'categoriedumembre', 'categoriemembre'] },
    { header: 'PIN d’accès / Mot de passe', field: 'pin', aliases: ['pindaccesmotdepasse', 'pindacces', 'pinacces', 'motdepasse', 'pin', 'codepin', 'code', 'password', 'motdepassepindacces', 'motdepassepin', 'cledacces', 'cleacces', 'codedacces', 'codeacces', 'mdp'] },
    { header: 'Métier / Type de rôle', field: 'adminSubRole', aliases: ['metiertypederole', 'metier', 'typederole', 'typerole', 'adminsubrole', 'fonction', 'service', 'sousrole', 'poste'] },
    { header: 'Emplacement attribué', field: 'locationLink', aliases: ['emplacementattribue', 'emplacement', 'locationlink', 'vehicule', 'entrepot', 'emplacementstock', 'affectation'] },
    { header: 'Compétences', field: 'competences', aliases: ['competences', 'competence', 'qualifications', 'habilitations'], type: 'array' },
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
    { header: 'Signature Technicien (URL)', field: 'signature', aliases: ['signaturetechnicienurl', 'signaturetechnicien', 'signature', 'urlsignature', 'signatureurl', 'signaturecollaborateur'] },
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
    { header: 'Personnaliser la visibilité des onglets', field: 'hiddenTabs', aliases: ['personnaliserlavisibilitedesonglets', 'visibilitedesonglets', 'visibiliteonglets', 'ongletsmasques', 'hiddentabs', 'onglets'], type: 'array' },
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
  exportations: [
    { header: 'ID', field: 'id', aliases: ['id', 'identifiant', 'idexport', 'reference'] },
    { header: 'Nom', field: 'name', aliases: ['nom', 'name', 'titre', 'intitule', 'nomexportation'] },
    { header: 'Type de transfert', field: 'transferType', aliases: ['typedetransfert', 'typetransfert', 'transfertype', 'type'] },
    { header: 'Élément ciblé', field: 'targetElement', aliases: ['elementcible', 'targetelement', 'cible', 'module', 'compartiment'] },
    { header: 'Type de fichier', field: 'fileType', aliases: ['typedefichier', 'filetype', 'format', 'extension'] },
    { header: 'Statut', field: 'status', aliases: ['statut', 'status', 'etat'] },
    { header: 'Date de création', field: 'createdAt', aliases: ['datedecreation', 'datecreation', 'createdat', 'date', 'horodatage'] },
    { header: 'URL Google Drive du fichier (Lien partagé)', field: 'fileUrl', aliases: ['urlgoogledrivedufichierlienpartage', 'urlgoogledrive', 'fileurl', 'urldufichier', 'urlfichier', 'lienpartage', 'lien', 'url', 'fichier'] },
    { header: 'Nom du fichier', field: 'fileName', aliases: ['nomdufichier', 'filename', 'fichiernom'] },
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
    { header: 'Section 1 - Photographie 1 (Appareil / Coffret)', field: 'photoUrl', aliases: ['section1photographie1appareilcoffret', 'photographie1appareilcoffret', 'photographie1', 'photourl', 'preuvephotoglobaleurl', 'preuvephotoglobale', 'photoglobale', 'photo1', 'photographieglobaledudefibrillateur', 'photographieglobale'] },
    { header: 'Section 1 - Photographie 2 (Environnement / Électrodes)', field: 'photo2Url', aliases: ['section1photographie2environnementelectrodes', 'photographie2environnementelectrodes', 'photographie2', 'photo2url', 'preuvephotoarriereetiquetteurl', 'preuvephotoarriere', 'photoarriere', 'photo2', 'photographiearriereetiquette', 'photographiearriere', 'photoarriereurl'] },
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
    { header: 'Section 11 - Pièce jointe (Devis)', field: 'pieceJointeDevisName', aliases: ['section11piecejointedevis', 'piecejointedevis', 'piecejointedevisname', 'piecejointedevisfichier', 'fichierjoint', 'piecesjointes1a3fichiers', 'piecesjointes', 'attachments', 'urlpiecesjointes'] },
    { header: "Section 11 - Défibrillateur conforme et prêt à l'usage", field: 'conforme', aliases: ['section11defibrillateurconformeetpretalusage', 'defibrillateurconformeetpretalusage', 'conforme', 'isconforme'], type: 'yesno' },
    { header: 'Section 11 - Commentaire de diagnostic et de clôture', field: 'diagnosticCommentaire', aliases: ['section11commentairedediagnosticetdecloture', 'commentairedediagnosticetdecloture', 'diagnosticcommentaire', 'remarques'] },
    { header: 'Section 11 - Signature du technicien', field: 'techSignature', aliases: ['section11signaturedutechnicien', 'signaturedutechnicien', 'techsignature'] },
    { header: 'Section 11 - Horodatage de clôture', field: 'endTimeStamp', aliases: ['section11horodatagedecloture', 'horodatagedecloture', 'endtimestamp'] },
    { header: 'Section 11 - Code PIN client (Validation sur site)', field: 'clientPinCode', aliases: ['section11codepinclientvalidationsursite', 'codepinclientvalidationsursite', 'codepinclient', 'clientpincode'] },
    // Section 12 - Pièces jointes, Étiquettes & Modération
    { header: 'Section 12 - Photographie 3 / Pièce jointe interne', field: 'photo3Url', aliases: ['section12photographie3piecejointeinterne', 'photographie3piecejointeinterne', 'photographie3', 'photo3url', 'preuvephotoresultattesturl', 'preuvephotoresultattest', 'photoresultattest', 'photo3', 'resultatdutest', 'photoresultattesturl', 'phototest'] },
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
  commandes: [
    { header: 'Identifiant', field: 'id', aliases: ['identifiant', 'id', 'identifiantpiece', 'identifiantdelapiece', 'idpiece', 'identifiantdocument', 'identifiantcommande'] },
    { header: 'Membre attribué', field: 'assignedMemberName', aliases: ['membreattribue', 'membre', 'collaborateur', 'attribuea', 'attribueaunmembre', 'commercial'] },
    { header: 'Affecter au client', field: 'clientDenomination', aliases: ['affecterauclient', 'client', 'clientdenomination', 'nomclient', 'denominationclient', 'entreprise', 'selectionclient', 'selectionduclient', 'clientname'] },
    { header: 'Intitulé du contrat', field: 'intituleContrat', aliases: ['intituleducontrat', 'intitulecontrat', 'nomducontrat', 'nomcontrat', 'categoriedecontrat'] },
    { header: 'Référence du contrat', field: 'referenceContrat', aliases: ['referenceducontrat', 'referencecontrat', 'refcontrat', 'numerocontrat', 'attribueruncontrat', 'contrat'] },
    { header: 'Type de pièce', field: 'type', aliases: ['typedepiece', 'typepiece', 'typededocument', 'typedocument', 'type', 'naturepiece'] },
    { header: 'Référence', field: 'ref', aliases: ['reference', 'ref', 'referencepiece', 'referencedelapiece', 'referencedocument', 'numerodelapiece', 'numeropiece', 'numerocommande', 'numero'] },
    { header: 'Date', field: 'dateStr', aliases: ['date', 'emission', 'datedemission', 'dateemission', 'datepiece', 'datestr', 'datecreation', 'datedudocument'], type: 'date' },
    { header: 'Remarque', field: 'commentaire', aliases: ['remarque', 'commentaire', 'objetoucommentaire', 'remarqueentete', 'objet', 'intitule'] },
    { header: 'Code Taxe', field: 'codeTaxe', aliases: ['codetaxe', 'tva', 'tauxtva', 'codetva'] },
    { header: 'Payeur ID', field: 'payeurId', aliases: ['payeurid', 'idpayeur', 'payeur', 'selectiondupayeur'] },
    { header: 'Client ID', field: 'clientIdField', aliases: ['clientid', 'idclient', 'clientidfield', 'codeclient'] },
    { header: 'Commentaires', field: 'commentaires', aliases: ['commentaires', 'notes', 'notesconditions', 'observation', 'observations'] },
    { header: 'Autre document (Url Source)', field: 'urlSource', aliases: ['autredocumenturlsource', 'autredocument', 'urlsource', 'liensource', 'lienurldudocumentsource', 'documentlie'] },
    { header: 'Statut', field: 'status', aliases: ['statut', 'status', 'etat', 'statutpiece', 'statutdelapiece', 'situationdelapiece'] },
    { header: 'Bon de commande', field: 'hasBonCommande', aliases: ['bondecommande', 'creerunbondecommande', 'associerunbondecommande', 'hasboncommande', 'avecbdc', 'bdc', 'bondecommandeouinon'], type: 'yesno' },
    { header: 'Référence du bon de commande', field: 'bonCommandeReference', aliases: ['referencedubondecommande', 'referencebondecommande', 'refbondecommande', 'refboncomm', 'refbdc', 'referencebc', 'refbc', 'boncommandereference', 'numerobondecommande', 'numerobc'] },
    { header: 'Livraison', field: 'bonCommandeLivraison', aliases: ['livraison', 'modedelivraison', 'modelivraison', 'datedelivraison', 'datelivraison', 'boncommandelivraison', 'livraisonbc'] },
    { header: 'Situation', field: 'bonCommandeSituation', aliases: ['situation', 'situationbc', 'situationdubondecommande', 'situationbondecommande', 'boncommandesituation', 'etatlivrable'] },
    { header: 'Entête', field: 'bonCommandeEntete', aliases: ['entete', 'entetebc', 'remarquebc', 'entetebondecommande', 'entetedubondecommande', 'notedelivraison', 'boncommandeentete'] },
    { header: 'Total HT', field: 'totalHt', aliases: ['totalht', 'totalhteuro', 'totalhteur', 'montantht', 'ht', 'totalgeneralht'], type: 'number' },
    { header: 'Total TVA (20%)', field: 'totalTva', aliases: ['totaltva20', 'totaltva', 'totaltvaeuro', 'totaltvaeur', 'montanttva', 'tva20'], type: 'number' },
    { header: 'Total TTC', field: 'totalTtc', aliases: ['totalttc', 'totalttceuro', 'totalttceur', 'montantttc', 'ttc', 'totalgeneralttc'], type: 'number' },
    ...Array.from({ length: 10 }, (_, idx) => {
      const n = idx + 1;
      return [
        {
          header: `Ligne #${n} - UGS`,
          field: `_item${n}_ugs`,
          aliases: [`ligne${n}ugs`, `ugs${n}`, `lignen${n}ugs`, `article${n}ugs`, `piece${n}ugs`, `prestation${n}ugs`, `section2ligne${n}ugs`, `section2piece${n}ugs`],
        },
        {
          header: `Ligne #${n} - Pièce ou prestation`,
          field: `_item${n}_nomPiece`,
          aliases: [
            `ligne${n}pieceouprestation`,
            `pieceouprestation${n}`,
            `ligne${n}piece`,
            `piece${n}`,
            `piece${n}nomdelapiece`,
            `piece${n}piece`,
            `ligne${n}nomdelapiece`,
            `ligne${n}denomination`,
            `denomination${n}`,
            `ligne${n}description`,
            `description${n}`,
            `ligne${n}article`,
            `article${n}`,
            `ligne${n}libelle`,
            `libelle${n}`,
            `nompiece${n}`,
            `section2ligne${n}pieceouprestation`,
            `section2ligne${n}denomination`,
          ],
        },
        {
          header: `Ligne #${n} - Prix Vente HT`,
          field: `_item${n}_prixVenteHt`,
          aliases: [
            `ligne${n}prixventeht`,
            `prixventeht${n}`,
            `piece${n}prixdeventeht`,
            `piece${n}prixventeht`,
            `piece${n}uniteht`,
            `ligne${n}uniteht`,
            `uniteht${n}`,
            `tarifdevente${n}`,
            `ligne${n}tarifdevente`,
            `ligne${n}prixunitaireht`,
            `prixunitaireht${n}`,
            `ligne${n}prixunitaire`,
            `prixunitaire${n}`,
            `puht${n}`,
            `ligne${n}puht`,
            `section2ligne${n}prixventeht`,
            `section2ligne${n}prixunitaireht`,
          ],
          type: 'number',
        },
        {
          header: `Ligne #${n} - Quantité`,
          field: `_item${n}_quantite`,
          aliases: [
            `ligne${n}quantite`,
            `quantite${n}`,
            `piece${n}quantite`,
            `piece${n}volume`,
            `ligne${n}volume`,
            `volume${n}`,
            `qte${n}`,
            `ligne${n}qte`,
            `section2ligne${n}quantite`,
            `section2ligne${n}volume`,
          ],
          type: 'number',
        },
        {
          header: `Ligne #${n} - Total HT`,
          field: `_item${n}_totalHt`,
          aliases: [
            `ligne${n}totalht`,
            `totalht${n}`,
            `piece${n}totalht`,
            `ligne${n}totalligneht`,
            `totalligneht${n}`,
            `ligne${n}totalligne`,
            `totalligne${n}`,
            `totalhtligne${n}`,
            `soustotalht${n}`,
            `section2ligne${n}totalht`,
            `section2ligne${n}totalligneht`,
          ],
          type: 'number',
        },
      ] as GenericColumnDef[];
    }).flat(),
  ],
  formations: [
    { header: 'Identifiant', field: 'id', aliases: ['identifiant', 'id', 'identifiantformation', 'idformation', 'identifiantdelaformation', 'referenceformation', 'reference'] },
    { header: 'Intitulé', field: 'intitule', aliases: ['intitule', 'intituledelaformation', 'intituleformation', 'titre', 'titredelaformation', 'titreformation', 'nomdelaformation', 'nomformation', 'formation', 'typedeformation'] },
    { header: 'Date', field: 'date', aliases: ['date', 'datedelaformation', 'dateformation', 'datededebut', 'datedebut', 'jour'], type: 'date' },
    { header: 'Créneau', field: 'creneau', aliases: ['creneau', 'creneauhoraire', 'horaire', 'heure', 'heurededebut', 'heuredebut'] },
    { header: 'Date & Créneau', field: 'dateHeure', aliases: ['dateetcreneau', 'datecreneau', 'dateheure', 'dateetheure'] },
    { header: 'Formateur', field: 'formateurId', aliases: ['formateur', 'formateurid', 'formateurassigne', 'formateurassign', 'intervenant', 'collaborateur', 'animateur', 'nomformateur'] },
    { header: 'Statut', field: 'statut', aliases: ['statut', 'status', 'etat', 'statutdelaformation', 'statutformation', 'avancement', 'situation'] },
    { header: 'Commentaire', field: 'commentaire', aliases: ['commentaire', 'commentaires', 'notes', 'observation', 'observations', 'remarque', 'remarques'] },
    { header: 'Raison/Prestation', field: 'reason', aliases: ['raisonprestation', 'raisons', 'raison', 'prestation', 'prestations', 'reasons', 'modeleraisonprestation', 'motif'] },
    { header: 'Affecter au client', field: 'clientId', aliases: ['affecterauclient', 'client', 'clientassocie', 'clientname', 'nomclient', 'denominationclient', 'entreprise', 'selectionclient', 'clientid'] },
    { header: 'Lieu de la formation', field: 'lieuFormation', aliases: ['lieudelaformation', 'lieuformation', 'lieu', 'typedelieu', 'modalite'] },
    { header: 'Numéro et voie', field: 'adresse', aliases: ['numeroetvoie', 'numvoie', 'adresse', 'voie', 'rue', 'adressedelaformation', 'adresseformation'] },
    { header: 'Ville', field: 'ville', aliases: ['ville', 'commune', 'localite', 'city'] },
    { header: 'Code postal', field: 'codePostal', aliases: ['codepostal', 'cp', 'zip'] },
    { header: 'Région', field: 'region', aliases: ['region', 'departement', 'province', 'etatregion'] },
    { header: 'Pays', field: 'pays', aliases: ['pays', 'country'] },
    { header: 'Bon de commande', field: 'bonCommandeId', aliases: ['bondecommande', 'boncommandeid', 'customboncommande', 'referencebondecommande', 'refbondecommande', 'bdc', 'commande'] },
    { header: 'Durée (heures)', field: 'dureeHeures', aliases: ['dureeheures', 'dureetotaleheures', 'dureetotale', 'duree', 'nombreheures', 'nbheures'], type: 'number' },
    ...Array.from({ length: 10 }, (_, idx) => {
      const n = idx + 1;
      return [
        {
          header: `Plage #${n} - Date de début`,
          field: `_plage${n}_dateDebut`,
          aliases: [
            `plage${n}datededebut`,
            `plage${n}datedebut`,
            `datededebut${n}`,
            `datedebut${n}`,
            `plagehoraire${n}datededebut`,
            `plagehoraire${n}datedebut`,
            `creneau${n}datededebut`,
            `creneau${n}datedebut`,
            `jour${n}datededebut`,
            `jour${n}datedebut`,
            `section2plage${n}datededebut`,
          ],
          type: 'date',
        },
        {
          header: `Plage #${n} - Heure de début`,
          field: `_plage${n}_heureDebut`,
          aliases: [
            `plage${n}heurededebut`,
            `plage${n}heuredebut`,
            `heurededebut${n}`,
            `heuredebut${n}`,
            `plagehoraire${n}heurededebut`,
            `plagehoraire${n}heuredebut`,
            `creneau${n}heurededebut`,
            `creneau${n}heuredebut`,
            `jour${n}heurededebut`,
            `jour${n}heuredebut`,
            `section2plage${n}heurededebut`,
          ],
        },
        {
          header: `Plage #${n} - Date de fin`,
          field: `_plage${n}_dateFin`,
          aliases: [
            `plage${n}datedefin`,
            `plage${n}datefin`,
            `datedefin${n}`,
            `datefin${n}`,
            `plagehoraire${n}datedefin`,
            `plagehoraire${n}datefin`,
            `creneau${n}datedefin`,
            `creneau${n}datefin`,
            `jour${n}datedefin`,
            `jour${n}datefin`,
            `section2plage${n}datedefin`,
          ],
          type: 'date',
        },
        {
          header: `Plage #${n} - Heure de fin`,
          field: `_plage${n}_heureFin`,
          aliases: [
            `plage${n}heuredefin`,
            `plage${n}heurefin`,
            `heuredefin${n}`,
            `heurefin${n}`,
            `plagehoraire${n}heuredefin`,
            `plagehoraire${n}heurefin`,
            `creneau${n}heuredefin`,
            `creneau${n}heurefin`,
            `jour${n}heuredefin`,
            `jour${n}heurefin`,
            `section2plage${n}heuredefin`,
          ],
        },
      ] as GenericColumnDef[];
    }).flat(),
  ],
  stagiaires: [
    { header: 'Identifiant', field: 'id', aliases: ['identifiant', 'id', 'identifiantstagiaire', 'idstagiaire', 'identifiantdustagiaire', 'referencestagiaire', 'reference', 'code'] },
    { header: 'Nom & Prénom', field: 'nomPrenom', aliases: ['nometprenom', 'nomprenom', 'nomcomplet', 'stagiaire', 'nomdustagiaire', 'apprenant', 'participant'] },
    { header: 'Prénom', field: 'prenom', aliases: ['prenom', 'prenomdustagiaire', 'prenomstagiaire', 'firstname'] },
    { header: 'Nom', field: 'nom', aliases: ['nom', 'nomdefamille', 'nomstagiaire', 'lastname'] },
    { header: 'Date de naissance', field: 'dateNaissance', aliases: ['datedenaissance', 'datenaissance', 'naissance', 'nele', 'ddn'], type: 'date' },
    { header: 'Email', field: 'email', aliases: ['email', 'mail', 'courriel', 'adresseemail', 'emaildustagiaire', 'emailducontact', 'emailcontact', 'contactemail'] },
    { header: 'Téléphone', field: 'telephone', aliases: ['telephone', 'tel', 'phone', 'portable', 'mobile', 'telephonedustagiaire', 'telephoneducontact', 'telephonecontact', 'contacttelephone'] },
    { header: 'Sexe', field: 'sexe', aliases: ['sexe', 'genre', 'civilite'] },
    { header: 'Numéro et voie', field: 'adresse', aliases: ['numeroetvoie', 'numvoie', 'adresse', 'voie', 'rue', 'adressedustagiaire'] },
    { header: 'Ville', field: 'ville', aliases: ['ville', 'commune', 'localite', 'city'] },
    { header: 'Code postal', field: 'codePostal', aliases: ['codepostal', 'cp', 'zip'] },
    { header: 'Région', field: 'region', aliases: ['region', 'departement', 'province', 'etatregion'] },
    { header: 'Pays', field: 'pays', aliases: ['pays', 'country'] },
    { header: 'Affecter au client', field: 'clientName', aliases: ['affecterauclient', 'client', 'clientname', 'entreprise', 'nomclient', 'denominationclient', 'societe', 'etablissement', 'clientid', 'selectionclient'] },
    { header: 'Contact sur site', field: 'contactNomPrenom', aliases: ['contactsursite', 'contact', 'contactnomprenom', 'nometprenomducontact', 'nomprenomcontact', 'nometprenomsursite', 'nomprenomsite', 'interlocuteur', 'responsable'] },
    { header: 'Commentaire', field: 'commentaire', aliases: ['commentaire', 'commentaires', 'notes', 'note', 'observation', 'observations', 'remarque', 'remarques'] },
  ],
  emargements: [
    { header: 'Identifiant', field: 'id', aliases: ['identifiant', 'id', 'identifiantemargement', 'idemargement', 'identifiantdelemargement', 'referenceemargement', 'reference'] },
    { header: 'Sélection formation', field: 'formationId', aliases: ['selectionformation', 'selectionneruneformation', 'formationassociee', 'formation', 'formationid', 'idformation', 'identifiantformation', 'formationliee'] },
    { header: 'Statut', field: 'statut', aliases: ['statut', 'status', 'etat', 'statutemargement', 'statutdelemargement', 'avancement', 'situation'] },
    { header: 'Lieu de la formation', field: 'lieuFormation', aliases: ['lieudelaformation', 'lieuformation', 'lieu', 'typedelieu', 'modalite'] },
    { header: 'Adresse', field: 'adresse', aliases: ['adresse', 'voie', 'numeroetvoie', 'numvoie', 'rue', 'adressedelaformation', 'adresseformation'] },
    { header: 'Ville', field: 'ville', aliases: ['ville', 'commune', 'localite', 'city'] },
    { header: 'Code postal', field: 'codePostal', aliases: ['codepostal', 'cp', 'zip'] },
    { header: 'Pays', field: 'pays', aliases: ['pays', 'country'] },
    { header: 'Intitulé de la formation', field: 'intituleFormation', aliases: ['intituledelaformation', 'intituleformation', 'intitule', 'titre', 'titredelaformation', 'titreformation', 'nomdelaformation', 'nomformation'] },
    { header: 'Formateur assigné', field: 'formateurAssign', aliases: ['formateurassigne', 'formateur', 'formateurassign', 'intervenant', 'collaborateur', 'animateur', 'nomformateur'] },
    { header: 'Commentaire', field: 'commentaire', aliases: ['commentaire', 'commentaires', 'notes', 'observation', 'observations', 'remarque', 'remarques'] },
    // Section 2 - Émargement du formateur
    { header: 'Section 2 - Présent (Formateur)', field: 'formateurPresent', aliases: ['section2presentformateur', 'section2present', 'presentformateur', 'formateurpresent', 'emargementduformateurpresent'], type: 'yesno' },
    { header: 'Section 2 - Signature (Formateur)', field: 'formateurSignature', aliases: ['section2signatureformateur', 'section2signature', 'signatureduformateur', 'signatureformateur', 'formateursignature', 'emargementduformateursignature'] },
    { header: 'Section 2 - Horodatage (Formateur)', field: 'formateurHorodatage', aliases: ['section2horodatageformateur', 'section2horodatage', 'horodatageformateur', 'horodatageduformateur', 'formateurhorodatage', 'emargementduformateurhorodatage'] },
    { header: 'Section 2 - Validation (Formateur)', field: 'formateurValidation', aliases: ['section2validationformateur', 'section2validation', 'validationformateur', 'validationduformateur', 'formateurvalidation', 'emargementduformateurvalidation'] },
    // Section 2/3 - Liste des stagiaires (up to 50 stagiaires)
    ...Array.from({ length: 50 }, (_, idx) => {
      const n = idx + 1;
      return [
        {
          header: `Stagiaire #${n} - Sélection stagiaire`,
          field: `_stag${n}_stagiaire`,
          aliases: [
            `stagiaire${n}selectionstagiaire`,
            `stagiaire${n}stagiaire`,
            `stagiaire${n}nom`,
            `selectionstagiaire${n}`,
            `stagiaire${n}`,
            `section2stagiaire${n}selectionstagiaire`,
            `section2stagiaire${n}`,
            `section2selectionstagiaire${n}`,
            `section3stagiaire${n}selectionstagiaire`,
            `section3stagiaire${n}`,
            `section3selectionstagiaire${n}`,
          ],
        },
        {
          header: `Stagiaire #${n} - Présent`,
          field: `_stag${n}_present`,
          aliases: [
            `stagiaire${n}present`,
            `present${n}`,
            `presentstagiaire${n}`,
            `section2stagiaire${n}present`,
            `section2present${n}`,
            `section3stagiaire${n}present`,
            `section3present${n}`,
          ],
          type: 'yesno',
        },
        {
          header: `Stagiaire #${n} - Signature`,
          field: `_stag${n}_signature`,
          aliases: [
            `stagiaire${n}signature`,
            `signature${n}`,
            `signaturestagiaire${n}`,
            `section2stagiaire${n}signature`,
            `section2signature${n}`,
            `section3stagiaire${n}signature`,
            `section3signature${n}`,
          ],
        },
        {
          header: `Stagiaire #${n} - Horodatage`,
          field: `_stag${n}_horodatage`,
          aliases: [
            `stagiaire${n}horodatage`,
            `horodatage${n}`,
            `horodatagestagiaire${n}`,
            `section2stagiaire${n}horodatage`,
            `section2horodatage${n}`,
            `section3stagiaire${n}horodatage`,
            `section3horodatage${n}`,
          ],
        },
        {
          header: `Stagiaire #${n} - Validation`,
          field: `_stag${n}_validation`,
          aliases: [
            `stagiaire${n}validation`,
            `validation${n}`,
            `validationstagiaire${n}`,
            `section2stagiaire${n}validation`,
            `section2validation${n}`,
            `section3stagiaire${n}validation`,
            `section3validation${n}`,
          ],
        },
      ] as GenericColumnDef[];
    }).flat(),
  ],
  stocksGlobaux: [
    // Section 1 - Propriétés
    { header: 'Identifiant', field: 'id', aliases: ['identifiant', 'id', 'idstock', 'identifiantstock', 'idcentralestock', 'identifiantcentralestock'] },
    { header: 'Inventaire (UGS)', field: 'ugs', aliases: ['inventaireugs', 'ugs', 'codeugs', 'referenceugs', 'refugs', 'inventaire', 'sku', 'codebarre', 'reference'] },
    { header: 'Sélection de la pièce ou service', field: 'denominationPieceId', aliases: ['selectiondelapieceouservice', 'selectiondelapiece', 'selectionpiece', 'pieceouservice', 'piece', 'denominationdelapiece', 'denominationpiece', 'denominationpieceid', 'nomdelapiece', 'nompiece', 'denomination', 'article', 'designation', 'libelle'] },
    { header: 'Usage recommandé', field: 'usageRecommandeIds', aliases: ['usagerecommande', 'recommandationdusage', 'recommandationusage', 'recommandationdusagemodelescompatibles', 'usagerecommandeids', 'modelescompatibles', 'compatibilite', 'appareilscompatibles'] },
    { header: 'Tarif fournisseur (€ HT)', field: 'valeurAchat', aliases: ['tariffournisseureuroht', 'tariffournisseurht', 'tariffournisseur', 'coutdachatunitaireht', 'coutdachatunitairehteuro', 'coutachatunitaireht', 'coutachatht', 'achatht', 'valeurachat', 'valeurdachat', 'valeurdachatht', 'prixachatht', 'prixdachatht', 'prixachat', 'paht'], type: 'number' },
    { header: 'Marge (€ HT)', field: 'marge', aliases: ['margeeuroht', 'margeht', 'marge', 'margecommerciale', 'margepourcent', 'tauxmarge', 'tauxdemarge'], type: 'number' },
    { header: 'Tarif de vente (€ HT)', field: 'prixVenteHt', aliases: ['tarifdeventeeuroht', 'tarifdeventeht', 'tarifdevente', 'tarifventeht', 'tarifdeventeunitaireht', 'tarifdeventeunitairehteuro', 'venteht', 'prixventeht', 'prixdeventeht', 'prixvente', 'pvht', 'prixunitaireht'], type: 'number' },
    { header: 'Stockage', field: 'stockage', aliases: ['stockage', 'emplacementdestockage', 'emplacementstockage', 'zonestockage', 'rayon', 'casier', 'localisationstock'] },
    { header: 'Commentaire', field: 'commentaire', aliases: ['commentaire', 'commentaireinterne', 'commentaires', 'notes', 'note', 'observation', 'observations', 'remarque', 'remarques'] },
    // Section 2 - Volumes
    { header: 'Quantité disponible', field: 'quantite', aliases: ['quantitedisponible', 'qtedisponible', 'volumedisponible', 'disponible', 'quantite', 'qte', 'stockdisponible', 'dispo'], type: 'number' },
    { header: 'Quantité réservée', field: 'quantiteReservee', aliases: ['quantitereservee', 'qtereservee', 'volumereserve', 'reserve', 'stockreserve'], type: 'number' },
    { header: 'Quantité entrante', field: 'volumeEntrant', aliases: ['quantiteentrante', 'qteentrante', 'volumeentrant', 'volumeentrantcommande', 'entrant', 'stockentrant', 'encommande'], type: 'number' },
    { header: 'Date de livraison', field: 'livraisonDate', aliases: ['datedelivraison', 'datelivraison', 'livraisondate', 'prochainelivraisonprevue', 'prochainelivraison', 'livraison'], type: 'date' },
    { header: 'Date de réapprovisionnement', field: 'reapprovisionnementDate', aliases: ['datedereapprovisionnement', 'datereapprovisionnement', 'reapprovisionnementdate', 'dernierreapprovisionnement', 'reapprovisionnement'], type: 'date' },
    { header: 'Besoin projeté sous 2 mois', field: 'besoinProjete2Mois', aliases: ['besoinprojetesous2mois', 'besoinprojete2mois', 'besoinprojetemoinsde2mois', 'besoin2mois', 'besoinsous2mois', 'sortantcettesem', 'sortantcettesemaine', 'sortantsem'], type: 'number' },
    { header: 'Besoin projeté de 2 à 6 mois', field: 'besoinProjete2a6Mois', aliases: ['besoinprojetede2a6mois', 'besoinprojete2a6mois', 'besoin2a6mois', 'besoinde2a6mois', 'sortantsempro', 'sortantsemaineprochaine'], type: 'number' },
    { header: 'Total à commander', field: 'totalACommander', aliases: ['totalacommander', 'acommander', 'quantiteacommander', 'sortant7a30jours', 'sortant7a30j'], type: 'number' },
    // Section 3 & 4 - JSON fallbacks + Toggle
    { header: "Activer l'inventaire de traçabilité", field: 'traceabilityEnabled', aliases: ['activerlinventairedetracabilite', 'inventairedetracabiliteactif', 'invtracaactif', 'tracabiliteactivee', 'activertracabilite', 'traceabilityenabled', 'tracabilite'], type: 'bool' },
    { header: 'Mouvements', field: 'mouvements', aliases: ['mouvements', 'historiquemouvements', 'listemouvements'], type: 'json' },
    { header: 'Inventaire de traçabilité', field: 'traceabilities', aliases: ['inventairedetracabilite', 'tracabilites', 'traceabilities', 'listetracabilite'], type: 'json' },
    // Section 3 - Mouvements (up to 20 movements)
    ...Array.from({ length: 20 }, (_, idx) => {
      const n = idx + 1;
      return [
        {
          header: `Mouvement #${n} - ID`,
          field: `_mv${n}_id`,
          aliases: [`mouvement${n}id`, `mouvement${n}identifiant`, `idmouvement${n}`, `identifiantmouvement${n}`, `section3mouvement${n}id`, `section3id${n}`, `mvt${n}id`],
        },
        {
          header: `Mouvement #${n} - Type de mouvement`,
          field: `_mv${n}_type`,
          aliases: [`mouvement${n}typedemouvement`, `mouvement${n}typemouvement`, `mouvement${n}type`, `typedemouvement${n}`, `typemouvement${n}`, `section3mouvement${n}type`, `section3typedemouvement${n}`, `mvt${n}type`],
        },
        {
          header: `Mouvement #${n} - Volume`,
          field: `_mv${n}_volume`,
          aliases: [`mouvement${n}volume`, `mouvement${n}quantite`, `volumemouvement${n}`, `section3mouvement${n}volume`, `section3volume${n}`, `mvt${n}volume`],
          type: 'number',
        },
        {
          header: `Mouvement #${n} - Date`,
          field: `_mv${n}_date`,
          aliases: [`mouvement${n}date`, `datemouvement${n}`, `datedumouvement${n}`, `section3mouvement${n}date`, `section3date${n}`, `mvt${n}date`],
          type: 'date',
        },
        {
          header: `Mouvement #${n} - Statut`,
          field: `_mv${n}_statut`,
          aliases: [`mouvement${n}statut`, `statutmouvement${n}`, `section3mouvement${n}statut`, `section3statut${n}`, `mvt${n}statut`],
        },
        {
          header: `Mouvement #${n} - Provenance / Destination`,
          field: `_mv${n}_emplacement`,
          aliases: [`mouvement${n}provenancedestination`, `mouvement${n}emplacement`, `mouvement${n}destination`, `mouvement${n}provenance`, `provenancedestination${n}`, `emplacementmouvement${n}`, `section3mouvement${n}emplacement`, `section3provenancedestination${n}`, `mvt${n}emplacement`],
        },
        {
          header: `Mouvement #${n} - Bon de commande`,
          field: `_mv${n}_bonCommande`,
          aliases: [`mouvement${n}bondecommande`, `mouvement${n}provenanceachatsfournisseurs`, `bondecommandemouvement${n}`, `section3mouvement${n}bondecommande`, `section3bondecommande${n}`, `mvt${n}bondecommande`],
        },
        {
          header: `Mouvement #${n} - Suivi colis`,
          field: `_mv${n}_trackingLink`,
          aliases: [`mouvement${n}suivicolis`, `mouvement${n}liendesuivicolis`, `suivicolis${n}`, `liendesuivicolis${n}`, `section3mouvement${n}suivicolis`, `section3suivicolis${n}`, `mvt${n}suivicolis`],
        },
      ] as GenericColumnDef[];
    }).flat(),
    // Section 4 - Inventaire de traçabilité (up to 50 items)
    ...Array.from({ length: 50 }, (_, idx) => {
      const n = idx + 1;
      return [
        {
          header: `Traçabilité #${n} - ID`,
          field: `_tr${n}_id`,
          aliases: [`tracabilite${n}id`, `tracabilite${n}identifiant`, `inventaire${n}id`, `idtracabilite${n}`, `section4tracabilite${n}id`, `section4id${n}`, `traca${n}id`],
        },
        {
          header: `Traçabilité #${n} - Mouvement`,
          field: `_tr${n}_movementId`,
          aliases: [`tracabilite${n}mouvement`, `tracabilite${n}selectiondumouvement`, `inventaire${n}mouvement`, `selectiondumouvement${n}`, `mouvementlie${n}`, `section4tracabilite${n}mouvement`, `section4mouvement${n}`, `traca${n}mouvement`],
        },
        {
          header: `Traçabilité #${n} - Lot / Série`,
          field: `_tr${n}_lotOrSerial`,
          aliases: [`tracabilite${n}lotserie`, `tracabilite${n}numerodelotounumerodeserie`, `inventaire${n}lotserie`, `lotserie${n}`, `numerodelotounumerodeserie${n}`, `lotouserie${n}`, `section4tracabilite${n}lotserie`, `section4lotserie${n}`, `traca${n}lotserie`],
        },
        {
          header: `Traçabilité #${n} - Expiration`,
          field: `_tr${n}_expirationDate`,
          aliases: [`tracabilite${n}expiration`, `tracabilite${n}datedexpiration`, `inventaire${n}expiration`, `expiration${n}`, `datedexpiration${n}`, `dateexpiration${n}`, `peremption${n}`, `section4tracabilite${n}expiration`, `section4expiration${n}`, `traca${n}expiration`],
          type: 'date',
        },
        {
          header: `Traçabilité #${n} - Volume`,
          field: `_tr${n}_volume`,
          aliases: [`tracabilite${n}volume`, `inventaire${n}volume`, `volumetracabilite${n}`, `section4tracabilite${n}volume`, `section4volume${n}`, `traca${n}volume`],
          type: 'number',
        },
        {
          header: `Traçabilité #${n} - Situation`,
          field: `_tr${n}_situation`,
          aliases: [`tracabilite${n}situation`, `inventaire${n}situation`, `situation${n}`, `situationtracabilite${n}`, `section4tracabilite${n}situation`, `section4situation${n}`, `traca${n}situation`],
        },
        {
          header: `Traçabilité #${n} - Emplacement`,
          field: `_tr${n}_emplacement`,
          aliases: [`tracabilite${n}emplacement`, `inventaire${n}emplacement`, `emplacementtracabilite${n}`, `section4tracabilite${n}emplacement`, `section4emplacement${n}`, `traca${n}emplacement`],
        },
        {
          header: `Traçabilité #${n} - Attribution des sorties`,
          field: `_tr${n}_reservationInfo`,
          aliases: [`tracabilite${n}attributiondessorties`, `inventaire${n}attributiondessorties`, `attributiondessorties${n}`, `attributionsorties${n}`, `reservation${n}`, `section4tracabilite${n}attributiondessorties`, `section4attributiondessorties${n}`, `traca${n}attributiondessorties`],
        },
        {
          header: `Traçabilité #${n} - Bon de commande`,
          field: `_tr${n}_bonCommande`,
          aliases: [`tracabilite${n}bondecommande`, `inventaire${n}bondecommande`, `bondecommandetracabilite${n}`, `section4tracabilite${n}bondecommande`, `traca${n}bondecommande`],
        },
        {
          header: `Traçabilité #${n} - Client`,
          field: `_tr${n}_client`,
          aliases: [`tracabilite${n}client`, `inventaire${n}client`, `clienttracabilite${n}`, `section4tracabilite${n}client`, `traca${n}client`],
        },
        {
          header: `Traçabilité #${n} - Date estimée`,
          field: `_tr${n}_dateEstimee`,
          aliases: [`tracabilite${n}dateestimee`, `inventaire${n}dateestimee`, `dateestimee${n}`, `section4tracabilite${n}dateestimee`, `traca${n}dateestimee`],
          type: 'date',
        },
        {
          header: `Traçabilité #${n} - Commentaire`,
          field: `_tr${n}_comment`,
          aliases: [`tracabilite${n}commentaire`, `inventaire${n}commentaire`, `commentairetracabilite${n}`, `section4tracabilite${n}commentaire`, `section4commentaire${n}`, `traca${n}commentaire`],
        },
      ] as GenericColumnDef[];
    }).flat(),
  ],
  stocksDistribues: [
    // Section 1 - Propriétés
    { header: 'Identifiant', field: 'id', aliases: ['identifiant', 'id', 'idstockdistribue', 'identifiantstockdistribue', 'idstock', 'reference'] },
    { header: 'Inventaire (UGS)', field: 'ugs', aliases: ['inventaireugs', 'ugs', 'codeugs', 'referenceugs', 'refugs', 'inventaire', 'sku', 'codebarre'] },
    { header: 'Sélection de la pièce ou service', field: 'denominationPieceId', aliases: ['selectiondelapieceouservice', 'selectiondelapiece', 'selectiondelapiececentraledesstocks', 'selectionpiece', 'pieceouservice', 'piece', 'denominationdelapiece', 'denominationpiece', 'denominationpieceid', 'nomdelapiece', 'nompiece', 'denomination', 'article', 'designation', 'libelle'] },
    { header: 'ID Stock Centrale', field: 'stockId', aliases: ['idstockcentrale', 'stockid', 'identifiantstockcentrale', 'idcentralestock'] },
    { header: "Sélection de l'emplacement", field: 'locationName', aliases: ['selectiondelemplacement', 'selectionemplacement', 'emplacement', 'emplacementattribue', 'locationname', 'lieu', 'entrepotouvehicule', 'vehiculeouentrepot', 'affectation', 'localisation'] },
    { header: 'Collaborateur', field: 'collaborateur', aliases: ['collaborateur', 'technicien', 'membre', 'collaborateurassigne', 'responsable'] },
    // Section 2 - Volumes
    { header: 'Quantité disponible', field: 'volumeDisponible', aliases: ['quantitedisponible', 'qtedisponible', 'volumedisponible', 'disponible', 'quantite', 'qte', 'stockdisponible', 'dispo'], type: 'number' },
    { header: 'Quantité réservée', field: 'volumeReserve', aliases: ['quantitereservee', 'qtereservee', 'volumereserve', 'reserve', 'stockreserve'], type: 'number' },
    { header: 'Quantité entrante', field: 'volumeEntrant', aliases: ['quantiteentrante', 'qteentrante', 'volumeentrant', 'entrant', 'stockentrant', 'encommande'], type: 'number' },
    { header: 'Sortant Sem.', field: 'sortantSemaine1', aliases: ['sortantsem', 'sortantcettesem', 'sortantcettesemaine', 'sortantsemaine1', 'sortant7jours', 'besoinprojetesous2mois', 'besoin2mois'], type: 'number' },
    { header: 'Sortant Sem. Pro.', field: 'sortantSemaine2', aliases: ['sortantsempro', 'sortantsemaineprochaine', 'sortantsemaine2', 'besoinprojetede2a6mois', 'besoin2a6mois'], type: 'number' },
    { header: 'Sortant 7 à 30 jours', field: 'sortant30Jours', aliases: ['sortant7a30jours', 'sortant7a30j', 'sortant30jours', 'totalacommander'], type: 'number' },
    { header: 'Commentaire', field: 'commentaire', aliases: ['commentaire', 'commentaireinterne', 'commentaires', 'notes', 'note', 'observation'] },
  ],
  variables: [
    {
      header: 'Catégorie.',
      field: 'category',
      aliases: [
        'categorie',
        'categoriedelavariable',
        'categorievariable',
        'category',
        'typedevariable',
        'typevariable',
      ],
    },
    {
      header: 'Titre de la variable.',
      field: 'nom',
      aliases: [
        'titredelavariable',
        'titrevariable',
        'nomdelavariable',
        'nomvariable',
        'intituledelavariable',
        'intitulevariable',
        'nomintitule',
        'nometintitule',
        'nom',
        'titre',
        'intitule',
        'denomination',
        'libelle',
        'designation',
      ],
    },
    {
      header: 'Identifiant.',
      field: 'identifiant',
      aliases: [
        'identifiant',
        'identifiantoptionnel',
        'identifiantdelavariable',
        'identifiantvariable',
        'ugs',
        'codeugs',
        'sku',
        'reference',
        'ref',
        'codearticle',
        'code',
      ],
    },
    {
      header: 'Commentaire sur la variable.',
      field: 'description',
      aliases: [
        'commentairesurlavariable',
        'commentairevariable',
        'commentairedelavariable',
        'commentaire',
        'commentaires',
        'description',
        'descriptionoptionnel',
        'descriptiondelavariable',
        'descriptionvariable',
        'noteinterne',
        'notes',
        'details',
      ],
    },
    {
      header: 'Image URL',
      field: 'imageUrl',
      aliases: [
        'imageurl',
        'urlimage',
        'urldelimage',
        'liensourcedelimage',
        'urldelaminiature',
        'urldelaminiatureoptionnel',
        'urlminiature',
        'miniatureurl',
        'miniature',
        'image',
        'photo',
        'photourl',
        'logo',
      ],
    },
    {
      header: "Type d'alerte / rappel.",
      field: 'rappelAlerteOption',
      aliases: [
        'typedalerterappel',
        'typealerterappel',
        'typederappelalerte',
        'typerappelalerte',
        'typedalerteouderappel',
        'typedalerte',
        'typederappel',
        'rappeloualerte',
        'rappelalerte',
        'rappelalerteoption',
        'rappeloualerteoption',
        'selectionduneoption',
        'optionrappelalerte',
      ],
    },
    {
      header: 'Date de début.',
      field: 'rappelDateDebut',
      aliases: [
        'datededebut',
        'datedebut',
        'rappeldatedebut',
        'datededebutrappel',
        'datedebutrappel',
        'datededebutdelalerte',
        'datededebutdurappel',
        'debutrappel',
        'debutalerte',
      ],
      type: 'date',
    },
    {
      header: 'Date de fin.',
      field: 'rappelDateFin',
      aliases: [
        'datedefin',
        'datefin',
        'rappeldatefin',
        'datedefinrappel',
        'datefinrappel',
        'datedefindelalerte',
        'datedefindurappel',
        'finrappel',
        'finalerte',
      ],
      type: 'date',
    },
    {
      header: 'Observation sur le rappel ou l’alerte.',
      field: 'rappelObservation',
      aliases: [
        'observationsurlerappeloulalerte',
        'observationsurlalerteoulerappel',
        'observationsurlerappelalerte',
        'observationrappeloualerte',
        'observationrappelalerte',
        'observationsrappeloualerte',
        'rappelobservation',
        'observation',
        'observations',
        'observationinstructions',
        'instructions',
      ],
    },
  ],
};
GENERIC_CANONICAL_HEADERS.devisFactures = GENERIC_CANONICAL_HEADERS.commandes;
GENERIC_CANONICAL_HEADERS.stocks = GENERIC_CANONICAL_HEADERS.stocksGlobaux;

function getDefaultGenericHeaders(tabType: SheetTabType, sampleRecords: any[] = []): string[] {
  const canonical = GENERIC_CANONICAL_HEADERS[tabType];
  if (canonical && canonical.length > 0) {
    if (
      tabType === 'rapportsPdf' ||
      tabType === 'commandes' ||
      tabType === 'devisFactures' ||
      tabType === 'formations' ||
      tabType === 'stagiaires' ||
      tabType === 'emargements' ||
      tabType === 'stocksGlobaux' ||
      tabType === 'stocks' ||
      tabType === 'stocksDistribues' ||
      tabType === 'variables'
    ) {
      if (tabType === 'stocksGlobaux' || tabType === 'stocks') {
        return canonical
          .filter(c => {
            if (!c.field.startsWith('_')) return c.field !== 'mouvements' && c.field !== 'traceabilities';
            const mvMatch = c.field.match(/^_mv(\d+)_/);
            if (mvMatch) return parseInt(mvMatch[1], 10) <= 5;
            const trMatch = c.field.match(/^_tr(\d+)_/);
            if (trMatch) return parseInt(trMatch[1], 10) <= 10;
            return true;
          })
          .map(c => c.header);
      }
      if (tabType === 'stocksDistribues' || tabType === 'variables') {
        return canonical.filter(c => !c.field.startsWith('_')).map(c => c.header);
      }
      return canonical.map(c => c.header);
    }
    return canonical.filter(c => !c.field.startsWith('_')).map(c => c.header);
  }
  const presets: Partial<Record<SheetTabType, string[]>> = {};
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
  const effectiveTabType =
    tabType === 'devisFactures' ? 'commandes' : tabType === 'stocks' ? 'stocksGlobaux' : tabType;
  const defs = GENERIC_CANONICAL_HEADERS[effectiveTabType];
  const colToDef = new Map<number, GenericColumnDef>();
  if (!defs || defs.length === 0) return colToDef;

  const defByField = new Map<string, GenericColumnDef>();
  for (const d of defs) {
    defByField.set(d.field, d);
  }

  const normFullHeaders = headers.map(normalizeHeaderKey);
  const normStrippedHeaders = headers.map(normalizeHeaderKeyStripSubSection);
  const usedCols = new Set<number>();

  // Pass 0: Sequential & numbered multi-slot matching for commandes, formations, emargements, and stocksGlobaux
  if (effectiveTabType === 'commandes') {
    const slotCounts = { ugs: 0, nomPiece: 0, prixVenteHt: 0, quantite: 0, totalHt: 0 };
    for (let i = 0; i < headers.length; i++) {
      const rawH = String(headers[i] || '').trim();
      if (!rawH) continue;
      const strippedSection = rawH.replace(/^Section\s*\d+\s*[^:—–\-]*[—–\-:]\s*/i, '').trim();
      const numMatch = strippedSection.match(/(?:ligne|article|piece|pièce|prestation|#|\s|^)\s*#?(\d{1,2})(?:\b|$)/i) || rawH.match(/#(\d{1,2})\b/i);
      const explicitIdx = numMatch ? parseInt(numMatch[1], 10) : 0;
      const baseConcept = strippedSection
        .replace(/^(?:Ligne|Article|Pi[eè]ce|Prestation)\s*#?\d*\s*[—–\-:]?\s*/i, '')
        .replace(/\s*#?\d+\s*$/, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

      const prevStripped = i > 0
        ? String(headers[i - 1] || '')
            .replace(/^Section\s*\d+\s*[^:—–\-]*[—–\-:]\s*/i, '')
            .replace(/^(?:Ligne|Article|Pi[eè]ce|Prestation)\s*#?\d*\s*[—–\-:]?\s*/i, '')
            .replace(/\s*#?\d+\s*$/, '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
        : '';

      let slotType: keyof typeof slotCounts | null = null;
      if (baseConcept === 'ugs' || baseConcept === 'codeugs' || baseConcept === 'referenceugs') {
        slotType = 'ugs';
      } else if (
        ['pieceouprestation', 'pieceouservice', 'piece', 'nomdelapiece', 'denomination', 'description', 'article', 'prestation', 'nompiece', 'libelle', 'designation'].includes(baseConcept)
      ) {
        slotType = 'nomPiece';
      } else if (
        ['prixventeht', 'prixdeventeht', 'uniteht', 'tarifdevente', 'prixunitaireht', 'prixunitaire', 'puht', 'prixhtunitaire', 'tarifht'].includes(baseConcept)
      ) {
        slotType = 'prixVenteHt';
      } else if (['quantite', 'volume', 'qte'].includes(baseConcept)) {
        slotType = 'quantite';
      } else if (
        ['totalligneht', 'totalligne', 'totalhtligne', 'soustotalht', 'montantligneht'].includes(baseConcept) ||
        (baseConcept === 'totalht' && (explicitIdx >= 1 || ['quantite', 'volume', 'qte', 'prixventeht', 'prixdeventeht', 'uniteht', 'prixunitaireht'].includes(prevStripped)))
      ) {
        slotType = 'totalHt';
      }

      if (slotType) {
        slotCounts[slotType] += 1;
        const targetIdx = explicitIdx >= 1 && explicitIdx <= 10 ? explicitIdx : slotCounts[slotType];
        if (targetIdx >= 1 && targetIdx <= 10) {
          const targetDef = defByField.get(`_item${targetIdx}_${slotType}`);
          if (targetDef && !Array.from(colToDef.values()).some(d => d.field === targetDef.field)) {
            colToDef.set(i, targetDef);
            usedCols.add(i);
          }
        }
      }
    }
  } else if (effectiveTabType === 'formations') {
    const slotCounts = { dateDebut: 0, heureDebut: 0, dateFin: 0, heureFin: 0 };
    for (let i = 0; i < headers.length; i++) {
      const rawH = String(headers[i] || '').trim();
      if (!rawH) continue;
      const strippedSection = rawH.replace(/^Section\s*\d+\s*[^:—–\-]*[—–\-:]\s*/i, '').trim();
      const numMatch = strippedSection.match(/(?:plage|creneau|jour|horaire|#|\s|^)\s*#?(\d{1,2})(?:\b|$)/i) || rawH.match(/#(\d{1,2})\b/i);
      const explicitIdx = numMatch ? parseInt(numMatch[1], 10) : 0;
      const baseConcept = strippedSection
        .replace(/^(?:Plage(?:\s*horaire)?|Cr[eé]neau|Jour|Horaire)\s*#?\d*\s*[—–\-:]?\s*/i, '')
        .replace(/\s*#?\d+\s*$/, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

      let slotType: keyof typeof slotCounts | null = null;
      if (['datededebut', 'datedebut', 'debutdate'].includes(baseConcept)) {
        slotType = 'dateDebut';
      } else if (['heurededebut', 'heuredebut', 'debutheure'].includes(baseConcept)) {
        slotType = 'heureDebut';
      } else if (['datedefin', 'datefin', 'findate'].includes(baseConcept)) {
        slotType = 'dateFin';
      } else if (['heuredefin', 'heurefin', 'finheure'].includes(baseConcept)) {
        slotType = 'heureFin';
      }

      if (slotType) {
        slotCounts[slotType] += 1;
        const targetIdx = explicitIdx >= 1 && explicitIdx <= 10 ? explicitIdx : slotCounts[slotType];
        if (targetIdx >= 1 && targetIdx <= 10) {
          const targetDef = defByField.get(`_plage${targetIdx}_${slotType}`);
          if (targetDef && !Array.from(colToDef.values()).some(d => d.field === targetDef.field)) {
            colToDef.set(i, targetDef);
            usedCols.add(i);
          }
        }
      }
    }
  } else if (effectiveTabType === 'emargements') {
    let currentStagiaireSlot = 0;
    const slotCounts = { stagiaire: 0, present: 0, signature: 0, horodatage: 0, validation: 0 };
    for (let i = 0; i < headers.length; i++) {
      const rawH = String(headers[i] || '').trim();
      if (!rawH) continue;
      const fullNorm = normFullHeaders[i];
      const isExplicitFormateur =
        fullNorm.includes('formateur') &&
        !fullNorm.includes('formateurassign') &&
        !fullNorm.includes('nomformateur');
      const strippedSection = rawH.replace(/^Section\s*\d+\s*[^:—–\-]*[—–\-:]\s*/i, '').trim();
      const numMatch = strippedSection.match(/(?:stagiaire|participant|apprenant|#|\s|^)\s*#?(\d{1,2})(?:\b|$)/i) || rawH.match(/#(\d{1,2})\b/i);
      const explicitIdx = numMatch ? parseInt(numMatch[1], 10) : 0;
      const baseConcept = strippedSection
        .replace(/^(?:Stagiaire|Participant|Apprenant)\s*#?\d*\s*[—–\-:]?\s*/i, '')
        .replace(/\s*\((?:Formateur|Stagiaire[^)]*)\)\s*/gi, '')
        .replace(/\s*#?\d+\s*$/, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

      if (
        ['selectionstagiaire', 'selectionnerunstagiaire', 'stagiaire', 'nomdustagiaire', 'nomstagiaire', 'participant'].includes(baseConcept) &&
        !isExplicitFormateur
      ) {
        slotCounts.stagiaire += 1;
        currentStagiaireSlot = explicitIdx >= 1 && explicitIdx <= 50 ? explicitIdx : slotCounts.stagiaire;
        if (currentStagiaireSlot >= 1 && currentStagiaireSlot <= 50) {
          const targetDef = defByField.get(`_stag${currentStagiaireSlot}_stagiaire`);
          if (targetDef) {
            colToDef.set(i, targetDef);
            usedCols.add(i);
          }
        }
        continue;
      }

      let subField: 'present' | 'signature' | 'horodatage' | 'validation' | null = null;
      if (['present', 'presence', 'presentouinon', 'formateurpresent', 'presentformateur'].includes(baseConcept)) {
        subField = 'present';
      } else if (['signature', 'signaturemanuelle', 'signatureduformateur', 'signatureformateur', 'formateursignature'].includes(baseConcept)) {
        subField = 'signature';
      } else if (['horodatage', 'dateetheure', 'timestamp', 'horodatageformateur', 'horodatageduformateur', 'formateurhorodatage'].includes(baseConcept)) {
        subField = 'horodatage';
      } else if (['validation', 'modevalidation', 'modedevalidation', 'validationformateur', 'validationduformateur', 'formateurvalidation'].includes(baseConcept)) {
        subField = 'validation';
      }

      if (subField) {
        if (isExplicitFormateur || (currentStagiaireSlot === 0 && explicitIdx === 0 && slotCounts[subField] === 0)) {
          const formateurFieldMap = {
            present: 'formateurPresent',
            signature: 'formateurSignature',
            horodatage: 'formateurHorodatage',
            validation: 'formateurValidation',
          };
          const fDef = defByField.get(formateurFieldMap[subField]);
          if (fDef && !Array.from(colToDef.values()).some(d => d.field === fDef.field)) {
            colToDef.set(i, fDef);
            usedCols.add(i);
            continue;
          }
        }
        slotCounts[subField] += 1;
        const targetIdx =
          explicitIdx >= 1 && explicitIdx <= 50
            ? explicitIdx
            : currentStagiaireSlot >= 1 && currentStagiaireSlot <= 50
            ? currentStagiaireSlot
            : slotCounts[subField];
        if (targetIdx >= 1 && targetIdx <= 50) {
          const targetDef = defByField.get(`_stag${targetIdx}_${subField}`);
          if (targetDef) {
            colToDef.set(i, targetDef);
            usedCols.add(i);
          }
        }
      }
    }
  } else if (effectiveTabType === 'stocksGlobaux') {
    let currentSection: 1 | 2 | 3 | 4 = 1;
    const mvCounts = { id: 0, type: 0, volume: 0, date: 0, statut: 0, emplacement: 0, bonCommande: 0, trackingLink: 0 };
    const trCounts = { id: 0, movementId: 0, lotOrSerial: 0, expirationDate: 0, volume: 0, situation: 0, emplacement: 0, reservationInfo: 0, bonCommande: 0, client: 0, dateEstimee: 0, comment: 0 };

    const getStrippedConcept = (h: string): string =>
      String(h || '')
        .replace(/^Section\s*\d+\s*[^:—–\-]*[—–\-:]\s*/i, '')
        .replace(/^(?:Mouvement|Mvt|Tra[cç]abilit[eé]|Inventaire|Traca|Lot)\s*#?\d*\s*[—–\-:]?\s*/i, '')
        .replace(/\s*#?\d+\s*$/, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

    for (let i = 0; i < headers.length; i++) {
      const rawH = String(headers[i] || '').trim();
      if (!rawH) continue;
      const fullNorm = normFullHeaders[i];
      const baseConcept = getStrippedConcept(rawH);
      const nextConcept = i + 1 < headers.length ? getStrippedConcept(headers[i + 1]) : '';

      // Check if this column is the traceabilityEnabled toggle
      if (
        ['activerlinventairedetracabilite', 'inventairedetracabiliteactif', 'invtracaactif', 'tracabiliteactivee', 'activertracabilite', 'traceabilityenabled'].includes(fullNorm) ||
        ['activerlinventairedetracabilite', 'inventairedetracabiliteactif', 'invtracaactif', 'tracabiliteactivee', 'activertracabilite', 'traceabilityenabled'].includes(baseConcept)
      ) {
        const toggleDef = defByField.get('traceabilityEnabled');
        if (toggleDef) {
          colToDef.set(i, toggleDef);
          usedCols.add(i);
        }
        continue;
      }

      // Detect section transitions
      if (
        /^section3/.test(fullNorm) ||
        /^(?:mouvement|mvt)\d/.test(fullNorm) ||
        ['typedemouvement', 'typemouvement', 'provenancedestination', 'suivicolis', 'liendesuivicolis', 'provenanceachatsfournisseurs'].includes(baseConcept) ||
        (['id', 'identifiant'].includes(baseConcept) && ['type', 'typedemouvement', 'typemouvement'].includes(nextConcept))
      ) {
        currentSection = 3;
      } else if (
        /^section4/.test(fullNorm) ||
        /^(?:tracabilite|traca|inventaire)\d/.test(fullNorm) ||
        ['selectiondumouvement', 'selectionmouvement', 'mouvementlie', 'lotserie', 'lotouserie', 'numerodelotounumerodeserie', 'numerodelot', 'datedexpiration', 'dateexpiration', 'expiration', 'attributiondessorties', 'attributionsorties'].includes(baseConcept) ||
        (['id', 'identifiant'].includes(baseConcept) && ['mouvement', 'selectiondumouvement', 'selectionmouvement', 'lotserie', 'numerodelotounumerodeserie'].includes(nextConcept))
      ) {
        currentSection = 4;
      } else if (
        /^section2/.test(fullNorm) ||
        ['quantitedisponible', 'qtedisponible', 'volumedisponible', 'quantitereservee', 'qtereservee', 'quantiteentrante', 'datedelivraison', 'datedereapprovisionnement', 'besoinprojetesous2mois', 'besoinprojetede2a6mois', 'totalacommander'].includes(baseConcept)
      ) {
        if (currentSection < 3) currentSection = 2;
      }

      const strippedSection = rawH.replace(/^Section\s*\d+\s*[^:—–\-]*[—–\-:]\s*/i, '').trim();
      const numMatch =
        strippedSection.match(/(?:mouvement|mvt|tra[cç]abilit[eé]|inventaire|traca|lot|#|\s|^)\s*#?(\d{1,2})(?:\b|$)/i) ||
        rawH.match(/#(\d{1,2})\b/i);
      const explicitIdx = numMatch ? parseInt(numMatch[1], 10) : 0;

      if (currentSection === 3) {
        let mvSlot: keyof typeof mvCounts | null = null;
        if (['id', 'identifiant', 'idmouvement', 'identifiantmouvement'].includes(baseConcept)) {
          mvSlot = 'id';
        } else if (['type', 'typedemouvement', 'typemouvement', 'naturemouvement'].includes(baseConcept)) {
          mvSlot = 'type';
        } else if (['volume', 'quantite', 'qte', 'volumemouvement'].includes(baseConcept)) {
          mvSlot = 'volume';
        } else if (['date', 'datemouvement', 'datedumouvement'].includes(baseConcept)) {
          mvSlot = 'date';
        } else if (['statut', 'status', 'etat', 'statutmouvement'].includes(baseConcept)) {
          mvSlot = 'statut';
        } else if (['provenancedestination', 'emplacement', 'destination', 'provenance', 'lieu'].includes(baseConcept)) {
          mvSlot = 'emplacement';
        } else if (['bondecommande', 'provenanceachatsfournisseurs', 'achatsfournisseurs', 'commande', 'bdc', 'refcommande', 'referencecommande'].includes(baseConcept)) {
          mvSlot = 'bonCommande';
        } else if (['suivicolis', 'liendesuivicolis', 'liensuivicolis', 'suivi', 'tracking', 'trackinglink', 'urlsuivi'].includes(baseConcept)) {
          mvSlot = 'trackingLink';
        }

        if (mvSlot) {
          mvCounts[mvSlot] += 1;
          const targetIdx = explicitIdx >= 1 && explicitIdx <= 20 ? explicitIdx : mvCounts[mvSlot];
          if (targetIdx >= 1 && targetIdx <= 20) {
            const targetDef = defByField.get(`_mv${targetIdx}_${mvSlot}`);
            if (targetDef) {
              colToDef.set(i, targetDef);
              usedCols.add(i);
            }
          }
        }
      } else if (currentSection === 4) {
        let trSlot: keyof typeof trCounts | null = null;
        if (['id', 'identifiant', 'codebarre', 'codebarres', 'idtracabilite', 'identifianttracabilite'].includes(baseConcept)) {
          trSlot = 'id';
        } else if (['mouvement', 'selectiondumouvement', 'selectionmouvement', 'mouvementlie', 'idmouvement', 'movementid', 'mouvementdentree'].includes(baseConcept)) {
          trSlot = 'movementId';
        } else if (['lotserie', 'lotouserie', 'numerodelotounumerodeserie', 'numerodelot', 'numeroserie', 'lot', 'serie', 'lotorserial', 'nlotserie'].includes(baseConcept)) {
          trSlot = 'lotOrSerial';
        } else if (['expiration', 'datedexpiration', 'dateexpiration', 'peremption', 'datedeperemption', 'dateperemption', 'expirationdate'].includes(baseConcept)) {
          trSlot = 'expirationDate';
        } else if (['volume', 'quantite', 'qte'].includes(baseConcept)) {
          trSlot = 'volume';
        } else if (['situation', 'statut', 'etat', 'disponibilite'].includes(baseConcept)) {
          trSlot = 'situation';
        } else if (['emplacement', 'localisation', 'lieu', 'entrepotouvehicule'].includes(baseConcept)) {
          trSlot = 'emplacement';
        } else if (['attributiondessorties', 'attributionsorties', 'attribution', 'reservation', 'reservationinfo', 'affectation'].includes(baseConcept)) {
          trSlot = 'reservationInfo';
        } else if (['bondecommande', 'bdc', 'referencecommande'].includes(baseConcept)) {
          trSlot = 'bonCommande';
        } else if (['client', 'nomclient', 'entreprise'].includes(baseConcept)) {
          trSlot = 'client';
        } else if (['dateestimee', 'dateprevue'].includes(baseConcept)) {
          trSlot = 'dateEstimee';
        } else if (['commentaire', 'commentaires', 'comment', 'note', 'notes', 'observation'].includes(baseConcept)) {
          trSlot = 'comment';
        }

        if (trSlot) {
          trCounts[trSlot] += 1;
          const targetIdx = explicitIdx >= 1 && explicitIdx <= 50 ? explicitIdx : trCounts[trSlot];
          if (targetIdx >= 1 && targetIdx <= 50) {
            const targetDef = defByField.get(`_tr${targetIdx}_${trSlot}`);
            if (targetDef) {
              colToDef.set(i, targetDef);
              usedCols.add(i);
            }
          }
        }
      }
    }
  }

  // Pass 1: Match full normalized header (preserving numbered prefixes like plage1, plage2, section6, section7)
  for (const def of defs) {
    if (Array.from(colToDef.values()).some(d => d.field === def.field)) continue;
    const allAliases = new Set([
      normalizeHeaderKey(def.header),
      normalizeHeaderKey(def.field),
      ...def.aliases.map(a => normalizeHeaderKey(a)),
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
    if (Array.from(colToDef.values()).some(d => d.field === def.field)) continue;
    const allAliases = new Set([
      normalizeHeaderKey(def.header),
      normalizeHeaderKeyStripSubSection(def.header),
      normalizeHeaderKey(def.field),
      ...def.aliases.map(a => normalizeHeaderKey(a)),
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
  const rawRowArray: string[] = [];
  const obj: Record<string, any> = {};
  let parsedJsonFallback: Record<string, any> = {};
  const colToDef = resolveGenericColumnFieldMap(headers, tabType);

  // Detect if row contains a full _json record payload at an earlier column index (e.g. headerless row from an older schema)
  let embeddedJsonColIdx = -1;
  for (let i = row.length - 1; i >= 0; i--) {
    const cellVal = String(row[i] ?? '').trim();
    if (
      cellVal.startsWith('{"') &&
      cellVal.endsWith('}') &&
      (cellVal.includes('"id":') || cellVal.includes('"reference":') || cellVal.includes('"tenantId":'))
    ) {
      try {
        parsedJsonFallback = JSON.parse(cellVal);
        embeddedJsonColIdx = i;
        break;
      } catch (_) {}
    }
  }

  const isLegacyShiftedRow =
    embeddedJsonColIdx >= 0 &&
    embeddedJsonColIdx < headers.length - 1 &&
    headers[embeddedJsonColIdx]?.toLowerCase() !== '_json';

  if (!isLegacyShiftedRow) {
    headers.forEach((h, i) => {
      const val = row[i] !== undefined ? String(row[i]).trim() : '';
      rawRowArray[i] = val;
      if (!h) return;
      if (rawByHeader[h] === undefined) {
        rawByHeader[h] = val;
      }
      if ((h.toLowerCase() === '_json' || i === embeddedJsonColIdx) && val.startsWith('{')) {
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
    });
  }

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
    const rawKeys = Object.keys(rawByHeader);
    if (rawKeys.length > 0) {
      const fallbackColMap = resolveGenericColumnFieldMap(rawKeys, 'tournees');
      for (const [kIdx, def] of fallbackColMap.entries()) {
        const rk = rawKeys[kIdx];
        const rv = rk ? rawByHeader[rk] : '';
        if (rv !== undefined && rv !== '' && (merged[def.field] === undefined || merged[def.field] === '')) {
          merged[def.field] = rv;
        }
      }
    }
    merged.tourIdentifiant = String(merged.tourIdentifiant || merged.identifiant || merged.tourCode || merged.id || '').trim();
    merged.id = merged.id || merged.tourIdentifiant || `sheet_tour_${tenantId}_${rowIndexZeroBased + 2}`;
    merged.title = merged.title || merged.name || merged.tourIdentifiant || 'Nouvelle tournée';
    merged.name = merged.name || merged.title || '';
    merged.techName = merged.techName || merged.technicien || 'Non assigné';
    merged.plannerName = String(merged.plannerName || merged.planificateur || '').trim();
    merged.region = String(merged.region || merged.departement || '').trim();
    merged.startDate = normalizeDateStr(merged.startDate || merged.date || '');
    merged.date = merged.date || merged.startDate || '';
    const rawTourStatus = String(merged.status || merged.statut || merged.situation || '').trim();
    const normTourStatus = rawTourStatus
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (normTourStatus === 'a faire' || normTourStatus === 'afaire') {
      merged.status = 'À faire';
    } else if (normTourStatus === 'en cours' || normTourStatus === 'encours') {
      merged.status = 'En cours';
    } else if (normTourStatus === 'termine' || normTourStatus === 'terminee') {
      merged.status = 'Terminé';
    } else if (normTourStatus === 'effectue' || normTourStatus === 'effectuee') {
      merged.status = 'Effectué';
    } else {
      merged.status = 'Brouillon';
    }
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

    // Synchronize GmaoCorrectionForm & PDF template top-level state aliases (prioritizing Spreadsheet columns over stale _json)
    merged.title = merged.reportTitle || merged.title || 'RAPPORT D’INTERVENTION';
    merged.siteMission = merged.missionSite || merged.siteMission || 'DÉPLACEMENT';
    merged.photoArriereUrl = merged.photo2Url || merged.photoArriereUrl || '';
    merged.photoResultatTestUrl = merged.photo3Url || merged.photoResultatTestUrl || '';
    merged.electrodeARemplacee = merged.remplaceElectrodeA || merged.electrodeARemplacee || 'Non';
    merged.selectionElectrodeARemplacee = merged.destockElectrodeA || merged.selectionElectrodeARemplacee || '';
    merged.electrodeASecoursRemplacee = merged.remplaceElectrodeSecoursA || merged.electrodeASecoursRemplacee || 'Non';
    merged.selectionElectrodeASecoursRemplacee = merged.destockElectrodeSecoursA || merged.selectionElectrodeASecoursRemplacee || '';
    merged.electrodePRemplacee = merged.remplaceElectrodeP || merged.electrodePRemplacee || 'Non';
    merged.selectionElectrodePRemplacee = merged.destockElectrodeP || merged.selectionElectrodePRemplacee || '';
    merged.electrodePSecoursRemplacee = merged.remplaceElectrodeSecoursP || merged.electrodePSecoursRemplacee || 'Non';
    merged.selectionElectrodePSecoursRemplacee = merged.destockElectrodeSecoursP || merged.selectionElectrodePSecoursRemplacee || '';
    merged.batterieRemplacee = merged.remplaceBatterie || merged.batterieRemplacee || 'Non';
    merged.selectionBatterieRemplacee = merged.destockBatterie || merged.selectionBatterieRemplacee || '';
    merged.kitPeremption = merged.peremptionKit || merged.kitPeremption || '';
    merged.kitSecoursRemplaceOuAjoute = merged.remplaceKit || merged.kitSecoursRemplaceOuAjoute || 'Non';
    merged.selectionKitSecoursRemplace = merged.destockKit || merged.selectionKitSecoursRemplace || '';
    merged.kitCiseauxPresents = merged.kitCiseaux || merged.kitCiseauxPresents || 'Oui';
    merged.kitServiettesPresentes = merged.kitCompresses || merged.kitServiettesPresentes || 'Oui';
    merged.kitRasoirPresent = merged.kitRasoir || merged.kitRasoirPresent || 'Oui';
    merged.kitGantsPresents = merged.kitGants || merged.kitGantsPresents || 'Oui';
    merged.kitMasquePresent = merged.kitMasque || merged.kitMasquePresent || 'Oui';

    const existingSnap = merged.defibSnapshot && typeof merged.defibSnapshot === 'object' ? merged.defibSnapshot : {};
    const verifConf = merged.verificationsConformes || existingSnap.verificationsConformes || 'Oui';
    merged.verificationsConformes = verifConf;

    // Ensure PDF Section 2, 3, 4, 5, 6, 7 technical verification fields are populated from Spreadsheet columns
    merged.techConformeArrivee = merged.conformeArrivee || merged.techConformeArrivee || existingSnap.techConformeArrivee || verifConf || 'Oui';
    merged.techCommentaireArrivee = merged.commentaireArrivee || merged.techCommentaireArrivee || existingSnap.techCommentaireArrivee || '';
    merged.techNettoyage = merged.techNettoyage || existingSnap.techNettoyage || verifConf || 'Oui';
    merged.techVoyantConforme = merged.techVoyantConforme || existingSnap.techVoyantConforme || verifConf || 'Oui';
    merged.techEquipeMessageNumerique = merged.ecran || merged.techEquipeMessageNumerique || existingSnap.ecran || existingSnap.techEquipeMessageNumerique || 'Non';
    merged.techMessageNumeroConforme =
      merged.techMessageNumeroConforme ||
      existingSnap.techMessageNumeroConforme ||
      (merged.techEquipeMessageNumerique === 'Oui' ? (verifConf || 'Oui') : 'Non');
    merged.techGuidesVocauxConformes = merged.techGuidesVocauxConformes || existingSnap.techGuidesVocauxConformes || verifConf || 'Oui';
    merged.techBranchementElectrodesConforme = merged.techBranchementElectrodesConforme || existingSnap.techBranchementElectrodesConforme || verifConf || 'Oui';

    merged.batterieConformeSante = merged.batterieConformeSante || existingSnap.batterieConformeSante || merged.conforme || 'Oui';
    merged.electrodeAConformeSante = merged.electrodeAConformeSante || existingSnap.electrodeAConformeSante || merged.conforme || 'Oui';
    merged.electrodePConformeSante = merged.electrodePConformeSante || existingSnap.electrodePConformeSante || merged.conforme || 'Oui';
    merged.pourcentageChargeNouvelleBatterie =
      merged.chargeNouvelleBatterie || merged.pourcentageChargeNouvelleBatterie || existingSnap.pourcentageChargeNouvelleBatterie || '';
    merged.pourcentageBatterie =
      merged.pourcentageBatterie !== undefined && merged.pourcentageBatterie !== ''
        ? String(merged.pourcentageBatterie)
        : (merged.chargeBatterie || existingSnap.pourcentageBatterie || '');

    merged.equipeAlarme = merged.equipeAlarme || existingSnap.equipeAlarme || 'Oui';
    merged.alarme = merged.alarme || existingSnap.alarme || existingSnap.alarmeCoffret || 'Oui';
    merged.armoireConnectee = merged.armoireConnectee || existingSnap.armoireConnectee || 'Non';
    merged.dispositifHandicap = merged.dispositifHandicap || existingSnap.dispositifHandicap || 'Non';
    merged.signaletiqueConforme = merged.signaletiqueConforme || existingSnap.signaletiqueConforme || existingSnap.signaletiqueBoitier || 'Oui';
    merged.installeExterieur = merged.installeExterieur || existingSnap.installeExterieur || 'Non';

    merged.kitTrousseSecoursPresent =
      merged.kitTrousseSecoursPresent ||
      existingSnap.kitTrousseSecoursPresent ||
      ((merged.modeleKit || merged.lotKit || merged.peremptionKit || existingSnap.modeleKit || existingSnap.peremptionTrousse) ? 'Oui' : 'Oui');
    merged.kitPeremptionMasque = merged.kitPeremptionMasque || existingSnap.kitPeremptionMasque || merged.kitPeremption || '';
    merged.kitPeremptionServiettes = merged.kitPeremptionServiettes || existingSnap.kitPeremptionServiettes || merged.kitPeremption || '';

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
    merged.devisAutreInfo = merged.descriptionDemandeDevis || merged.devisAutreInfo || '';
    if (merged.pieceJointeDevisName && (!Array.isArray(merged.attachments) || merged.attachments.length === 0)) {
      const rawParts = String(merged.pieceJointeDevisName).split(/\s*,\s*/).filter(Boolean);
      merged.attachments = rawParts.map((part: string, idx: number) => ({
        name: part.startsWith('http') ? `Pièce jointe ${idx + 1}` : part,
        url: part,
        type: 'application/octet-stream',
      }));
      if (!merged.piecesJointes) merged.piecesJointes = merged.attachments;
    }

    merged.defibSnapshot = {
      ...existingSnap,
      id: existingSnap.id || merged.defibId || merged.defibrillateurId || merged.identifiant || '',
      identifiant: merged.identifiant || existingSnap.identifiant || '',
      numeroSerie: merged.numeroSerie || existingSnap.numeroSerie || '',
      categorie: merged.categorie || existingSnap.categorie || 'Défibrillateur',
      modele: merged.modele || existingSnap.modele || '',
      modeleId: merged.modele || existingSnap.modeleId || '',
      typeDefibrillateur: existingSnap.typeDefibrillateur || (merged.dea === 'Oui' ? 'DEA' : merged.dea === 'Non' ? 'DSA' : 'DSA'),
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
      modeleCoffretId: merged.modeleCoffret || existingSnap.modeleCoffretId || '',
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
      modeleElectrodeAId: merged.modeleElectrodeA || existingSnap.modeleElectrodeAId || '',
      lotElectrodeA: merged.lotElectrodeA || existingSnap.lotElectrodeA || '',
      fabricationElectrodeA: merged.fabricationElectrodeA || existingSnap.fabricationElectrodeA || existingSnap.insertionElectrodeA || '',
      insertionElectrodeA: merged.fabricationElectrodeA || merged.insertionElectrodeA || existingSnap.insertionElectrodeA || existingSnap.fabricationElectrodeA || '',
      peremptionElectrodeA: merged.peremptionElectrodeA || existingSnap.peremptionElectrodeA || '',
      remplaceElectrodeA: merged.remplaceElectrodeA || existingSnap.remplaceElectrodeA || 'Non',
      destockElectrodeA: merged.destockElectrodeA || existingSnap.destockElectrodeA || '',
      modeleElectrodeSecoursA: merged.modeleElectrodeSecoursA || existingSnap.modeleElectrodeSecoursA || existingSnap.modeleElectrodeASecoursId || '',
      modeleElectrodeSecoursAId: merged.modeleElectrodeSecoursA || existingSnap.modeleElectrodeSecoursAId || existingSnap.modeleElectrodeASecoursId || '',
      modeleElectrodeASecoursId: merged.modeleElectrodeSecoursA || existingSnap.modeleElectrodeASecoursId || existingSnap.modeleElectrodeSecoursAId || '',
      lotElectrodeSecoursA: merged.lotElectrodeSecoursA || existingSnap.lotElectrodeSecoursA || existingSnap.lotElectrodeASecours || '',
      lotElectrodeASecours: merged.lotElectrodeSecoursA || existingSnap.lotElectrodeASecours || existingSnap.lotElectrodeSecoursA || '',
      peremptionElectrodeSecoursA: merged.peremptionElectrodeSecoursA || existingSnap.peremptionElectrodeSecoursA || existingSnap.peremptionSecoursElectrodeA || '',
      peremptionSecoursElectrodeA: merged.peremptionElectrodeSecoursA || existingSnap.peremptionSecoursElectrodeA || existingSnap.peremptionElectrodeSecoursA || '',
      remplaceElectrodeSecoursA: merged.remplaceElectrodeSecoursA || existingSnap.remplaceElectrodeSecoursA || 'Non',
      destockElectrodeSecoursA: merged.destockElectrodeSecoursA || existingSnap.destockElectrodeSecoursA || '',
      modeleElectrodeP: merged.modeleElectrodeP || existingSnap.modeleElectrodeP || '',
      modeleElectrodePId: merged.modeleElectrodeP || existingSnap.modeleElectrodePId || '',
      lotElectrodeP: merged.lotElectrodeP || existingSnap.lotElectrodeP || '',
      fabricationElectrodeP: merged.fabricationElectrodeP || existingSnap.fabricationElectrodeP || existingSnap.insertionElectrodeP || '',
      insertionElectrodeP: merged.fabricationElectrodeP || merged.insertionElectrodeP || existingSnap.insertionElectrodeP || existingSnap.fabricationElectrodeP || '',
      peremptionElectrodeP: merged.peremptionElectrodeP || existingSnap.peremptionElectrodeP || '',
      remplaceElectrodeP: merged.remplaceElectrodeP || existingSnap.remplaceElectrodeP || 'Non',
      destockElectrodeP: merged.destockElectrodeP || existingSnap.destockElectrodeP || '',
      modeleElectrodeSecoursP: merged.modeleElectrodeSecoursP || existingSnap.modeleElectrodeSecoursP || existingSnap.modeleElectrodePSecoursId || '',
      modeleElectrodeSecoursPId: merged.modeleElectrodeSecoursP || existingSnap.modeleElectrodeSecoursPId || existingSnap.modeleElectrodePSecoursId || '',
      modeleElectrodePSecoursId: merged.modeleElectrodeSecoursP || existingSnap.modeleElectrodePSecoursId || existingSnap.modeleElectrodeSecoursPId || '',
      lotElectrodeSecoursP: merged.lotElectrodeSecoursP || existingSnap.lotElectrodeSecoursP || existingSnap.lotElectrodePSecours || '',
      lotElectrodePSecours: merged.lotElectrodeSecoursP || existingSnap.lotElectrodePSecours || existingSnap.lotElectrodeSecoursP || '',
      peremptionElectrodeSecoursP: merged.peremptionElectrodeSecoursP || existingSnap.peremptionElectrodeSecoursP || existingSnap.peremptionSecoursElectrodeP || '',
      peremptionSecoursElectrodeP: merged.peremptionElectrodeSecoursP || existingSnap.peremptionSecoursElectrodeP || existingSnap.peremptionElectrodeSecoursP || '',
      remplaceElectrodeSecoursP: merged.remplaceElectrodeSecoursP || existingSnap.remplaceElectrodeSecoursP || 'Non',
      destockElectrodeSecoursP: merged.destockElectrodeSecoursP || existingSnap.destockElectrodeSecoursP || '',
      modeleBatterie: merged.modeleBatterie || existingSnap.modeleBatterie || '',
      modeleBatterieId: merged.modeleBatterie || existingSnap.modeleBatterieId || '',
      lotBatterie: merged.lotBatterie || existingSnap.lotBatterie || '',
      fabricationBatterie: merged.fabricationBatterie || existingSnap.fabricationBatterie || '',
      miseEnServiceBatterie: merged.miseEnServiceBatterie || existingSnap.miseEnServiceBatterie || existingSnap.insertionBatterie || '',
      insertionBatterie: merged.miseEnServiceBatterie || existingSnap.insertionBatterie || existingSnap.miseEnServiceBatterie || '',
      peremptionBatterie: merged.peremptionBatterie || existingSnap.peremptionBatterie || '',
      pourcentageBatterie: merged.pourcentageBatterie !== undefined ? String(merged.pourcentageBatterie) : (existingSnap.pourcentageBatterie || ''),
      remplaceBatterie: merged.remplaceBatterie || existingSnap.remplaceBatterie || 'Non',
      destockBatterie: merged.destockBatterie || existingSnap.destockBatterie || '',
      modelePile: merged.modelePile || existingSnap.modelePile || '',
      modelePileId: merged.modelePile || existingSnap.modelePileId || '',
      lotPile: merged.lotPile || existingSnap.lotPile || '',
      fabricationPile: merged.fabricationPile || existingSnap.fabricationPile || '',
      miseEnServicePile: merged.miseEnServicePile || existingSnap.miseEnServicePile || '',
      peremptionPile: merged.peremptionPile || existingSnap.peremptionPile || '',
      remplacePile: merged.remplacePile || existingSnap.remplacePile || 'Non',
      destockPile: merged.destockPile || existingSnap.destockPile || '',
      modeleKit: merged.modeleKit || existingSnap.modeleKit || '',
      modeleKitId: merged.modeleKit || existingSnap.modeleKitId || '',
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
      verificationsConformes: verifConf,
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
    const resolvedRef = String(merged.reference || merged.id || `#${100000 + rowIndexZeroBased}`).trim();
    merged.id = String(merged.id || resolvedRef).trim();
    merged.reference = resolvedRef;
    const rawCat = String(merged.categorie || merged.crmCategory || '').trim();
    const rawCatLower = rawCat.toLowerCase();
    const hasCommercialData = Boolean(
      merged.referenceDevis ||
      merged.totalAffaireHT !== undefined ||
      merged.montantEstime !== undefined ||
      merged.dateDevis ||
      merged.categorieDevis ||
      merged.dateProchaineRelance ||
      merged.situationDevis
    );
    const normalizedCat =
      rawCatLower.includes('commercial') || rawCatLower.includes('devis')
        ? 'Commercial'
        : rawCatLower.includes('tech') || rawCatLower.includes('sav') || rawCatLower.includes('assistance')
        ? 'Technique'
        : rawCatLower.includes('reclam') || rawCatLower.includes('réclam') || rawCatLower.includes('litige')
        ? 'Réclamation'
        : rawCatLower.includes('sans')
        ? 'Sans Catégorie'
        : rawCat
        ? rawCat
        : hasCommercialData
        ? 'Commercial'
        : 'Sans Catégorie';
    merged.categorie = normalizedCat;
    merged.crmCategory = merged.crmCategory || normalizedCat;
    const rawSit = String(merged.situation || merged.status || '').trim();
    const rawSitLower = rawSit.toLowerCase();
    const normalizedSit =
      rawSitLower === 'résolu' || rawSitLower === 'resolu' || rawSitLower === 'terminé' || rawSitLower === 'termine' || rawSitLower === 'clôturé' || rawSitLower === 'cloture'
        ? 'Terminé'
        : rawSitLower === 'en cours' || rawSitLower === 'encours'
        ? 'En cours'
        : rawSitLower === 'nouveau' || !rawSit
        ? 'Nouveau'
        : rawSit;
    merged.situation = normalizedSit;
    merged.status = normalizedSit === 'Terminé' ? 'Résolu' : normalizedSit;
    merged.criticite = merged.criticite || 'Non renseigné';
    merged.objet = merged.objet || '';
    merged.description = merged.description || merged.message || '';
    merged.message = merged.message || merged.description || '';
    merged.dateOuverture = merged.dateOuverture || merged.date || new Date().toLocaleDateString('fr-FR');
    merged.date = merged.date || merged.dateOuverture;
    merged.dateDerniereActualisation = merged.dateDerniereActualisation || merged.dateOuverture || merged.date;
    merged.client = merged.client || merged.entreprise || merged.customClientName || '';
    merged.entreprise = merged.entreprise || merged.client || '';
    merged.prenomNom = merged.prenomNom || merged.nomPrenom || '';
    merged.nomPrenom = merged.nomPrenom || merged.prenomNom || '';
    merged.telephone = merged.telephone || merged.phone || '';
    merged.phone = merged.phone || merged.telephone || '';
    merged.email = merged.email || '';
    merged.collaborateur = merged.collaborateur || 'Non attribué';
    merged.situationInterlocuteur = merged.situationInterlocuteur || 'Prospect';
    merged.typeStructure = merged.typeStructure || 'Entreprise';
    merged.fonction = merged.fonction || '';
    if (merged.totalAffaireHT === undefined && merged.montantEstime !== undefined && merged.montantEstime !== '') {
      const parsedHt = parseFloat(String(merged.montantEstime).replace(',', '.'));
      if (!isNaN(parsedHt)) merged.totalAffaireHT = parsedHt;
    } else if (typeof merged.totalAffaireHT === 'string' && merged.totalAffaireHT.trim() !== '') {
      const parsedHt = parseFloat(merged.totalAffaireHT.replace(',', '.'));
      if (!isNaN(parsedHt)) merged.totalAffaireHT = parsedHt;
    }
    if (merged.montantEstime === undefined && merged.totalAffaireHT !== undefined) {
      merged.montantEstime = merged.totalAffaireHT;
    }
    if (merged.scorePotentielConversion === undefined && merged.probabilite !== undefined && merged.probabilite !== '') {
      const parsedScore = parseInt(String(merged.probabilite), 10);
      if (!isNaN(parsedScore)) merged.scorePotentielConversion = parsedScore;
    } else if (typeof merged.scorePotentielConversion === 'string' && merged.scorePotentielConversion.trim() !== '') {
      const parsedScore = parseInt(merged.scorePotentielConversion, 10);
      if (!isNaN(parsedScore)) merged.scorePotentielConversion = parsedScore;
    }
    merged.dateProchaineRelance = merged.dateProchaineRelance || merged.dateRelance || '';
    merged.dateRelance = merged.dateRelance || merged.dateProchaineRelance || '';
    merged.origineLead = merged.origineLead || merged.sourceOpportunite || 'Service Client';
    merged.sourceOpportunite = merged.sourceOpportunite || merged.origineLead || '';
    const sharedUrl = merged.lienStockagePartageDevis || merged.photoDataUrl || '';
    merged.lienStockagePartageDevis = sharedUrl;
    merged.photoDataUrl = merged.photoDataUrl || sharedUrl;
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
    const rawKeys = Object.keys(rawByHeader);
    if (rawKeys.length > 0) {
      const fallbackColMap = resolveGenericColumnFieldMap(rawKeys, 'membresEnvironnement');
      for (const [kIdx, def] of fallbackColMap.entries()) {
        const rk = rawKeys[kIdx];
        const rv = rk ? rawByHeader[rk] : '';
        if (rv !== undefined && rv !== '' && (merged[def.field] === undefined || merged[def.field] === '')) {
          merged[def.field] = rv;
        }
      }
    }
    merged.id = merged.id || merged.email || merged.name || `mem_${rowIndexZeroBased + 2}`;
    merged.name = String(merged.name || merged.nom || merged['Nom et prénom.'] || merged['Nom et prénom'] || merged['Nom complet'] || '').trim();
    merged.email = String(merged.email || merged['Email.'] || merged['Email'] || '').trim();
    const rawRole = String(
      (merged.role && merged.role !== 'Collaborateur' ? merged.role : '') ||
      merged.categorie ||
      merged.category ||
      merged['Catégorie.'] ||
      merged['Catégorie'] ||
      merged['Rôle.'] ||
      merged['Rôle'] ||
      merged.profil ||
      merged.role ||
      ''
    ).trim();
    const rawSubRole = String(merged.adminSubRole || merged.metier || merged['Métier.'] || merged['Métier'] || '').trim();
    const normRole = rawRole.toLowerCase();
    const normSubRole = rawSubRole.toLowerCase();
    if (normRole.includes('tech') || normRole.includes('maintenance') || normRole.includes('intervenant') || normSubRole.includes('tech') || normSubRole.includes('maintenance')) {
      merged.role = 'Technicien';
    } else if (!rawRole) {
      merged.role = 'Administrateur';
    } else if (normRole.includes('super') || normRole.includes('propriétaire') || normRole.includes('proprietaire')) {
      merged.role = 'Super-Administrateur';
    } else if (
      ['administration', 'planification', 'logistique', 'comptabilité', 'comptabilite', 'contrôleur', 'controleur', 'administrateur & contrôleur', 'développeur', 'developpeur'].includes(normRole)
    ) {
      if (!merged.adminSubRole) merged.adminSubRole = rawRole;
      merged.role = 'Administrateur';
    } else if (normRole.includes('admin')) {
      merged.role = 'Administrateur';
    } else {
      merged.role = rawRole;
    }
    merged.pin = merged.pin !== undefined && merged.pin !== null ? String(merged.pin).trim() : '';
    merged.status = merged.status || 'Actif';
    merged.lastActive = merged.lastActive || 'En ligne';
    if (merged.competences && !Array.isArray(merged.competences)) {
      merged.competences = String(merged.competences)
        .split(/[,;/|]/)
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
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
  } else if (tabType === 'commandes' || tabType === 'devisFactures') {
    const rawRef = String(merged.ref || merged.numeroPiece || merged.id || '').trim();
    const docRef = rawRef || `DOC-${rowIndexZeroBased + 2}`;
    merged.id = String(merged.id || docRef).trim();
    merged.ref = docRef;
    merged.numeroPiece = docRef;

    const rawType = String(merged.type || '').trim();
    const normType = rawType
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (normType.includes('devis')) merged.type = 'DEVIS';
    else if (normType.includes('facture')) merged.type = 'FACTURE';
    else if (normType.includes('avoir')) merged.type = 'AVOIR';
    else if (normType.includes('bon') || normType.includes('commande')) merged.type = 'BON DE COMMANDE';
    else if (rawType) merged.type = rawType.toUpperCase();
    else merged.type = tabType === 'devisFactures' ? 'FACTURE' : 'DEVIS';

    merged.assignedMemberName = String(merged.assignedMemberName || '').trim();
    merged.clientDenomination = String(merged.clientDenomination || merged.clientName || merged.clientId || '').trim();
    merged.clientId = String(merged.clientId || merged.clientDenomination || merged.clientIdField || '').trim();
    merged.clientIdField = String(merged.clientIdField || merged.clientId || '').trim();
    merged.payeurId = String(merged.payeurId || merged.clientId || '').trim();
    merged.intituleContrat = String(merged.intituleContrat || merged.intitule || '').trim();
    merged.referenceContrat = String(merged.referenceContrat || merged.contrat || '').trim();
    merged.dateStr = normalizeDateStr(merged.dateStr || merged.date || '');
    merged.date = merged.dateStr;
    merged.commentaire = String(merged.commentaire || '').trim();
    merged.codeTaxe = String(merged.codeTaxe || 'TVA 20%').trim();
    merged.commentaires = String(merged.commentaires || merged.notes || '').trim();
    merged.urlSource = String(merged.urlSource || '').trim();

    const rawStatus = String(merged.status || '').trim();
    const normStat = rawStatus
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (normStat === 'paye' || normStat === 'payee' || normStat === 'acquitte' || normStat === 'regle') {
      merged.status = 'Payé';
      merged.payment = true;
    } else if (normStat.includes('facture')) {
      merged.status = 'Facturé';
      merged.payment = Boolean(merged.payment);
    } else if (normStat.includes('refus') || normStat.includes('annul')) {
      merged.status = 'Refusé';
      merged.payment = false;
    } else if (normStat.includes('accept') || normStat.includes('valid') || normStat.includes('sign')) {
      merged.status = 'Accepté';
      merged.payment = Boolean(merged.payment);
    } else if (rawStatus) {
      merged.status = rawStatus;
      merged.payment = Boolean(merged.payment);
    } else {
      merged.status = 'En attente';
      merged.payment = Boolean(merged.payment);
    }

    const parseMoney = (val: any): number => {
      if (val === undefined || val === null || val === '') return 0;
      if (typeof val === 'number') return isNaN(val) ? 0 : val;
      const cleaned = String(val)
        .replace(/\s+/g, '')
        .replace(/[€$£%]/g, '')
        .replace(',', '.');
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    };

    const itemsList: any[] = [];
    for (let idx = 1; idx <= 10; idx++) {
      const pItem = `_item${idx}_`;
      const pLine = `_l${idx}_`;
      const ugs = String(merged[`${pItem}ugs`] ?? merged[`${pLine}ugs`] ?? '').trim();
      const nomPiece = String(merged[`${pItem}nomPiece`] ?? merged[`${pLine}nomPiece`] ?? merged[`${pItem}description`] ?? '').trim();
      const prixVenteHtRaw = merged[`${pItem}prixVenteHt`] ?? merged[`${pItem}unitPrice`] ?? merged[`${pLine}prixVenteHt`];
      const quantiteRaw = merged[`${pItem}quantite`] ?? merged[`${pItem}quantity`] ?? merged[`${pLine}quantite`];
      const totalHtRaw = merged[`${pItem}totalHt`] ?? merged[`${pLine}totalHt`];
      if (ugs || nomPiece || prixVenteHtRaw !== undefined || quantiteRaw !== undefined || totalHtRaw !== undefined) {
        const prixVenteHt = parseMoney(prixVenteHtRaw);
        const quantite = quantiteRaw !== undefined && quantiteRaw !== '' ? parseMoney(quantiteRaw) : 1;
        const totalHt =
          totalHtRaw !== undefined && totalHtRaw !== ''
            ? parseMoney(totalHtRaw)
            : Number((prixVenteHt * (quantite || 1)).toFixed(2));
        itemsList.push({
          ugs,
          nomPiece: nomPiece || ugs,
          prixVenteHt,
          quantite: quantite || 1,
          totalHt,
        });
      }
    }
    if (itemsList.length > 0 || !Array.isArray(merged.items)) {
      merged.items = itemsList;
    } else if (Array.isArray(merged.items)) {
      merged.items = merged.items.map((it: any) => {
        const prixVenteHt = parseMoney(it.prixVenteHt ?? it.unitPrice ?? 0);
        const quantite = parseMoney(it.quantite ?? it.quantity ?? 1) || 1;
        const totalHt =
          it.totalHt !== undefined && it.totalHt !== ''
            ? parseMoney(it.totalHt)
            : Number((prixVenteHt * quantite).toFixed(2));
        return {
          ...it,
          ugs: String(it.ugs || '').trim(),
          nomPiece: String(it.nomPiece || it.description || it.ugs || '').trim(),
          prixVenteHt,
          quantite,
          totalHt,
        };
      });
    }

    const computedHt = Array.isArray(merged.items)
      ? Number(merged.items.reduce((acc: number, it: any) => acc + (Number(it.totalHt) || 0), 0).toFixed(2))
      : 0;
    const taxRateNum = merged.codeTaxe.includes('0%') || merged.codeTaxe.toLowerCase().includes('exon') ? 0 : 0.2;
    const computedTva = Number((computedHt * taxRateNum).toFixed(2));

    merged.totalHt =
      merged.totalHt !== undefined && merged.totalHt !== ''
        ? parseMoney(merged.totalHt)
        : merged.amountHT !== undefined && merged.amountHT !== ''
        ? parseMoney(merged.amountHT)
        : computedHt;
    merged.totalTva =
      merged.totalTva !== undefined && merged.totalTva !== ''
        ? parseMoney(merged.totalTva)
        : merged.tva !== undefined && merged.tva !== ''
        ? parseMoney(merged.tva)
        : Number((merged.totalHt * taxRateNum).toFixed(2)) || computedTva;
    merged.totalTtc =
      merged.totalTtc !== undefined && merged.totalTtc !== ''
        ? parseMoney(merged.totalTtc)
        : merged.amountTTC !== undefined && merged.amountTTC !== ''
        ? parseMoney(merged.amountTTC)
        : Number((merged.totalHt + merged.totalTva).toFixed(2));

    const hasBcFlag = normalizeBool(merged.hasBonCommande, false);
    const bcRef = String(merged.bonCommandeReference || '').trim();
    const bcLiv = String(merged.bonCommandeLivraison || '').trim();
    const bcSit = String(merged.bonCommandeSituation || '').trim();
    const bcEnt = String(merged.bonCommandeEntete || '').trim();
    merged.hasBonCommande = Boolean(hasBcFlag || bcRef || bcLiv || bcSit || bcEnt || merged.type === 'BON DE COMMANDE');
    merged.bonCommandeReference = bcRef;
    merged.bonCommandeLivraison = bcLiv;
    merged.bonCommandeSituation = bcSit;
    merged.bonCommandeEntete = bcEnt;
  } else if (tabType === 'formations') {
    const rawId = String(merged.id || merged.identifiant || '').trim();
    const formId = rawId || `FOR-${rowIndexZeroBased + 2}`;
    merged.id = formId;
    merged.identifiant = formId;
    merged.intitule = String(merged.intitule || merged.typeDeFormation || '').trim();
    merged.formateurId = String(merged.formateurId || merged.formateur || '').trim();
    merged.statut = String(merged.statut || 'Planifié').trim();
    merged.commentaire = String(merged.commentaire || '').trim();

    if (Array.isArray(merged.reasons) && merged.reasons.length > 0) {
      merged.reason = merged.reason || merged.reasons.join(', ');
    } else if (typeof merged.reason === 'string' && merged.reason.trim()) {
      merged.reasons = merged.reason
        .split(/[,;|]/)
        .map((s: string) => s.trim())
        .filter(Boolean);
    } else {
      merged.reason = String(merged.reason || '').trim();
      merged.reasons = [];
    }

    merged.clientId = String(merged.clientId || merged.clientName || merged.client || '').trim();
    merged.clientName = String(merged.clientName || merged.clientId || '').trim();
    merged.lieuFormation = String(merged.lieuFormation || 'Sur le site du client').trim();
    merged.adresse = String(merged.adresse || merged.numVoie || '').trim();
    merged.ville = String(merged.ville || '').trim();
    merged.codePostal = String(merged.codePostal || '').trim();
    merged.region = String(merged.region || '').trim();
    merged.pays = String(merged.pays || merged.Pays || 'France').trim();
    merged.bonCommandeId = String(merged.bonCommandeId || merged.customBonCommande || '').trim();
    merged.customBonCommande = String(merged.customBonCommande || merged.bonCommandeId || '').trim();

    const plages: any[] = [];
    for (let idx = 1; idx <= 10; idx++) {
      const p = `_plage${idx}_`;
      const pOld = `_slot${idx}_`;
      const dDeb = normalizeDateStr(merged[`${p}dateDebut`] || merged[`${pOld}date`] || '');
      const hDeb = String(merged[`${p}heureDebut`] || merged[`${pOld}heureDebut`] || '').trim();
      const dFin = normalizeDateStr(merged[`${p}dateFin`] || dDeb || '');
      const hFin = String(merged[`${p}heureFin`] || merged[`${pOld}heureFin`] || '').trim();
      if (dDeb || hDeb || dFin || hFin) {
        plages.push({
          dateDebut: dDeb,
          heureDebut: hDeb || '09:00',
          dateFin: dFin || dDeb,
          heureFin: hFin || '17:00',
        });
      }
    }
    if (plages.length > 0) {
      merged.plagesHoraires = plages;
    } else if (Array.isArray(merged.plagesHoraires) && merged.plagesHoraires.length > 0) {
      merged.plagesHoraires = merged.plagesHoraires.map((pl: any) => ({
        dateDebut: normalizeDateStr(pl.dateDebut || pl.date || ''),
        heureDebut: String(pl.heureDebut || '09:00').trim(),
        dateFin: normalizeDateStr(pl.dateFin || pl.dateDebut || pl.date || ''),
        heureFin: String(pl.heureFin || '17:00').trim(),
      }));
    } else {
      const fallbackDate = normalizeDateStr(merged.date || merged.dateDeDebut || '');
      const fallbackCreneau = String(merged.creneau || merged.heureDeDebut || '').trim();
      if (fallbackDate) {
        merged.plagesHoraires = [
          {
            dateDebut: fallbackDate,
            heureDebut: fallbackCreneau || '09:00',
            dateFin: normalizeDateStr(merged.dateDeFin || fallbackDate),
            heureFin: String(merged.heureDeFin || '17:00').trim(),
          },
        ];
      } else {
        merged.plagesHoraires = [];
      }
    }

    const firstPlage = merged.plagesHoraires[0];
    merged.date = normalizeDateStr(merged.date || firstPlage?.dateDebut || merged.dateDeDebut || '');
    merged.creneau = String(merged.creneau || firstPlage?.heureDebut || merged.heureDeDebut || '').trim();
    merged.dateHeure = String(
      merged.dateHeure || [merged.date, merged.creneau].filter(Boolean).join(' ')
    ).trim();

    if (merged.dureeHeures !== undefined && merged.dureeHeures !== '') {
      const parsedDuree = parseFloat(String(merged.dureeHeures).replace(',', '.'));
      merged.dureeHeures = isNaN(parsedDuree) ? 0 : parsedDuree;
    } else {
      merged.dureeHeures = 0;
    }
  } else if (tabType === 'stagiaires') {
    const rawId = String(merged.id || merged.identifiant || '').trim();
    const stagId = rawId || `STG-${rowIndexZeroBased + 2}`;
    merged.id = stagId;
    merged.identifiant = stagId;
    const rawPrenom = String(merged.prenom || '').trim();
    const rawNom = String(merged.nom || '').trim();
    const rawNomPrenom = String(merged.nomPrenom || '').trim();
    if (rawNomPrenom && (!rawPrenom || !rawNom)) {
      const parts = rawNomPrenom.split(/\s+/);
      merged.prenom = rawPrenom || parts[0] || '';
      merged.nom = rawNom || parts.slice(1).join(' ') || '';
      merged.nomPrenom = rawNomPrenom;
    } else {
      merged.prenom = rawPrenom;
      merged.nom = rawNom;
      merged.nomPrenom = [rawPrenom, rawNom].filter(Boolean).join(' ') || rawNomPrenom;
    }
    merged.dateNaissance = normalizeDateStr(merged.dateNaissance || merged.dateDeNaissance || '');
    merged.email = String(merged.email || merged.contactEmail || '').trim();
    merged.contactEmail = String(merged.contactEmail || merged.email || '').trim();
    merged.telephone = String(merged.telephone || merged.contactTelephone || '').trim();
    merged.contactTelephone = String(merged.contactTelephone || merged.telephone || '').trim();
    merged.sexe = String(merged.sexe || '').trim();
    merged.adresse = String(merged.adresse || '').trim();
    merged.ville = String(merged.ville || '').trim();
    merged.codePostal = String(merged.codePostal || '').trim();
    merged.region = String(merged.region || merged.Departement || '').trim();
    merged.pays = String(merged.pays || 'France').trim();
    merged.clientName = String(merged.clientName || merged.affecterAuClient || merged.clientId || '').trim();
    merged.clientId = String(merged.clientId || merged.clientName || '').trim();
    merged.contactNomPrenom = String(merged.contactNomPrenom || '').trim();
    merged.commentaire = String(merged.commentaire || '').trim();
  } else if (tabType === 'emargements') {
    const rawId = String(merged.id || merged.identifiant || '').trim();
    const emId = rawId || `EMA-${rowIndexZeroBased + 2}`;
    merged.id = emId;
    merged.identifiant = emId;
    merged.formationId = String(merged.formationId || merged.affecterSession || '').trim();
    merged.statut = String(merged.statut || 'Brouillon').trim();
    merged.lieuFormation = String(merged.lieuFormation || merged.lieu || 'Sur le site du client').trim();
    merged.adresse = String(merged.adresse || '').trim();
    merged.ville = String(merged.ville || '').trim();
    merged.codePostal = String(merged.codePostal || '').trim();
    merged.pays = String(merged.pays || 'France').trim();
    merged.intituleFormation = String(merged.intituleFormation || merged.typeDeFormation || '').trim();
    merged.formateurAssign = String(merged.formateurAssign || merged.formateurNom || '').trim();
    merged.commentaire = String(merged.commentaire || '').trim();
    merged.formateurPresent = normalizeYesNo(merged.formateurPresent, 'Non');
    merged.formateurSignature = String(merged.formateurSignature || '').trim();
    merged.formateurHorodatage = String(merged.formateurHorodatage || '').trim();
    merged.formateurValidation = String(merged.formateurValidation || '').trim();

    const stagList: any[] = [];
    for (let idx = 1; idx <= 50; idx++) {
      const p = `_stag${idx}_`;
      const sel = String(merged[`${p}stagiaire`] || merged[`${p}id`] || merged[`${p}nom`] || '').trim();
      const sPresentRaw = merged[`${p}present`];
      const sSig = String(merged[`${p}signature`] || '').trim();
      const sHorodatage = String(merged[`${p}horodatage`] || '').trim();
      const sValidation = String(merged[`${p}validation`] || '').trim();
      if (sel || sSig || sHorodatage || sValidation || (sPresentRaw !== undefined && sPresentRaw !== '')) {
        stagList.push({
          id: `item_${idx}`,
          stagiaireId: sel,
          present: normalizeYesNo(sPresentRaw ?? (sSig ? 'Oui' : 'Non'), 'Non'),
          signature: sSig,
          horodatage: sHorodatage,
          validation: sValidation || (sSig ? 'Oui' : 'Non'),
        });
      }
    }
    if (stagList.length > 0 || !Array.isArray(merged.stagiaires)) {
      merged.stagiaires = stagList;
    } else if (Array.isArray(merged.stagiaires)) {
      merged.stagiaires = merged.stagiaires.map((st: any, idx: number) => ({
        id: String(st.id || `item_${idx + 1}`),
        stagiaireId: String(st.stagiaireId || st.stagiaireNom || '').trim(),
        present: normalizeYesNo(st.present, 'Non'),
        signature: String(st.signature || st.signatureDataUrl || '').trim(),
        horodatage: String(st.horodatage || '').trim(),
        validation: String(st.validation || st.modeValidation || 'Non').trim(),
      }));
    }
  } else if (tabType === 'stocksGlobaux' || tabType === 'stocks') {
    const rawKeys = Object.keys(rawByHeader);
    if (rawKeys.length > 0) {
      const fallbackColMap = resolveGenericColumnFieldMap(rawKeys, 'stocksGlobaux');
      for (const [kIdx, def] of fallbackColMap.entries()) {
        const rk = rawKeys[kIdx];
        const rv = rk ? rawByHeader[rk] : '';
        if (rv !== undefined && rv !== '' && (merged[def.field] === undefined || merged[def.field] === '')) {
          merged[def.field] = rv;
        }
      }
    }
    const parseNum = (v: any, def = 0): number => {
      if (v === undefined || v === null || v === '') return def;
      if (typeof v === 'number') return isNaN(v) ? def : v;
      const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.').replace(/[^0-9.-]/g, ''));
      return isNaN(n) ? def : n;
    };

    const rawUgs = String(merged.ugs || merged['UGS.'] || merged['UGS'] || '').trim();
    const rawDenom = String(
      merged.denominationPieceId ||
        merged.denominationPieceNom ||
        merged.designation ||
        merged['Pièce ou service.'] ||
        merged['Pièce ou service'] ||
        merged['Dénomination'] ||
        merged.modeleId ||
        merged.nom ||
        merged.piece ||
        ''
    ).trim();
    const rawId = String(merged.id || merged.identifiant || '').trim();

    if (rawDenom || rawUgs || rawId) {
      merged.ugs = rawUgs || String(rowIndexZeroBased + 1).padStart(4, '0');
      merged.id = rawId || (merged.ugs ? `stk_${merged.ugs}` : `stk_${rowIndexZeroBased + 2}`);
      merged.identifiant = merged.id;
    } else {
      merged.ugs = '';
      merged.id = '';
    }

    merged.denominationPieceId = rawDenom;
    merged.designation = rawDenom || merged.designation || merged.ugs || merged.id || '';
    if (Array.isArray(merged.usageRecommandeIds)) {
      merged.usageRecommandeIds = merged.usageRecommandeIds.map((x: any) => String(x || '').trim()).filter(Boolean);
    } else if (typeof merged.usageRecommandeIds === 'string' && merged.usageRecommandeIds.trim()) {
      merged.usageRecommandeIds = merged.usageRecommandeIds
        .split(/[,;|]/)
        .map((s: string) => s.trim())
        .filter(Boolean);
    } else {
      merged.usageRecommandeIds = [];
    }

    merged.valeurAchat = Number(parseNum(merged.valeurAchat, 0).toFixed(2));
    merged.marge = Number(parseNum(merged.marge, 0).toFixed(2));
    merged.prixVenteHt =
      merged.prixVenteHt !== undefined && merged.prixVenteHt !== ''
        ? Number(parseNum(merged.prixVenteHt, 0).toFixed(2))
        : Number((merged.valeurAchat + merged.marge).toFixed(2));
    merged.stockage = String(merged.stockage || 'Entrepôt A').trim();
    merged.commentaire = String(merged.commentaire || '').trim();
    merged.quantite = Math.round(parseNum(merged.quantite, 0));
    merged.quantiteReservee = Math.round(parseNum(merged.quantiteReservee, 0));
    merged.livraisonDate = normalizeDateStr(merged.livraisonDate || '');
    merged.reapprovisionnementDate = normalizeDateStr(merged.reapprovisionnementDate || '');
    merged.besoinProjete2Mois = Math.round(parseNum(merged.besoinProjete2Mois, 0));
    merged.besoinProjete2a6Mois = Math.round(parseNum(merged.besoinProjete2a6Mois, 0));
    merged.totalACommander = Math.round(parseNum(merged.totalACommander, 0));

    const mvList: any[] = [];
    for (let idx = 1; idx <= 20; idx++) {
      const p = `_mv${idx}_`;
      const mvId = String(merged[`${p}id`] || '').trim();
      const mvType = String(merged[`${p}type`] || '').trim();
      const mvVolRaw = merged[`${p}volume`];
      const mvDate = normalizeDateStr(merged[`${p}date`] || '');
      const mvStatut = String(merged[`${p}statut`] || '').trim();
      const mvEmp = String(merged[`${p}emplacement`] || '').trim();
      const mvBc = String(merged[`${p}bonCommande`] || '').trim();
      const mvTrack = String(merged[`${p}trackingLink`] || '').trim();

      if (mvId || mvType || mvDate || mvEmp || mvBc || mvTrack || (mvVolRaw !== undefined && mvVolRaw !== '')) {
        const stClean = mvStatut || 'Terminé';
        const tpClean = mvType || 'Distribution';
        mvList.push({
          id: mvId || `mv_${merged.id || rowIndexZeroBased + 2}_${idx}`,
          type: tpClean,
          volume: mvVolRaw !== undefined && mvVolRaw !== '' ? Math.round(parseNum(mvVolRaw, 1)) : 1,
          date: mvDate,
          statut: stClean,
          emplacement: mvEmp || 'Centrale des stocks',
          bonCommande: mvBc,
          trackingLink: mvTrack,
          isCanceled: stClean.toLowerCase().includes('annul') || tpClean.toLowerCase().includes('annul'),
        });
      }
    }
    if (mvList.length > 0 || !Array.isArray(merged.mouvements)) {
      merged.mouvements = mvList;
    }

    const trList: any[] = [];
    for (let idx = 1; idx <= 50; idx++) {
      const p = `_tr${idx}_`;
      const trId = String(merged[`${p}id`] || '').trim();
      const trMvId = String(merged[`${p}movementId`] || '').trim();
      const trLot = String(merged[`${p}lotOrSerial`] || '').trim();
      const trExp = normalizeDateStr(merged[`${p}expirationDate`] || '');
      const trVolRaw = merged[`${p}volume`];
      const trSit = String(merged[`${p}situation`] || '').trim();
      const trEmp = String(merged[`${p}emplacement`] || '').trim();
      const trRes = String(merged[`${p}reservationInfo`] || '').trim();
      const trBc = String(merged[`${p}bonCommande`] || '').trim();
      const trCli = String(merged[`${p}client`] || '').trim();
      const trDateEst = normalizeDateStr(merged[`${p}dateEstimee`] || '');
      const trCom = String(merged[`${p}comment`] || '').trim();

      if (trId || trLot || trMvId || trExp || trSit || trEmp || trRes || trBc || trCli || trCom) {
        trList.push({
          id: trId || `TR-${merged.ugs || rowIndexZeroBased + 2}-${idx}`,
          movementId: trMvId || (merged.mouvements?.[0]?.id || ''),
          lotOrSerial: trLot,
          expirationDate: trExp,
          volume: trVolRaw !== undefined && trVolRaw !== '' ? Math.round(parseNum(trVolRaw, 1)) || 1 : 1,
          situation: trSit || 'Disponible',
          emplacement: trEmp || 'Centrale des stocks',
          reservationInfo: trRes,
          bonCommande: trBc,
          client: trCli,
          dateEstimee: trDateEst,
          comment: trCom,
        });
      }
    }
    if (trList.length > 0 || !Array.isArray(merged.traceabilities)) {
      merged.traceabilities = trList;
    }

    merged.traceabilityEnabled =
      merged.traceabilityEnabled !== undefined
        ? normalizeBool(merged.traceabilityEnabled, false)
        : merged.traceabilities.length > 0;
  } else if (tabType === 'stocksDistribues') {
    const parseNum = (v: any, def = 0): number => {
      if (v === undefined || v === null || v === '') return def;
      if (typeof v === 'number') return isNaN(v) ? def : v;
      const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.').replace(/[^0-9.-]/g, ''));
      return isNaN(n) ? def : n;
    };

    const rawLoc = String(merged.locationName || merged.emplacement || '').trim();
    const canonicalLocations = [
      'Centrale des stocks',
      'Entrepôt A', 'Entrepôt B', 'Entrepôt C', 'Entrepôt D', 'Entrepôt E',
      'Entrepôt F', 'Entrepôt G', 'Entrepôt H', 'Entrepôt I', 'Entrepôt J',
      'Véhicule A', 'Véhicule B', 'Véhicule C', 'Véhicule D', 'Véhicule E',
      'Véhicule F', 'Véhicule G', 'Véhicule H', 'Véhicule I', 'Véhicule J',
    ];
    let resolvedLoc = rawLoc || 'Entrepôt A';
    if (rawLoc) {
      const candidateParts = rawLoc.split(/\s*[—–\-:]\s*/).map(s => s.trim()).filter(Boolean);
      const allPartsToCheck = [rawLoc, ...candidateParts];
      for (const part of allPartsToCheck) {
        const lower = part.toLowerCase();
        if (lower === 'centrale' || lower === 'centrale des stocks') {
          resolvedLoc = 'Centrale des stocks';
          break;
        }
        const matchedCanon = canonicalLocations.find(c => c.toLowerCase() === lower);
        if (matchedCanon) {
          resolvedLoc = matchedCanon;
          break;
        }
      }
    }
    merged.locationName = resolvedLoc;
    merged.ugs = String(merged.ugs || '').trim();
    merged.denominationPieceId = String(merged.denominationPieceId || merged.piece || merged.nom || merged.ugs || '').trim();
    merged.stockId = String(merged.stockId || '').trim();
    merged.volumeDisponible = Math.round(parseNum(merged.volumeDisponible ?? merged.quantite, 0));
    merged.volumeReserve = Math.round(parseNum(merged.volumeReserve ?? merged.quantiteReservee, 0));
    merged.volumeEntrant = Math.round(parseNum(merged.volumeEntrant, 0));

    const rawId = String(merged.id || merged.identifiant || '').trim();
    if (rawId) {
      merged.id = rawId;
      merged.identifiant = rawId;
    } else if (merged.ugs || merged.denominationPieceId || merged.stockId) {
      const slugPiece = (merged.ugs || merged.denominationPieceId || merged.stockId)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      const slugLoc = resolvedLoc
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      merged.id = `ds_${slugPiece}_${slugLoc}`;
      merged.identifiant = merged.id;
    } else {
      merged.id = '';
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
  } else if (tabType === 'variables') {
    // Always recover any fields from rawByHeader or legacy unmapped properties on merged
    const rawKeys = Object.keys(rawByHeader);
    if (rawKeys.length > 0) {
      const fallbackColMap = resolveGenericColumnFieldMap(rawKeys, 'variables');
      for (const [kIdx, def] of fallbackColMap.entries()) {
        const rk = rawKeys[kIdx];
        const rv = rk ? rawByHeader[rk] : '';
        if (rv !== undefined && rv !== '' && (merged[def.field] === undefined || merged[def.field] === '')) {
          merged[def.field] = rv;
        }
      }
    }

    const rawCat = String(merged.category || merged['Catégorie.'] || merged['Catégorie'] || merged.categorie || '').trim();
    const normCat = rawCat
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    const canonicalCategories: Array<{ label: string; keys: string[] }> = [
      { label: 'Modèle Défibrillateur', keys: ['modeledefibrillateur', 'defibrillateur', 'defibrillateurs', 'modeledae', 'dae'] },
      { label: 'Modèle Coffret', keys: ['modelecoffret', 'coffret', 'coffrets', 'armoire', 'boitier', 'support'] },
      { label: 'Modèle Électrode', keys: ['modeleelectrode', 'modeleelectrodes', 'electrode', 'electrodes', 'padpak'] },
      { label: 'Modèle Batterie', keys: ['modelebatterie', 'modelebatteries', 'batterie', 'batteries', 'pile', 'piles'] },
      { label: 'Modèle Signalétique', keys: ['modelesignaletique', 'signaletique', 'signaletiques', 'panneau', 'affichage'] },
      { label: 'Modèle Scellé', keys: ['modelescelle', 'modelescelles', 'scelle', 'scelles'] },
      { label: 'Modèle Autocollant', keys: ['modeleautocollant', 'modeleautocollants', 'autocollant', 'autocollants', 'sticker', 'etiquette'] },
      { label: 'Modèle Kit de secours', keys: ['modelekitdesecours', 'modelekitsecours', 'kitdesecours', 'kitsecours', 'troussedesecours', 'trousse'] },
      { label: 'Modèle Pièce Autre', keys: ['modelepieceautre', 'pieceautre', 'autrepiece', 'accessoire', 'consommable', 'autre'] },
      { label: 'Modèle Contrat', keys: ['modelecontrat', 'contrat', 'contrats', 'typecontrat'] },
      { label: 'Modèle Service', keys: ['modeleservice', 'service', 'services', 'prestationservice'] },
      { label: 'Drapeau post-intervention', keys: ['drapeaupostintervention', 'drapeauxpostintervention', 'flagpostintervention'] },
      { label: 'Fournisseur', keys: ['fournisseur', 'fournisseurs', 'distributeur'] },
      { label: 'Modèle Raison Prestation', keys: ['modeleraisonprestation', 'raisonprestation', 'motifprestation', 'motifintervention', 'raisonintervention'] },
      { label: 'Drapeau GMAO', keys: ['drapeaugmao', 'drapeauxgmao', 'flaggmao', 'drapeau'] },
      { label: 'Type Filtre Purificateur', keys: ['typefiltrepurificateur', 'typefiltre'] },
      { label: 'Modèle Filtre Purificateur', keys: ['modelefiltrepurificateur', 'modelefiltre', 'filtrepurificateur'] },
      { label: 'Formation', keys: ['formation', 'formations', 'modeleformation'] },
    ];
    const matchedCat =
      canonicalCategories.find(c => c.keys.includes(normCat)) ||
      (normCat.includes('raison') && !normCat.includes('livraison')
        ? { label: 'Modèle Raison Prestation', keys: [] }
        : undefined);
    merged.category = matchedCat ? matchedCat.label : (rawCat || 'Modèle Défibrillateur');

    merged.nom = String(merged.nom || merged['Titre de la variable.'] || merged['Titre de la variable'] || merged.titre || merged.intitule || merged.denomination || '').trim();
    merged.marque = String(merged.marque || merged.fabricant || merged.fournisseur || 'Standard').trim() || 'Standard';
    merged.description = String(merged.description || merged['Commentaire sur la variable.'] || merged['Commentaire sur la variable'] || merged.commentaire || '').trim();
    merged.identifiant = String(merged.identifiant || merged['Identifiant.'] || merged['Identifiant'] || merged.ugs || '').trim();
    if (
      !merged.identifiant &&
      merged.id &&
      !String(merged.id).startsWith('v_') &&
      !String(merged.id).startsWith('sheet_')
    ) {
      merged.identifiant = String(merged.id).trim();
    }
    merged.imageUrl = String(merged.imageUrl || merged['Image URL'] || merged['Image URL.'] || '').trim();

    const rawRappelOpt = String(
      merged.rappelAlerteOption ||
        merged["Type d'alerte / rappel."] ||
        merged['Type d’alerte / rappel.'] ||
        merged["Type d'alerte / rappel"] ||
        ''
    ).trim();
    const normRappelOpt = rawRappelOpt
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    if (!normRappelOpt || normRappelOpt.includes('aucun') || ['non', 'ras', 'sans'].includes(normRappelOpt)) {
      merged.rappelAlerteOption = '';
    } else if (normRappelOpt.includes('miseajourlogicielle')) {
      merged.rappelAlerteOption = 'Mise à jour logicielle — Orange';
    } else if (normRappelOpt.includes('rappelatelier')) {
      merged.rappelAlerteOption = 'Rappel atelier — Rouge';
    } else if (normRappelOpt.includes('modificationnotice')) {
      merged.rappelAlerteOption = "Modification notice d'utilisation — Orange";
    } else if (normRappelOpt.includes('retraitdumarche')) {
      merged.rappelAlerteOption = 'Retrait du marché — Rouge';
    } else if (normRappelOpt.includes('observationcourante')) {
      merged.rappelAlerteOption = 'Observation courante — Orange';
    } else if (normRappelOpt.includes('observationgrave')) {
      merged.rappelAlerteOption = 'Observation grave — Rouge';
    } else {
      merged.rappelAlerteOption = rawRappelOpt;
    }

    merged.rappelDateDebut = normalizeDateStr(merged.rappelDateDebut || merged['Date de début.'] || merged['Date de début'] || '');
    merged.rappelDateFin = normalizeDateStr(merged.rappelDateFin || merged['Date de fin.'] || merged['Date de fin'] || '');
    merged.rappelObservation = String(
      merged.rappelObservation ||
        merged['Observation sur le rappel ou l’alerte.'] ||
        merged["Observation sur le rappel ou l'alerte."] ||
        merged['Observation sur le rappel ou l’alerte'] ||
        merged["Observation sur le rappel ou l'alerte"] ||
        ''
    ).trim();

    if (!merged.id || String(merged.id).startsWith('sheet_gen_')) {
      merged.id =
        merged.identifiant ||
        merged.nom ||
        `sheet_gen_variables_${tenantId}_${rowIndexZeroBased + 2}`;
    }
  }

  if (!merged.id) {
    merged.id =
      merged.identifiant ||
      merged.numeroPiece ||
      merged.ref ||
      merged.interventionReference ||
      merged.tourIdentifiant ||
      merged.reportId ||
      merged.numeroCommande ||
      merged.ugs ||
      merged.tourCode ||
      merged.reference ||
      merged.nom ||
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

  // Prepare an enriched record with derived flat fields (e.g. for membresEnvironnement, tournees, missionsTournees, rapportsPdf, commandes, formations, stagiaires, emargements)
  const enriched: Record<string, any> = { ...(record || {}) };
  if (tabType === 'tournees') {
    enriched.tourIdentifiant = enriched.tourIdentifiant || enriched.identifiant || enriched.tourCode || enriched.id || '';
    enriched.title = enriched.title || enriched.name || '';
    enriched.plannerName = enriched.plannerName || enriched.planificateur || '';
    enriched.startDate = enriched.startDate || enriched.date || '';
    enriched.status = enriched.status || 'Brouillon';
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
    if (Array.isArray(enriched.attachments) && enriched.attachments.length > 0) {
      enriched.pieceJointeDevisName = enriched.attachments.map((a: any) => a?.url || a?.name || '').filter(Boolean).join(', ');
    } else if (Array.isArray(enriched.piecesJointes) && enriched.piecesJointes.length > 0) {
      enriched.pieceJointeDevisName = enriched.piecesJointes.map((a: any) => a?.url || a?.name || '').filter(Boolean).join(', ');
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

    enriched.ecran = enriched.ecran || enriched.techEquipeMessageNumerique || snap.ecran || 'Non';
    enriched.verificationsConformes =
      enriched.verificationsConformes ||
      snap.verificationsConformes ||
      ((enriched.techVoyantConforme === 'Non' || enriched.techGuidesVocauxConformes === 'Non' || enriched.techBranchementElectrodesConforme === 'Non')
        ? 'Non'
        : 'Oui');

    // Populate prefixed section keys for canonical mapping
    enriched._s5_fabrication = snap.fabrication || enriched.fabrication || '';
    enriched._s5_miseEnService = snap.miseEnService || enriched.miseEnService || '';
    enriched._s6_modeleElectrodeA = snap.modeleElectrodeA || snap.modeleElectrodeAId || enriched.modeleElectrodeA || '';
    enriched._s6_lotElectrodeA = snap.lotElectrodeA || enriched.lotElectrodeA || '';
    enriched._s6_fabricationElectrodeA = snap.fabricationElectrodeA || snap.insertionElectrodeA || enriched.fabricationElectrodeA || enriched.insertionElectrodeA || '';
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
    enriched._s7_fabricationElectrodeP = snap.fabricationElectrodeP || snap.insertionElectrodeP || enriched.fabricationElectrodeP || enriched.insertionElectrodeP || '';
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
  } else if (tabType === 'crm') {
    if (!enriched.photoDataUrl && enriched.lienStockagePartageDevis) {
      enriched.photoDataUrl = enriched.lienStockagePartageDevis;
    }
    if (!enriched.photoDataUrl && Array.isArray(enriched.fichiersDevis) && enriched.fichiersDevis.length > 0) {
      enriched.photoDataUrl = enriched.fichiersDevis.map((f: any) => f?.url || f?.name || '').filter(Boolean).join(', ');
    }
  } else if (tabType === 'exportations') {
    enriched.transferType = enriched.transferType || 'export';
    enriched.fileUrl = enriched.fileUrl || enriched.driveFileUrl || enriched.url || '';
  } else if (tabType === 'commandes' || tabType === 'devisFactures') {
    const docRef = enriched.ref || enriched.numeroPiece || enriched.id || '';
    enriched.id = enriched.id || docRef;
    enriched.ref = docRef;
    enriched.numeroPiece = docRef;
    enriched.assignedMemberName = enriched.assignedMemberName || '';
    enriched.clientDenomination = enriched.clientDenomination || enriched.clientName || enriched.clientId || '';
    enriched.clientIdField = enriched.clientIdField || enriched.clientId || '';
    enriched.payeurId = enriched.payeurId || '';
    enriched.intituleContrat = enriched.intituleContrat || enriched.intitule || '';
    enriched.referenceContrat = enriched.referenceContrat || enriched.contrat || '';
    enriched.type = enriched.type || (tabType === 'devisFactures' ? 'FACTURE' : 'DEVIS');
    enriched.dateStr = enriched.dateStr || enriched.date || '';
    enriched.commentaire = enriched.commentaire || '';
    enriched.codeTaxe = enriched.codeTaxe || 'TVA 20%';
    enriched.commentaires = enriched.commentaires || enriched.notes || '';
    enriched.urlSource = enriched.urlSource || '';
    enriched.status = enriched.payment ? 'Payé' : (enriched.status || 'En attente');
    enriched.hasBonCommande = enriched.hasBonCommande ? 'Oui' : 'Non';
    enriched.bonCommandeReference = enriched.bonCommandeReference || '';
    enriched.bonCommandeLivraison = enriched.bonCommandeLivraison || '';
    enriched.bonCommandeSituation = enriched.bonCommandeSituation || '';
    enriched.bonCommandeEntete = enriched.bonCommandeEntete || '';
    enriched.totalHt =
      enriched.totalHt !== undefined && enriched.totalHt !== null
        ? String(enriched.totalHt)
        : enriched.amountHT !== undefined
        ? String(enriched.amountHT)
        : '0';
    enriched.totalTva =
      enriched.totalTva !== undefined && enriched.totalTva !== null
        ? String(enriched.totalTva)
        : enriched.tva !== undefined
        ? String(enriched.tva)
        : '0';
    enriched.totalTtc =
      enriched.totalTtc !== undefined && enriched.totalTtc !== null
        ? String(enriched.totalTtc)
        : enriched.amountTTC !== undefined
        ? String(enriched.amountTTC)
        : '0';

    const itemsArr = Array.isArray(enriched.items) ? enriched.items : [];
    for (let idx = 1; idx <= 10; idx++) {
      const pItem = `_item${idx}_`;
      const it = itemsArr[idx - 1];
      if (it) {
        const pHt = it.prixVenteHt ?? it.unitPrice ?? '';
        const qte = it.quantite ?? it.quantity ?? '';
        const tHt =
          it.totalHt !== undefined && it.totalHt !== null && it.totalHt !== ''
            ? it.totalHt
            : pHt !== '' && qte !== ''
            ? Number((Number(pHt) * Number(qte)).toFixed(2))
            : '';
        enriched[`${pItem}ugs`] = it.ugs || '';
        enriched[`${pItem}nomPiece`] = it.nomPiece || it.description || '';
        enriched[`${pItem}prixVenteHt`] = pHt !== '' ? String(pHt) : '';
        enriched[`${pItem}quantite`] = qte !== '' ? String(qte) : '';
        enriched[`${pItem}totalHt`] = tHt !== '' ? String(tHt) : '';
      } else {
        enriched[`${pItem}ugs`] = '';
        enriched[`${pItem}nomPiece`] = '';
        enriched[`${pItem}prixVenteHt`] = '';
        enriched[`${pItem}quantite`] = '';
        enriched[`${pItem}totalHt`] = '';
      }
    }
  } else if (tabType === 'formations') {
    enriched.id = enriched.id || enriched.identifiant || '';
    enriched.identifiant = enriched.id;
    enriched.intitule = enriched.intitule || enriched.typeDeFormation || '';
    const plages = Array.isArray(enriched.plagesHoraires) ? enriched.plagesHoraires : [];
    for (let idx = 1; idx <= 10; idx++) {
      const pl = plages[idx - 1];
      const p = `_plage${idx}_`;
      if (pl) {
        enriched[`${p}dateDebut`] = pl.dateDebut || pl.date || (idx === 1 ? enriched.date || '' : '');
        enriched[`${p}heureDebut`] = pl.heureDebut || (idx === 1 ? enriched.creneau || '' : '');
        enriched[`${p}dateFin`] = pl.dateFin || pl.dateDebut || pl.date || '';
        enriched[`${p}heureFin`] = pl.heureFin || '';
      } else {
        enriched[`${p}dateDebut`] = idx === 1 ? enriched.date || '' : '';
        enriched[`${p}heureDebut`] = idx === 1 ? enriched.creneau || '' : '';
        enriched[`${p}dateFin`] = idx === 1 ? enriched.date || '' : '';
        enriched[`${p}heureFin`] = '';
      }
    }
    if (plages.length > 0) {
      enriched.date = enriched.date || plages[0]?.dateDebut || plages[0]?.date || '';
      enriched.creneau = enriched.creneau || plages[0]?.heureDebut || '';
    }
    enriched.dateHeure = enriched.dateHeure || [enriched.date, enriched.creneau].filter(Boolean).join(' ');
    enriched.formateurId = enriched.formateurId || enriched.formateur || '';
    enriched.statut = enriched.statut || 'Planifié';
    enriched.commentaire = enriched.commentaire || '';
    if (Array.isArray(enriched.reasons) && enriched.reasons.length > 0) {
      enriched.reason = enriched.reasons.join(', ');
    } else {
      enriched.reason = enriched.reason || '';
    }
    enriched.clientId = enriched.clientName || enriched.clientId || '';
    enriched.lieuFormation = enriched.lieuFormation || 'Sur le site du client';
    enriched.adresse = enriched.adresse || '';
    enriched.ville = enriched.ville || '';
    enriched.codePostal = enriched.codePostal || '';
    enriched.region = enriched.region || '';
    enriched.pays = enriched.pays || 'France';
    enriched.bonCommandeId = enriched.customBonCommande || enriched.bonCommandeId || '';
    enriched.dureeHeures =
      enriched.dureeHeures !== undefined && enriched.dureeHeures !== null ? String(enriched.dureeHeures) : '';
  } else if (tabType === 'stagiaires') {
    enriched.id = enriched.id || enriched.identifiant || '';
    enriched.identifiant = enriched.id;
    enriched.prenom = enriched.prenom || '';
    enriched.nom = enriched.nom || '';
    enriched.nomPrenom = enriched.nomPrenom || [enriched.prenom, enriched.nom].filter(Boolean).join(' ');
    enriched.dateNaissance = enriched.dateNaissance || enriched.dateDeNaissance || '';
    enriched.email = enriched.email || enriched.contactEmail || '';
    enriched.telephone = enriched.telephone || enriched.contactTelephone || '';
    enriched.sexe = enriched.sexe || '';
    enriched.adresse = enriched.adresse || '';
    enriched.ville = enriched.ville || '';
    enriched.codePostal = enriched.codePostal || '';
    enriched.region = enriched.region || '';
    enriched.pays = enriched.pays || 'France';
    enriched.clientName = enriched.clientName || enriched.clientId || '';
    enriched.contactNomPrenom = enriched.contactNomPrenom || '';
    enriched.commentaire = enriched.commentaire || '';
  } else if (tabType === 'emargements') {
    enriched.id = enriched.id || enriched.identifiant || '';
    enriched.identifiant = enriched.id;
    enriched.formationId = enriched.formationId || '';
    enriched.statut = enriched.statut || 'En attente';
    enriched.lieuFormation = enriched.lieuFormation || 'Sur le site du client';
    enriched.adresse = enriched.adresse || '';
    enriched.ville = enriched.ville || '';
    enriched.codePostal = enriched.codePostal || '';
    enriched.pays = enriched.pays || 'France';
    enriched.intituleFormation = enriched.intituleFormation || '';
    enriched.formateurAssign = enriched.formateurAssign || '';
    enriched.commentaire = enriched.commentaire || '';
    enriched.formateurPresent = normalizeYesNo(enriched.formateurPresent, 'Non');
    enriched.formateurSignature = enriched.formateurSignature || '';
    enriched.formateurHorodatage = enriched.formateurHorodatage || '';
    enriched.formateurValidation = enriched.formateurValidation || '';

    const stagList = Array.isArray(enriched.stagiaires) ? enriched.stagiaires : [];
    for (let idx = 1; idx <= 50; idx++) {
      const p = `_stag${idx}_`;
      const st = stagList[idx - 1];
      if (st) {
        enriched[`${p}stagiaire`] = st.stagiaireId || st.stagiaireNom || '';
        enriched[`${p}present`] = normalizeYesNo(st.present, 'Non');
        enriched[`${p}signature`] = st.signature || st.signatureDataUrl || '';
        enriched[`${p}horodatage`] = st.horodatage || '';
        enriched[`${p}validation`] = st.validation || st.modeValidation || '';
      } else {
        enriched[`${p}stagiaire`] = '';
        enriched[`${p}present`] = '';
        enriched[`${p}signature`] = '';
        enriched[`${p}horodatage`] = '';
        enriched[`${p}validation`] = '';
      }
    }
  } else if (tabType === 'stocksGlobaux' || tabType === 'stocks') {
    enriched.id = enriched.id || enriched.identifiant || '';
    enriched.identifiant = enriched.id;
    enriched.ugs = enriched.ugs || '';
    enriched.denominationPieceId = enriched.denominationPieceNom || enriched.denominationPieceId || '';
    if (Array.isArray(enriched.usageRecommandeNoms) && enriched.usageRecommandeNoms.length > 0) {
      enriched.usageRecommandeIds = enriched.usageRecommandeNoms.join(', ');
    } else if (Array.isArray(enriched.usageRecommandeIds)) {
      enriched.usageRecommandeIds = enriched.usageRecommandeIds.join(', ');
    } else {
      enriched.usageRecommandeIds = enriched.usageRecommandeIds || '';
    }
    enriched.valeurAchat = enriched.valeurAchat !== undefined && enriched.valeurAchat !== null ? String(enriched.valeurAchat) : '0';
    enriched.marge = enriched.marge !== undefined && enriched.marge !== null ? String(enriched.marge) : '0';
    enriched.prixVenteHt = enriched.prixVenteHt !== undefined && enriched.prixVenteHt !== null ? String(enriched.prixVenteHt) : '0';
    enriched.stockage = enriched.stockage || 'Entrepôt A';
    enriched.commentaire = enriched.commentaire || '';
    enriched.quantite = enriched.quantite !== undefined && enriched.quantite !== null ? String(enriched.quantite) : '0';
    enriched.quantiteReservee = enriched.quantiteReservee !== undefined && enriched.quantiteReservee !== null ? String(enriched.quantiteReservee) : '0';

    const mvList = Array.isArray(enriched.mouvements) ? enriched.mouvements : [];
    const computedEntrant = mvList
      .filter((m: any) => m && !m.isCanceled && m.statut !== 'Annulé' && m.statut !== 'Terminé' && m.type === 'Réapprovisionnement fournisseur')
      .reduce((acc: number, m: any) => acc + (Number(m.volume) || 0), 0);
    enriched.volumeEntrant =
      enriched.volumeEntrant !== undefined && enriched.volumeEntrant !== null
        ? String(enriched.volumeEntrant)
        : String(computedEntrant);

    enriched.livraisonDate = enriched.livraisonDate || '';
    enriched.reapprovisionnementDate = enriched.reapprovisionnementDate || '';
    enriched.besoinProjete2Mois = enriched.besoinProjete2Mois !== undefined && enriched.besoinProjete2Mois !== null ? String(enriched.besoinProjete2Mois) : '0';
    enriched.besoinProjete2a6Mois = enriched.besoinProjete2a6Mois !== undefined && enriched.besoinProjete2a6Mois !== null ? String(enriched.besoinProjete2a6Mois) : '0';
    enriched.totalACommander = enriched.totalACommander !== undefined && enriched.totalACommander !== null ? String(enriched.totalACommander) : '0';
    enriched.traceabilityEnabled = enriched.traceabilityEnabled ? 'Oui' : 'Non';

    for (let idx = 1; idx <= 20; idx++) {
      const p = `_mv${idx}_`;
      const mv = mvList[idx - 1];
      if (mv) {
        enriched[`${p}id`] = mv.id || '';
        enriched[`${p}type`] = mv.type || '';
        enriched[`${p}volume`] = mv.volume !== undefined && mv.volume !== null ? String(mv.volume) : '';
        enriched[`${p}date`] = mv.date || '';
        enriched[`${p}statut`] = mv.statut || '';
        enriched[`${p}emplacement`] = mv.emplacement || '';
        enriched[`${p}bonCommande`] = mv.bonCommande || '';
        enriched[`${p}trackingLink`] = mv.trackingLink || '';
      } else {
        enriched[`${p}id`] = '';
        enriched[`${p}type`] = '';
        enriched[`${p}volume`] = '';
        enriched[`${p}date`] = '';
        enriched[`${p}statut`] = '';
        enriched[`${p}emplacement`] = '';
        enriched[`${p}bonCommande`] = '';
        enriched[`${p}trackingLink`] = '';
      }
    }

    const trList = Array.isArray(enriched.traceabilities) ? enriched.traceabilities : [];
    for (let idx = 1; idx <= 50; idx++) {
      const p = `_tr${idx}_`;
      const tr = trList[idx - 1];
      if (tr) {
        enriched[`${p}id`] = tr.id || '';
        enriched[`${p}movementId`] = tr.movementId || '';
        enriched[`${p}lotOrSerial`] = tr.lotOrSerial || '';
        enriched[`${p}expirationDate`] = tr.expirationDate || '';
        enriched[`${p}volume`] = tr.volume !== undefined && tr.volume !== null ? String(tr.volume) : '1';
        enriched[`${p}situation`] = tr.situation || 'Disponible';
        enriched[`${p}emplacement`] = tr.emplacement || 'Centrale des stocks';
        enriched[`${p}reservationInfo`] = tr.reservationInfo || '';
        enriched[`${p}bonCommande`] = tr.bonCommande || '';
        enriched[`${p}client`] = tr.client || '';
        enriched[`${p}dateEstimee`] = tr.dateEstimee || '';
        enriched[`${p}comment`] = tr.comment || '';
      } else {
        enriched[`${p}id`] = '';
        enriched[`${p}movementId`] = '';
        enriched[`${p}lotOrSerial`] = '';
        enriched[`${p}expirationDate`] = '';
        enriched[`${p}volume`] = '';
        enriched[`${p}situation`] = '';
        enriched[`${p}emplacement`] = '';
        enriched[`${p}reservationInfo`] = '';
        enriched[`${p}bonCommande`] = '';
        enriched[`${p}client`] = '';
        enriched[`${p}dateEstimee`] = '';
        enriched[`${p}comment`] = '';
      }
    }
  } else if (tabType === 'stocksDistribues') {
    enriched.id = enriched.id || enriched.identifiant || '';
    enriched.identifiant = enriched.id;
    enriched.ugs = enriched.ugs || '';
    enriched.denominationPieceId = enriched.denominationPieceNom || enriched.denominationPieceId || '';
    enriched.stockId = enriched.stockId || '';
    enriched.locationName = enriched.locationName || 'Entrepôt A';
    enriched.collaborateur = enriched.collaborateur || '';
    enriched.volumeDisponible = enriched.volumeDisponible !== undefined && enriched.volumeDisponible !== null ? String(enriched.volumeDisponible) : '0';
    enriched.volumeReserve = enriched.volumeReserve !== undefined && enriched.volumeReserve !== null ? String(enriched.volumeReserve) : '0';
    enriched.volumeEntrant = enriched.volumeEntrant !== undefined && enriched.volumeEntrant !== null ? String(enriched.volumeEntrant) : '0';
    enriched.sortantSemaine1 = enriched.sortantSemaine1 !== undefined && enriched.sortantSemaine1 !== null ? String(enriched.sortantSemaine1) : '0';
    enriched.sortantSemaine2 = enriched.sortantSemaine2 !== undefined && enriched.sortantSemaine2 !== null ? String(enriched.sortantSemaine2) : '0';
    enriched.sortant30Jours = enriched.sortant30Jours !== undefined && enriched.sortant30Jours !== null ? String(enriched.sortant30Jours) : '0';
    enriched.commentaire = enriched.commentaire || '';
  } else if (tabType === 'achatsFournisseurs') {
    enriched.orderRef = enriched.orderRef || enriched.orderReference || '';
    enriched.date = enriched.date || enriched.dateStr || '';
    enriched.pdfFileName = enriched.pdfFileName || enriched.pdfName || '';
    enriched.pdfDataUrl = enriched.pdfDataUrl || enriched.pdfUrl || '';
  } else if (tabType === 'crm') {
    enriched.reference = enriched.reference || enriched.id || '';
    enriched.id = enriched.id || enriched.reference || '';
    enriched.dateOuverture = enriched.dateOuverture || enriched.date || '';
    enriched.date = enriched.date || enriched.dateOuverture || '';
    enriched.dateDerniereActualisation = enriched.dateDerniereActualisation || enriched.dateOuverture || '';
    enriched.situation = enriched.situation || (enriched.status === 'Résolu' ? 'Terminé' : enriched.status) || 'Nouveau';
    enriched.status = enriched.status || enriched.situation || 'Nouveau';
    enriched.categorie = enriched.categorie || enriched.crmCategory || 'Sans Catégorie';
    enriched.crmCategory = enriched.crmCategory || enriched.categorie || '';
    enriched.client = enriched.client || enriched.entreprise || enriched.customClientName || '';
    enriched.entreprise = enriched.entreprise || enriched.client || '';
    enriched.prenomNom = enriched.prenomNom || enriched.nomPrenom || '';
    enriched.nomPrenom = enriched.nomPrenom || enriched.prenomNom || '';
    enriched.telephone = enriched.telephone || enriched.phone || '';
    enriched.description = enriched.description || enriched.message || '';
    enriched.message = enriched.message || enriched.description || '';
    enriched.totalAffaireHT = enriched.totalAffaireHT ?? enriched.montantEstime ?? '';
    enriched.montantEstime = enriched.montantEstime ?? enriched.totalAffaireHT ?? '';
    enriched.scorePotentielConversion = enriched.scorePotentielConversion ?? enriched.probabilite ?? '';
    enriched.probabilite = enriched.probabilite ?? enriched.scorePotentielConversion ?? '';
    enriched.dateProchaineRelance = enriched.dateProchaineRelance || enriched.dateRelance || '';
    enriched.dateRelance = enriched.dateRelance || enriched.dateProchaineRelance || '';
    enriched.origineLead = enriched.origineLead || enriched.sourceOpportunite || '';
    enriched.sourceOpportunite = enriched.sourceOpportunite || enriched.origineLead || '';
    enriched.lienStockagePartageDevis = enriched.lienStockagePartageDevis || enriched.photoDataUrl || '';
    enriched.photoDataUrl = enriched.photoDataUrl || enriched.lienStockagePartageDevis || '';
  } else if (tabType === 'ticketsCaisse') {
    enriched.user = enriched.user || enriched.techName || '';
    enriched.techName = enriched.techName || enriched.user || '';
    enriched.merchant = enriched.merchant || enriched.title || '';
    enriched.title = enriched.title || enriched.merchant || '';
    enriched.date = enriched.date || enriched.dateStr || '';
    enriched.dateStr = enriched.dateStr || enriched.date || '';
    enriched.amountHT = enriched.amountHT ?? enriched.amountHt ?? 0;
    enriched.tva = enriched.tva ?? enriched.amountTva ?? 0;
    enriched.amount = enriched.amount ?? enriched.amountTtc ?? 0;
    enriched.receiptUrl = enriched.receiptUrl || enriched.photoUrl || '';
    enriched.photoUrl = enriched.photoUrl || enriched.receiptUrl || '';
    enriched.category = enriched.category || 'Frais';
    enriched.status = enriched.status || 'Validé';
  } else if (tabType === 'ged') {
    enriched.date = enriched.date || enriched.dateStr || '';
  } else if (tabType === 'messagesInternes') {
    enriched.authorName = enriched.authorName || enriched.sender || '';
    enriched.tag = enriched.tag || enriched.channel || 'Exploitation';
    enriched.content = enriched.content || enriched.text || '';
    enriched.dateStr = enriched.dateStr || enriched.time || '';
  } else if (tabType === 'membresEnvironnement') {
    if (Array.isArray(enriched.competences)) {
      enriched.competences = enriched.competences.join(', ');
    }
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
  } else if (tabType === 'variables') {
    enriched.category = enriched.category || enriched.categorie || 'Modèle Défibrillateur';
    enriched.nom = enriched.nom || enriched.titre || '';
    enriched.marque = enriched.marque || enriched.fabricant || 'Standard';
    enriched.typeDefibrillateur =
      enriched.category === 'Modèle Défibrillateur'
        ? (enriched.typeDefibrillateur || 'Non renseigné')
        : (enriched.typeDefibrillateur || '');
    enriched.couleurHex = enriched.couleurHex ?? '';
    enriched.dureePrestation =
      enriched.dureePrestation !== undefined && enriched.dureePrestation !== null && String(enriched.dureePrestation).trim() !== ''
        ? String(enriched.dureePrestation)
        : '';
    enriched.identifiant = enriched.identifiant ?? enriched.ugs ?? '';
    enriched.imageUrl = enriched.imageUrl ?? '';
    enriched.description = enriched.description ?? '';
    enriched.rappelAlerteOption = enriched.rappelAlerteOption ?? '';
    enriched.rappelDateDebut = enriched.rappelDateDebut ?? '';
    enriched.rappelDateFin = enriched.rappelDateFin ?? '';
    enriched.rappelObservation = enriched.rappelObservation ?? '';
    const visFields = [
      'visibiliteNumeroAtlasante',
      'visibiliteVersionLogiciel',
      'visibiliteFactureBrouillon',
      'visibilitePadPakAdulte',
      'visibiliteLotPadPakA',
      'visibilitePeremptionPadPakA',
      'visibiliteLotP',
      'visibilitePadPakPediatrique',
      'visibiliteLotPadPakP',
      'visibilitePeremptionPadPakP',
      'visibiliteFabricationBatterie',
      'visibiliteInsertionBatterie',
      'visibilitePeremptionBatterie',
      'visibilitePourcentageBatterie',
      'visibiliteGantsPresents',
      'visibilitePeremptionServiettes',
      'visibiliteServiettesPresentes',
      'visibilitePeremptionMasque',
      'visibiliteMasquePresent',
      'visibiliteCiseauxPresents',
      'visibilitePeremptionTrousse',
      'visibiliteRasoir',
      'visibiliteBranchementElectrodes',
      'visibiliteGuidesVocaux',
      'visibiliteMessageNumeriqueConforme',
      'visibiliteEquipeMessageNumerique',
      'visibiliteVoyantConforme',
      'visibiliteNettoyage',
      'visibilitePiecesJointes',
    ];
    for (const vf of visFields) {
      enriched[vf] =
        enriched.category === 'Modèle Défibrillateur'
          ? normalizeYesNo(enriched[vf], 'Oui')
          : (enriched[vf] ? normalizeYesNo(enriched[vf], 'Oui') : '');
    }
    enriched.infosTechnicien = enriched.infosTechnicien ?? '';
  }

  // 1. Map via canonical definitions if tabType is known
  const mappedColIndices = new Set<number>();
  if (tabType && GENERIC_CANONICAL_HEADERS[tabType]) {
    const colToDef = resolveGenericColumnFieldMap(headers, tabType);
    for (const [colIdx, def] of colToDef.entries()) {
      const v = enriched[def.field];
      if (v !== undefined && v !== null) {
        outRow[colIdx] = typeof v === 'object' ? JSON.stringify(v) : String(v);
        mappedColIndices.add(colIdx);
      }
    }
  }

  // 2. Also map any direct key matches for columns not already mapped by canonical definitions
  for (const [k, v] of Object.entries(enriched)) {
    if (k.startsWith('_') || v === undefined || v === null) continue;
    const colIdx = normHeaderMap.get(k.trim().toLowerCase());
    if (colIdx !== undefined && !mappedColIndices.has(colIdx)) {
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
    const primary = [item.id, item.identifiant].filter(Boolean).map(s => String(s).trim().toLowerCase());
    if (primary.length > 0) return primary;
    return [item.numeroSerie, item.specifiques?.numSerie, item.denomination]
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
  if (tabType === 'commandes' || tabType === 'devisFactures') {
    return [item.numeroPiece, item.ref, item.id, item.reference, item.numeroCommande]
      .filter(Boolean)
      .map(s => String(s).trim().toLowerCase());
  }
  if (tabType === 'formations' || tabType === 'stagiaires' || tabType === 'emargements') {
    return [item.identifiant, item.id, item.reference]
      .filter(Boolean)
      .map(s => String(s).trim().toLowerCase());
  }
  if (tabType === 'stocksGlobaux' || tabType === 'stocks') {
    return [item.id, item.identifiant, item.ugs, item.denominationPieceId, item.denominationPieceNom]
      .filter(Boolean)
      .map(s => String(s).trim().toLowerCase());
  }
  if (tabType === 'stocksDistribues') {
    const loc = String(item.locationName || '').trim().toLowerCase();
    const ugs = String(item.ugs || '').trim().toLowerCase();
    const denom = String(item.denominationPieceId || '').trim().toLowerCase();
    const denomNom = String(item.denominationPieceNom || '').trim().toLowerCase();
    const compositeKeys: string[] = [];
    if (loc) {
      if (ugs) compositeKeys.push(`${ugs}@@${loc}`);
      if (denom) compositeKeys.push(`${denom}@@${loc}`);
      if (denomNom) compositeKeys.push(`${denomNom}@@${loc}`);
    }
    return [item.id, item.identifiant, ...compositeKeys]
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
  if (tabType === 'variables') {
    const cat = String(item.category || '').trim().toLowerCase();
    const nom = String(item.nom || '').trim().toLowerCase();
    const prevNom = String(item._previousNom || '').trim().toLowerCase();
    const compositeKeys: string[] = [];
    if (cat && nom) compositeKeys.push(`${cat}@@${nom}`);
    if (cat && prevNom) compositeKeys.push(`${cat}@@${prevNom}`);
    return Array.from(
      new Set(
        [
          item.id,
          item._previousId,
          item.identifiant,
          item._previousIdentifiant,
          item.ugs,
          ...compositeKeys,
          item.nom,
          item._previousNom,
        ]
          .filter(Boolean)
          .map(s => String(s).trim().toLowerCase())
      )
    );
  }
  if (tabType !== 'defibrillateurs') {
    return [item.id, item.identifiant, item.interventionReference, item.tourIdentifiant, item.reportId, item.numeroPiece, item.ref, item.numeroCommande, item.ugs, item.tourCode, item.reference, item.orderRef, item.nom]
      .filter(Boolean)
      .map(s => String(s).trim().toLowerCase());
  }
  const primaryDefibKeys = [item.id, item.identifiant].filter(Boolean).map(s => String(s).trim().toLowerCase());
  if (primaryDefibKeys.length > 0) return primaryDefibKeys;
  return [item.numeroSerie]
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
  const clientVolumes: Record<string, number> = {};

  const normClientName = (val: any): string =>
    String(val || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/&#0*39;?/g, '')
      .replace(/[^a-z0-9]+/gi, ' ')
      .trim()
      .toLowerCase();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();

  for (let i = 0; i < items.length; i++) {
    const df = items[i];
    if (!df) continue;

    const cNameKey = normClientName(df.clientNom || df.client || '');
    const siteNameKey = normClientName(df.nomSite || '');
    if (cNameKey) {
      clientVolumes[cNameKey] = (clientVolumes[cNameKey] || 0) + 1;
    }
    if (siteNameKey && siteNameKey !== cNameKey) {
      clientVolumes[siteNameKey] = (clientVolumes[siteNameKey] || 0) + 1;
    }
    if (df.clientId && !isPlaceholderClientValue(df.clientId)) {
      const cidKey = `id:${String(df.clientId).trim().toLowerCase()}`;
      clientVolumes[cidKey] = (clientVolumes[cidKey] || 0) + 1;
    }
    if (df.clientIdField && !isPlaceholderClientValue(df.clientIdField)) {
      const cifKey = `id:${String(df.clientIdField).trim().toLowerCase()}`;
      if (cifKey !== `id:${String(df.clientId || '').trim().toLowerCase()}`) {
        clientVolumes[cifKey] = (clientVolumes[cifKey] || 0) + 1;
      }
    }
    if (df.payeurId && !isPlaceholderClientValue(df.payeurId)) {
      const pidKey = `payeur:${String(df.payeurId).trim().toLowerCase()}`;
      clientVolumes[pidKey] = (clientVolumes[pidKey] || 0) + 1;
    }

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
    clientVolumes,
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
  const hasUnmappedVariableKeys = (it: any): boolean => {
    if (!it || typeof it !== 'object') return true;
    if (!it.nom && !it.identifiant) return true;
    if (
      (it['Commentaire sur la variable.'] && !it.description) ||
      (it["Type d'alerte / rappel."] && !it.rappelAlerteOption) ||
      (it['Observation sur le rappel ou l’alerte.'] && !it.rappelObservation) ||
      (it["Observation sur le rappel ou l'alerte."] && !it.rappelObservation)
    ) {
      return true;
    }
    return false;
  };
  const isStaleDefibSnap = (snap: CachedSheetResult | null | undefined): boolean => {
    if (!snap || tabType !== 'defibrillateurs') return false;
    if (!Array.isArray(snap.headers) || snap.headers.length === 121 || snap.headers[0] === 'Section 1 - Identifiant') {
      return true;
    }
    return false;
  };
  if (!sheetMemoryCache.has(cacheKey)) {
    const diskSnap = loadDiskSnapshot(cacheKey);
    if (diskSnap && Array.isArray(diskSnap.items) && diskSnap.items.length > 0) {
      const isStaleVariablesSnap =
        tabType === 'variables' &&
        diskSnap.items.some(hasUnmappedVariableKeys);
      if (!isStaleVariablesSnap && !isStaleDefibSnap(diskSnap)) {
        if (tabType === 'defibrillateurs') {
          diskSnap.stats = computeSheetCollectionStats(diskSnap.items, 'defibrillateurs');
          saveDiskSnapshotAsync(cacheKey, diskSnap);
        }
        sheetMemoryCache.set(cacheKey, diskSnap);
      }
    }
  }

  if (!forceRefresh && sheetMemoryCache.has(cacheKey)) {
    const cached = sheetMemoryCache.get(cacheKey)!;
    const isStaleVariablesCache =
      tabType === 'variables' &&
      cached.items.some(hasUnmappedVariableKeys);
    if (cached.items.length > 0 && !isStaleVariablesCache && !isStaleDefibSnap(cached)) {
      if (tabType === 'defibrillateurs') {
        cached.stats = computeSheetCollectionStats(cached.items, 'defibrillateurs');
      }
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
      const isValidHeaderRow = (row0: string[] | undefined): boolean => {
        if (!row0 || row0.length === 0) return false;
        const nonEmpty = row0.map(c => String(c ?? '').trim()).filter(Boolean);
        if (nonEmpty.length === 0) return false;
        // A data row with a serialized _json payload in its last column is never a header row
        if (nonEmpty.some(c => c.startsWith('{"') && c.endsWith('}'))) return false;
        if (nonEmpty.some(c => c.toLowerCase() === '_json')) return true;
        if (tabType === 'defibrillateurs') {
          return buildColumnMatches(row0, DEFIB_CANONICAL_HEADERS).length >= 2;
        }
        if (tabType === 'autresMateriels') {
          return buildColumnMatches(row0, AUTRES_CANONICAL_HEADERS).length >= 2;
        }
        if (tabType === 'clients') {
          return buildColumnMatches(row0, CLIENTS_CANONICAL_HEADERS).length >= 2;
        }
        if (GENERIC_CANONICAL_HEADERS[tabType]) {
          const matched = resolveGenericColumnFieldMap(row0, tabType);
          return matched.size >= Math.min(2, GENERIC_CANONICAL_HEADERS[tabType]!.length);
        }
        return true;
      };

      const rawRow0HasContent = Boolean(
        rawMatrix &&
          Array.isArray(rawMatrix.headers) &&
          rawMatrix.headers.some(c => String(c ?? '').trim() !== '')
      );
      const hasRemoteHeaders = Boolean(rawMatrix && isValidHeaderRow(rawMatrix.headers));

      const defaultHeaders =
        tabType === 'defibrillateurs'
          ? DEFIB_CANONICAL_HEADERS.map(d => d.header)
          : tabType === 'autresMateriels'
          ? AUTRES_CANONICAL_HEADERS.map(d => d.header)
          : tabType === 'clients'
          ? CLIENTS_CANONICAL_HEADERS.map(d => d.header)
          : getDefaultGenericHeaders(tabType);

      if (
        tabType === 'defibrillateurs' &&
        Array.isArray(overlay.headers) &&
        (overlay.headers.length === 121 || overlay.headers[0] === 'Section 1 - Identifiant')
      ) {
        overlay.headers = [];
        overlay.upsertedById = {};
        saveMirrorOverlay(tenantId, tabType, extracted.spreadsheetId, overlay);
      }

      const headers = hasRemoteHeaders
        ? rawMatrix!.headers
        : (overlay.headers.length > 0 && isValidHeaderRow(overlay.headers) ? overlay.headers : defaultHeaders);

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

      // If Row 1 in the sheet was actually a data row written without headers, include it as the first data row!
      const effectiveRows =
        rawMatrix && Array.isArray(rawMatrix.rows)
          ? !hasRemoteHeaders && rawRow0HasContent
            ? [rawMatrix.headers, ...rawMatrix.rows]
            : rawMatrix.rows
          : [];

      if (effectiveRows.length > 0) {
        for (let i = 0; i < effectiveRows.length; i++) {
          const r = effectiveRows[i];
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
          if (tabType === 'clients') {
            const hasRealClientIdentity =
              (mapped.clientIdField && !String(mapped.clientIdField).startsWith('sheet_cli_')) ||
              Boolean(mapped.denomination) ||
              Boolean(mapped.siret);
            if (!hasRealClientIdentity) continue;
          } else if (tabType === 'stocksGlobaux' || tabType === 'stocks') {
            const hasRealStockIdentity = Boolean(mapped.denominationPieceId) || Boolean(mapped.ugs);
            if (!hasRealStockIdentity) continue;
          } else if (tabType === 'stocksDistribues') {
            const hasRealDistIdentity = Boolean(mapped.denominationPieceId) || Boolean(mapped.ugs) || Boolean(mapped.stockId);
            if (!hasRealDistIdentity) continue;
          } else if (tabType === 'variables') {
            const hasRealVariableIdentity = Boolean(mapped.nom) || Boolean(mapped.identifiant);
            if (!hasRealVariableIdentity) continue;
          }

          if (deletedSet.size > 0) {
            const keys = getRecordLookupKeys(mapped, tabType);
            if (keys.some(k => deletedSet.has(k))) continue;
          }

          baseItems.push(mapped);
        }

        // Auto-generate and persist missing "Section 1 - Identifiant." / "Identifiant" for Défibrillateurs and Autres Matériels
        if ((tabType === 'defibrillateurs' || tabType === 'autresMateriels') && baseItems.length > 0) {
          const usedUpperIds = new Set<string>();
          for (const it of baseItems) {
            const rawId = String(it?.identifiant || '').trim();
            if (
              rawId &&
              !it._missingSheetIdentifiant &&
              !rawId.startsWith('sheet_df_') &&
              !rawId.startsWith('sheet_am_')
            ) {
              usedUpperIds.add(rawId.toUpperCase());
            }
          }

          const itemsMissingIdent = baseItems.filter(it => {
            const rawId = String(it?.identifiant || '').trim();
            return (
              Boolean(it?._missingSheetIdentifiant) ||
              !rawId ||
              rawId.startsWith('sheet_df_') ||
              rawId.startsWith('sheet_am_')
            );
          });

          if (itemsMissingIdent.length > 0) {
            const shortEnvCode = resolveTenantShortEnvCode(tenantId, usedUpperIds);
            const identMatch = precomputedMatches.find(m => m.def.field === 'identifiant');
            const identColIdx = identMatch ? identMatch.colIdx : 0;
            const identColLetter = columnIndexToLetter(identColIdx);
            const missingIdentUpdates: Array<{ rowNumber: number; value: string; item: any }> = [];

            for (const it of itemsMissingIdent) {
              const generatedIdent = generateUniqueTenantEquipmentCode(shortEnvCode, usedUpperIds);
              it.identifiant = generatedIdent;
              it.id = generatedIdent;
              delete it._missingSheetIdentifiant;
              if (typeof it._sheetRowNumber === 'number' && it._sheetRowNumber >= 2) {
                missingIdentUpdates.push({
                  rowNumber: it._sheetRowNumber,
                  value: generatedIdent,
                  item: it,
                });
              }
            }

            if (missingIdentUpdates.length > 0 && rawMatrix !== null) {
              try {
                const accessToken = await getServiceAccountAccessToken();
                let wroteToSheet = false;
                if (accessToken) {
                  const sheetTitle = await resolveSheetTabTitle(extracted.spreadsheetId, extracted.gid);
                  const rangePrefix = buildSheetRangePrefix(sheetTitle);
                  const batchData = missingIdentUpdates.map(u => ({
                    range: `${rangePrefix}${identColLetter}${u.rowNumber}`,
                    values: [[u.value]],
                  }));
                  const writeRes = await fetchWithRetry(
                    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(extracted.spreadsheetId)}/values:batchUpdate`,
                    {
                      method: 'POST',
                      headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        valueInputOption: 'USER_ENTERED',
                        data: batchData,
                      }),
                      signal: AbortSignal.timeout(8000),
                    },
                    2
                  );
                  if (writeRes.ok) {
                    wroteToSheet = true;
                  }
                }
                const cfg = getGlobalGoogleConfig();
                if (!wroteToSheet && cfg.appsScriptBridgeUrl) {
                  for (const u of missingIdentUpdates) {
                    const rowValues =
                      tabType === 'defibrillateurs'
                        ? mapDefibToRow(headers, u.item)
                        : mapAutreMaterielToRow(headers, u.item);
                    await fetch(cfg.appsScriptBridgeUrl, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        action: 'upsertRow',
                        spreadsheetUrl,
                        spreadsheetId: extracted.spreadsheetId,
                        gid: extracted.gid,
                        headers,
                        rowNumber: u.rowNumber,
                        rowValues,
                      }),
                    }).catch(() => {});
                  }
                }
              } catch (err) {
                console.warn(`[SheetsEngine] Auto-fill missing identifiant write warning for ${tabType}:`, err);
              }
            }
          }
        }
      } else if (!rawMatrix) {
        // If remote fetch failed/timed out (e.g. during forceRefresh), preserve existing cached/disk rows before merging overlay
        const fallbackCached = sheetMemoryCache.get(cacheKey) || loadDiskSnapshot(cacheKey);
        if (fallbackCached && Array.isArray(fallbackCached.items) && fallbackCached.items.length > 0) {
          for (const item of fallbackCached.items) {
            if (!item || typeof item !== 'object') continue;
            if (deletedSet.size > 0) {
              const keys = getRecordLookupKeys(item, tabType);
              if (keys.some(k => deletedSet.has(k))) continue;
            }
            baseItems.push({ ...item });
          }
        }
      }

      const isSettingsTab =
        tabType === 'reglages' ||
        tabType === 'apparenceRapportsPdf' ||
        tabType === 'intituleEmplacements' ||
        tabType === 'communicationPortailClient' ||
        tabType === 'membresEnvironnement';

      // Merge upserted records from overlay if rawMatrix failed (offline fallback), or overlay was written recently (< 2 min ago),
      // or for any record in overlay that has not yet appeared in rawMatrix (e.g. if sheet is read-only / pending write)
      const upsertedEntries = Object.values(overlay.upsertedById || {});
      const isOverlayFreshOrOffline =
        !rawMatrix || (!isSettingsTab && !forceRefresh && overlay.lastSyncedAt && overlay.lastSyncedAt > Date.now() - 120000);
      if (upsertedEntries.length > 0) {
        const remainingUpsertedById: Record<string, any> = {};
        for (const [upKey, upItem] of Object.entries(overlay.upsertedById || {})) {
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
            if (isOverlayFreshOrOffline) {
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
              remainingUpsertedById[upKey] = upItem;
            }
          } else if (!isSettingsTab) {
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
            remainingUpsertedById[upKey] = upItem;
          }
        }
        if (rawMatrix && !isOverlayFreshOrOffline && Object.keys(remainingUpsertedById).length !== Object.keys(overlay.upsertedById || {}).length) {
          overlay.upsertedById = remainingUpsertedById;
          saveMirrorOverlay(tenantId, tabType, extracted.spreadsheetId, overlay);
        }
      }

      // Also merge any in-memory recent upserts that occurred during or shortly before this fetch
      const recentMap = recentSheetUpserts.get(cacheKey);
      if (recentMap && recentMap.size > 0) {
        if (rawMatrix && (isSettingsTab || forceRefresh)) {
          for (const [rk, entry] of recentMap.entries()) {
            if (entry?.syncedToRemoteSheet) {
              recentMap.delete(rk);
            }
          }
        }
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
      } else if (tabType === 'variables') {
        const seenVarIds = new Set<string>();
        for (let i = 0; i < baseItems.length; i++) {
          const item = baseItems[i];
          if (!item) continue;
          let vid = String(item.id || item.identifiant || item.nom || '').trim();
          if (!vid) {
            vid = `sheet_gen_variables_${tenantId}_${item._sheetRowNumber || i + 2}`;
          }
          if (seenVarIds.has(vid.toLowerCase())) {
            vid = `${vid}_r${item._sheetRowNumber || i + 2}`;
          }
          seenVarIds.add(vid.toLowerCase());
          item.id = vid;
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
        hasRemoteHeaders,
      };

      if (rawMatrix !== null || baseItems.length > 0 || !prevCached) {
        sheetMemoryCache.set(cacheKey, snapshotToStore);
      }
      if (rawMatrix !== null || baseItems.length > 0) {
        saveDiskSnapshotAsync(cacheKey, snapshotToStore);
      }

      // If remote sheet had data written into Row 1 without headers, auto-repair Row 1 with canonical headers and shift data to Row 2+
      if (!hasRemoteHeaders && rawRow0HasContent && baseItems.length > 0) {
        setImmediate(async () => {
          try {
            const accessToken = await getServiceAccountAccessToken();
            if (!accessToken) return;
            const sheetTitle = await resolveSheetTabTitle(extracted.spreadsheetId, extracted.gid);
            const rangePrefix = buildSheetRangePrefix(sheetTitle);
            const lastColLetter = columnIndexToLetter(headers.length - 1);
            const repairedRows = baseItems.map((it, idx) => {
              it._sheetRowNumber = idx + 2;
              return tabType === 'defibrillateurs'
                ? mapDefibToRow(headers, it)
                : tabType === 'autresMateriels'
                ? mapAutreMaterielToRow(headers, it)
                : tabType === 'clients'
                ? mapClientToRow(headers, it)
                : mapGenericRecordToRow(headers, it, tabType);
            });
            const allValues = [headers, ...repairedRows];
            const res = await fetchWithRetry(
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
                      range: `${rangePrefix}A1:${lastColLetter}${allValues.length}`,
                      values: allValues,
                    },
                  ],
                }),
                signal: AbortSignal.timeout(12000),
              },
              2
            );
            if (res.ok) {
              snapshotToStore.hasRemoteHeaders = true;
              saveDiskSnapshotAsync(cacheKey, snapshotToStore);
            }
          } catch (_) {}
        });
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
  let data = await fetchTenantSheetCollection(spreadsheetUrl, tenantId, tabType, Boolean(params.forceRefresh));
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

  const runFilterOnItems = (sourceItems: any[]): any[] => {
    return sourceItems.filter(df => {
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

      if (searchLower || advTerms.length > 0) {
        const rowValues: string[] = [];
        for (const [k, v] of Object.entries(df)) {
          if (k === 'envId' || k === 'tenantId' || k === '_sheetRowNumber' || v === undefined || v === null || v === '') continue;
          if (typeof v === 'string' || typeof v === 'number') {
            rowValues.push(String(v).toLowerCase());
          }
        }

        if (searchLower) {
          const matchesSearch = rowValues.some(val => val.includes(searchLower));
          if (!matchesSearch) return false;
        }

        if (advTerms.length > 0) {
          const matchesTerm = (term: string) => rowValues.some(val => val.includes(term));
          if (advOp === 'AND') {
            if (!advTerms.every(matchesTerm)) return false;
          } else {
            if (!advTerms.some(matchesTerm)) return false;
          }
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
  };

  let filtered = runFilterOnItems(data.items || []);

  // If a specific search term or advanced term yielded 0 results in cached memory, and cache is > 15s old,
  // automatically re-fetch live from the Google Spreadsheet in case the row was just added to the sheet!
  if (filtered.length === 0 && (searchLower.length >= 2 || advTerms.length > 0) && !params.forceRefresh) {
    const extracted = extractSpreadsheetIdAndGid(spreadsheetUrl);
    if (extracted) {
      const cacheKey = getSheetCacheKey(tabType, extracted.spreadsheetId, extracted.gid);
      const cached = sheetMemoryCache.get(cacheKey);
      if (!cached || Date.now() - cached.fetchedAt > 15000) {
        data = await fetchTenantSheetCollection(spreadsheetUrl, tenantId, tabType, true);
        filtered = runFilterOnItems(data.items || []);
      }
    }
  }

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
  const limit = Math.max(1, Math.min(100000, Number(params.limit) || 100000));
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
        const candidateHeaders = valueRanges[0].values[0].map((c: any) => String(c ?? '').trim());
        const nonEmpty = candidateHeaders.filter(Boolean);
        const looksLikeDataRow = nonEmpty.some((c: string) => c.startsWith('{"') && c.endsWith('}'));
        const hasValidMatch =
          !looksLikeDataRow &&
          nonEmpty.length > 0 &&
          (nonEmpty.some((c: string) => c.toLowerCase() === '_json') ||
            (tabType === 'defibrillateurs'
              ? buildColumnMatches(candidateHeaders, DEFIB_CANONICAL_HEADERS).length >= 2
              : tabType === 'autresMateriels'
              ? buildColumnMatches(candidateHeaders, AUTRES_CANONICAL_HEADERS).length >= 2
              : tabType === 'clients'
              ? buildColumnMatches(candidateHeaders, CLIENTS_CANONICAL_HEADERS).length >= 2
              : !GENERIC_CANONICAL_HEADERS[tabType] ||
                resolveGenericColumnFieldMap(candidateHeaders, tabType).size >= Math.min(2, GENERIC_CANONICAL_HEADERS[tabType]!.length)));
        if (hasValidMatch) {
          headers = candidateHeaders;
          hasRemoteHeaders = true;
        }
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
        const explicitRn = typeof records[recIdx]?._sheetRowNumber === 'number' && records[recIdx]._sheetRowNumber === rn;
        if (isSingletonTab || explicitRn || recKeys.length === 0 || mappedKeys.some(mk => recKeys.includes(mk))) {
          matchedByRecordIdx.set(recIdx, mapped);
        } else {
          anyMissingRowNum = true;
        }
      } else if (!isSingletonTab) {
        anyMissingRowNum = true;
      }
    }

    // Step 2: If any record lacked a verified _sheetRowNumber, scan identifier/serial columns A2:AZ50000 (~180ms)
    if (anyMissingRowNum && hasRemoteHeaders) {
      const idRange = encodeURIComponent(`${rangePrefix}A2:AZ50000`);
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
      hasRemoteHeaders = warmCached.hasRemoteHeaders === true;
      // Check if any record is missing from warmCached or if remote sheet had no headers yet
      const isSingletonCheck =
        tabType === 'reglages' ||
        tabType === 'apparenceRapportsPdf' ||
        tabType === 'communicationPortailClient' ||
        (tabType === 'intituleEmplacements' && records.length === 1 && !records[0]?.emplacement);
      const hasUnmatchedInWarmCache = records.some((rec, rIdx) => {
        if (!rec || typeof rec !== 'object') return false;
        const candidateRn =
          (typeof rec._sheetRowNumber === 'number' && rec._sheetRowNumber >= 2 ? rec._sheetRowNumber : undefined) ||
          extractRowNumFromSyntheticId(rec.id) ||
          extractRowNumFromSyntheticId(rec.identifiant) ||
          (isSingletonCheck && rIdx === 0 ? 2 : undefined);
        if (candidateRn && warmCached.items.some(b => b && b._sheetRowNumber === candidateRn)) return false;
        const recKeys = getRecordLookupKeys(rec, tabType);
        if (warmCached.items.some(b => b && getRecordLookupKeys(b, tabType).some(bk => recKeys.includes(bk)))) return false;
        return true;
      });
      if ((hasUnmatchedInWarmCache || !hasRemoteHeaders) && accessToken) {
        const lightCtx = await fetchLightweightSheetContextForColdUpsert(
          extracted.spreadsheetId,
          extracted.gid,
          tabType,
          tenantId,
          records,
          accessToken
        );
        hasRemoteHeaders = lightCtx.hasRemoteHeaders;
        if (lightCtx.hasRemoteHeaders && lightCtx.headers.length > 0) {
          headers = lightCtx.headers;
        }
        coldMatchedByRecordIdx = lightCtx.matchedByRecordIdx;
      }
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
    // If intituleEmplacements is passed as a single config object but the target sheet uses the 2-column vertical format (Emplacement | Intitulé), expand into 20 rows
    let effectiveRecords = records;
    if (
      tabType === 'intituleEmplacements' &&
      records.length === 1 &&
      !records[0]?.emplacement &&
      headers.some(h => normalizeHeaderKey(h).includes('emplacement')) &&
      !headers.some(h => normalizeHeaderKey(h).includes('entrepota'))
    ) {
      const ALL_LOCS = [
        'Entrepôt A', 'Entrepôt B', 'Entrepôt C', 'Entrepôt D', 'Entrepôt E',
        'Entrepôt F', 'Entrepôt G', 'Entrepôt H', 'Entrepôt I', 'Entrepôt J',
        'Véhicule A', 'Véhicule B', 'Véhicule C', 'Véhicule D', 'Véhicule E',
        'Véhicule F', 'Véhicule G', 'Véhicule H', 'Véhicule I', 'Véhicule J',
      ];
      const srcObj = records[0] || {};
      effectiveRecords = ALL_LOCS.map((loc, idx) => ({
        id: loc,
        emplacement: loc,
        intitule: String(srcObj[loc] ?? ''),
        _sheetRowNumber: idx + 2,
      }));
    }

    const isSingletonTab =
      tabType === 'reglages' ||
      tabType === 'apparenceRapportsPdf' ||
      tabType === 'communicationPortailClient' ||
      (tabType === 'intituleEmplacements' && effectiveRecords.length === 1 && !effectiveRecords[0]?.emplacement);

    for (let rIdx = 0; rIdx < effectiveRecords.length; rIdx++) {
      const rec = effectiveRecords[rIdx];
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
        } else if (coldMatchedByRecordIdx.has(rIdx)) {
          existingItem = coldMatchedByRecordIdx.get(rIdx);
          if (existingItem?._sheetRowNumber) {
            existingIdx = updatedItemsList.findIndex(b => b && b._sheetRowNumber === existingItem._sheetRowNumber);
          }
        }
      } else {
        existingItem = coldMatchedByRecordIdx.get(rIdx);
      }

      const resolvedRowNum =
        (typeof rec._sheetRowNumber === 'number' && rec._sheetRowNumber >= 2 ? rec._sheetRowNumber : undefined) ||
        existingItem?._sheetRowNumber ||
        extractRowNumFromSyntheticId(rec.id) ||
        extractRowNumFromSyntheticId(rec.identifiant) ||
        (isSingletonTab && rIdx === 0 ? 2 : undefined);

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

        // If remote sheet was blank or lacked a valid header row in Row 1, write the canonical header row to Row 1 first
        if (!hasRemoteHeaders) {
          const headerRes = await fetchWithRetry(
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
          ).catch(() => null);
          if (headerRes && headerRes.ok) {
            hasRemoteHeaders = true;
            if (warmCached) warmCached.hasRemoteHeaders = true;
          }
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
      try {
        warmCached.stats = computeSheetCollectionStats(warmCached.items, tabType);
      } catch (_) {}
      setImmediate(() => {
        try {
          saveDiskSnapshotAsync(cacheKey, warmCached);
        } catch (_) {}
      });
    } else {
      // Warm full sheet cache in background from live sheet without blocking the response
      setImmediate(() => {
        fetchTenantSheetCollection(spreadsheetUrl, tenantId, tabType, true).catch(() => {});
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

    // Also parse explicit row numbers from any synthetic sheet_df_ / sheet_am_ / sheet_cli_ / sheet_gen_ keys or row:N targets
    for (const tk of targetKeys) {
      if (!tk) continue;
      const trimmedTk = String(tk).trim();
      const rowDirect = trimmedTk.match(/^row:(\d+)$/i);
      if (rowDirect && rowDirect[1]) {
        const rn = parseInt(rowDirect[1], 10);
        if (!isNaN(rn) && rn >= 2) {
          rowNumbersToClearSet.add(rn);
        }
        continue;
      }
      const m = trimmedTk.match(/^sheet_(?:df|am|cli|gen_[a-z0-9]+)_[^_]+_(\d+)$/i);
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
      const isUpRowTargeted = (upVal as any)?._sheetRowNumber && rowNumbersToClearSet.has((upVal as any)._sheetRowNumber);
      if (isUpRowTargeted || normTargets.has(upKey.toLowerCase()) || uKeys.some(k => normTargets.has(k))) {
        delete overlay.upsertedById[upKey];
      }
    }

    const recentMap = recentSheetUpserts.get(cacheKey);
    if (recentMap && recentMap.size > 0) {
      for (const [rk, entry] of recentMap.entries()) {
        if (!entry || !entry.item) continue;
        const rKeys = getRecordLookupKeys(entry.item, tabType);
        const isRecRowTargeted = entry.item._sheetRowNumber && rowNumbersToClearSet.has(entry.item._sheetRowNumber);
        if (isRecRowTargeted || normTargets.has(rk.toLowerCase()) || rKeys.some(k => normTargets.has(k))) {
          recentMap.delete(rk);
        }
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
