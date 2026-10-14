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
  { header: 'Identifiant', field: 'identifiant', aliases: ['identifiant', 'id', 'identifiantdae', 'code', 'identifiantunique', 'identificationidentifiant'] },
  { header: 'Numéro Atlasanté', field: 'numeroAtlasante', aliases: ['numeroatlasante', 'atlasante', 'idatlasante', 'geodae', 'identificationnumeroatlasante'] },
  { header: 'Version logiciel', field: 'versionLogiciel', aliases: ['versionlogiciel', 'firmware', 'version', 'identificationversionlogiciel'] },
  { header: 'Numéro de série', field: 'numeroSerie', aliases: ['numerodeserie', 'numeroserie', 'numserie', 'serie', 'sn', 'serial', 'identificationserie', 'identificationnumerodeserie'] },
  { header: 'Commentaire', field: 'commentaire', aliases: ['commentaire', 'commentairedae', 'notes', 'note', 'observation', 'identificationcommentaire'] },
  { header: 'Modèle', field: 'modeleId', aliases: ['modele', 'modeledae', 'modeledefibrillateur', 'modeleid', 'model', 'identificationmodele', 'identificationmodeleidentifiantunique', 'modeleidentifiantunique'] },

  { header: 'Client lié', field: 'clientNom', aliases: ['clientlie', 'client', 'clientnom', 'entreprise', 'denominationclient', 'clientclient', 'clientclientidentifiantunique', 'clientidentifiantunique'] },
  { header: 'Nom du site', field: 'nomSite', aliases: ['nomdusite', 'nomsite', 'site', 'etablissement', 'clientsite', 'clientnomdusite'] },
  { header: "Catégorie d'établissement", field: 'categorieEtablissement', aliases: ['categoriedetablissement', 'categorieetablissement', 'typeetablissement', 'clientcategorieetablissement'] },
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
  { header: 'Numéro de lot coffret', field: 'numeroLotCoffret', aliases: ['numerodelotcoffret', 'numerolotcoffret', 'lotcoffret', 'boitierlot'] },
  { header: 'Commentaire coffret', field: 'commentaireCoffret', aliases: ['commentairecoffret', 'notecoffret', 'boitiercommentaire'] },
  { header: 'Date péremption trousse', field: 'peremptionTrousse', aliases: ['dateperemptiontrousse', 'peremptiontrousse', 'peremptionkit', 'dateperemptionkit', 'boitierperemptiontrousse'], type: 'date' },
  { header: 'Ciseaux présents', field: 'kitCiseauxPresents', aliases: ['ciseauxpresents', 'kitciseauxpresents', 'ciseaux'], type: 'yesno' },
  { header: 'Masque présent', field: 'kitMasquePresent', aliases: ['masquepresent', 'kitmasquepresent', 'masque'], type: 'yesno' },
  { header: 'Péremption masque', field: 'kitPeremptionMasque', aliases: ['peremptionmasque', 'kitperemptionmasque', 'dateperemptionmasque'], type: 'date' },
  { header: 'Serviettes présentes', field: 'kitServiettesPresentes', aliases: ['serviettespresentes', 'kitserviettespresentes', 'serviettes'], type: 'yesno' },
  { header: 'Péremption serviettes', field: 'kitPeremptionServiettes', aliases: ['peremptionserviettes', 'kitperemptionserviettes', 'dateperemptionserviettes'], type: 'date' },
  { header: 'Gants présents', field: 'kitGantsPresents', aliases: ['gantspresents', 'kitgantspresents', 'gants'], type: 'yesno' },
  { header: 'Rasoir présent', field: 'kitRasoirPresent', aliases: ['rasoirpresent', 'kitrasoirpresent', 'rasoir'], type: 'yesno' },

  { header: 'Numéro et voie', field: 'numVoie', aliases: ['numeroetvoie', 'numvoie', 'adresse', 'rue', 'voie', 'localisationnumeroetvoie', 'localisationrue'] },
  { header: 'Ville', field: 'ville', aliases: ['ville', 'commune', 'localite', 'city', 'localisationville'] },
  { header: 'Code postal', field: 'cp', aliases: ['codepostal', 'cp', 'zip', 'postalcode', 'localisationcodepostal'] },
  { header: 'Région', field: 'region', aliases: ['region', 'departementregion', 'localisationregion'] },
  { header: 'Pays', field: 'pays', aliases: ['pays', 'country', 'localisationpays'] },
  { header: 'Latitude', field: 'latitude', aliases: ['latitude', 'lat', 'coordlat', 'localisationlatitude'] },
  { header: 'Longitude', field: 'longitude', aliases: ['longitude', 'lng', 'lon', 'long', 'coordlng', 'localisationlongitude'] },
  { header: "Aide à l'accès", field: 'commentaireAdresse', aliases: ['aidealacces', 'aideacces', 'aidedacces', 'commentaireadresse', 'emplacement', 'localisationprecise', 'localisationaidedacces', 'localisation'] },
  { header: 'Accès 24/7', field: 'acces247', aliases: ['acces247', 'acces24h24', '247', 'localisationacces247'], type: 'bool' },
  { header: 'Accès semaine', field: 'accesSemaine', aliases: ['accessemaine', 'semaine', 'localisationaccessemaine'], type: 'bool' },
  { header: 'Accès week-end', field: 'accesWeekend', aliases: ['accesweekend', 'weekend', 'localisationaccesweekend'], type: 'bool' },
  { header: 'Extérieur', field: 'exterieur', aliases: ['exterieur', 'ext', 'localisationexterieur'], type: 'bool' },
  { header: "Horaires d'ouverture", field: 'horaires', aliases: ['horairesdouverture', 'horaires', 'heuresouverture', 'localisationhoraires'] },

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
  { header: 'Situation électrode A', field: 'situationElectrodeA', aliases: ['situationelectrodea', 'situationa', 'etatelectrodea', 'electrodeadulteoumixtestatut', 'statutelectrodea'] },
  { header: 'Commentaire électrode A', field: 'commentaireElectrodeA', aliases: ['commentaireelectrodea', 'commentairea', 'noteelectrodea', 'electrodeadulteoumixtecommentaire'] },
  { header: 'Électrode secours A', field: 'hasElectrodeASecours', aliases: ['electrodesecoursa', 'haselectrodeasecours', 'secoursa'], type: 'yesno' },
  { header: 'Modèle secours A', field: 'modeleElectrodeASecoursId', aliases: ['modelesecoursa', 'modeleelectrodeasecours', 'modeleelectrodeasecoursid', 'electrodeadulteoumixtemodeledelectrodedesecours', 'modeledelectrodedesecours'] },
  { header: 'Lot secours A', field: 'lotElectrodeASecours', aliases: ['lotsecoursa', 'lotelectrodeasecours', 'electrodeadulteoumixtelotdelelectrodedesecours', 'lotdelelectrodedesecours'] },
  { header: 'Péremption secours A', field: 'peremptionSecoursElectrodeA', aliases: ['peremptionsecoursa', 'peremptionsecourselectrodea', 'dateperemptionsecoursa', 'electrodeadulteoumixteperemptiondelelectrodedesecours', 'peremptiondelelectrodedesecours'], type: 'date' },
  { header: 'Pad-Pak Adulte', field: 'hasPadpakA', aliases: ['padpakadulte', 'haspadpaka', 'padpaka'], type: 'yesno' },
  { header: 'Lot Pad-Pak A', field: 'lotPadpakA', aliases: ['lotpadpaka', 'lotpadpakadulte', 'electrodeadulteoumixtelotpadpaka'] },
  { header: 'Péremption Pad-Pak A', field: 'peremptionPadpakA', aliases: ['peremptionpadpaka', 'peremptionpadpakadulte', 'dateperemptionpadpaka', 'electrodeadulteoumixteperemptionpadpaka'], type: 'date' },

  { header: 'Modèle électrode P', field: 'modeleElectrodePId', aliases: ['modeleelectrodep', 'modelep', 'electrodepModele', 'modeleelectrodepid', 'electrodepediatriquemodele'] },
  { header: 'Lot électrode P', field: 'lotElectrodeP', aliases: ['lotelectrodep', 'lotp', 'electrodeplot', 'electrodepediatriquelot'] },
  { header: 'Insertion électrode P', field: 'insertionElectrodeP', aliases: ['insertionelectrodep', 'insertionp', 'dateinsertionelectrodep', 'electrodepediatriqueinsertion'], type: 'date' },
  { header: 'Péremption électrode P', field: 'peremptionElectrodeP', aliases: ['peremptionelectrodep', 'peremptionp', 'dateperemptionelectrodep', 'dateperemptionp', 'electrodepediatriqueperemption'], type: 'date' },
  { header: 'Livraison électrode P', field: 'livraisonElectrodeP', aliases: ['livraisonelectrodep', 'livraisonp', 'datelivraisonelectrodep', 'electrodepediatriquelivraison'], type: 'date' },
  { header: 'Situation électrode P', field: 'situationElectrodeP', aliases: ['situationelectrodep', 'situationp', 'etatelectrodep', 'electrodepediatriquestatut', 'statutelectrodep'] },
  { header: 'Commentaire électrode P', field: 'commentaireElectrodeP', aliases: ['commentaireelectrodep', 'commentairep', 'noteelectrodep', 'electrodepediatriquecommentaire'] },
  { header: 'Électrode secours P', field: 'hasElectrodePSecours', aliases: ['electrodesecoursp', 'haselectrodepsecours', 'secoursp'], type: 'yesno' },
  { header: 'Modèle secours P', field: 'modeleElectrodePSecoursId', aliases: ['modelesecoursp', 'modeleelectrodepsecours', 'modeleelectrodepsecoursid', 'electrodepediatriquemodeledelectrodedesecours'] },
  { header: 'Lot secours P', field: 'lotElectrodePSecours', aliases: ['lotsecoursp', 'lotelectrodepsecours', 'electrodepediatriquelotdelelectrodedesecours'] },
  { header: 'Péremption secours P', field: 'peremptionSecoursElectrodeP', aliases: ['peremptionsecoursp', 'peremptionsecourselectrodep', 'dateperemptionsecoursp', 'electrodepediatriqueperemptiondelelectrodedesecours'], type: 'date' },
  { header: 'Pad-Pak Pédiatrique', field: 'hasPadpakP', aliases: ['padpakpediatrique', 'haspadpakp', 'padpakp'], type: 'yesno' },
  { header: 'Lot Pad-Pak P', field: 'lotPadpakP', aliases: ['lotpadpakp', 'lotpadpakpediatrique', 'electrodepediatriquelotpadpakp'] },
  { header: 'Péremption Pad-Pak P', field: 'peremptionPadpakP', aliases: ['peremptionpadpakp', 'peremptionpadpakpediatrique', 'dateperemptionpadpakp', 'electrodepediatriqueperemptionpadpakp'], type: 'date' },

  { header: 'Modèle batterie B', field: 'modeleBatterieId', aliases: ['modelebatterieb', 'modelebatterie', 'modeleb', 'batteriemodele', 'modelebatterieid'] },
  { header: 'Lot batterie B', field: 'lotBatterie', aliases: ['lotbatterieb', 'lotbatterie', 'lotb', 'batterielot'] },
  { header: 'Insertion batterie B', field: 'insertionBatterie', aliases: ['insertionbatterieb', 'insertionbatterie', 'insertionb', 'dateinsertionbatterie', 'batterieinsertion'], type: 'date' },
  { header: 'Fabrication batterie B', field: 'fabricationBatterie', aliases: ['fabricationbatterieb', 'fabricationbatterie', 'fabricationb', 'datefabricationbatterie', 'batteriefabrication'], type: 'date' },
  { header: 'Péremption batterie B', field: 'peremptionBatterie', aliases: ['peremptionbatterieb', 'peremptionbatterie', 'peremptionb', 'dateperemptionbatterie', 'dateperemptionb', 'batterieperemption'], type: 'date' },
  { header: 'Livraison batterie B', field: 'livraisonBatterie', aliases: ['livraisonbatterieb', 'livraisonbatterie', 'livraisonb', 'datelivraisonbatterie', 'batterielivraison'], type: 'date' },
  { header: 'Situation batterie B', field: 'situationBatterie', aliases: ['situationbatterieb', 'situationbatterie', 'situationb', 'etatbatterie', 'batteriestatut', 'statutbatterie'] },
  { header: 'Pourcentage batterie B', field: 'pourcentageBatterie', aliases: ['pourcentagebatterieb', 'pourcentagebatterie', 'pourcentageb', 'pourcentageconstateb', 'batteriepourcentage', 'batteriepourcentageconstate', 'pourcentageconstate'] },
  { header: 'Commentaire batterie B', field: 'commentaireBatterie', aliases: ['commentairebatterieb', 'commentairebatterie', 'commentaireb', 'notebatterie', 'batteriecommentaire'] },
  { header: 'Batterie secours B', field: 'hasBatterieSecours', aliases: ['batteriesecoursb', 'hasbatteriesecours', 'secoursb', 'batteriesecours'], type: 'yesno' },
  { header: 'Modèle secours B', field: 'modeleBatterieSecoursId', aliases: ['modelesecoursb', 'modelebatteriesecours', 'modelebatteriesecoursid', 'batteriemodelesecours'] },
  { header: 'Lot secours B', field: 'lotBatterieSecours', aliases: ['lotsecoursb', 'lotbatteriesecours', 'batterielotsecours'] },
  { header: 'Péremption secours B', field: 'peremptionBatterieSecours', aliases: ['peremptionsecoursb', 'peremptionbatteriesecours', 'dateperemptionsecoursb', 'batterieperemptionsecours'], type: 'date' },

  { header: 'Tournée', field: 'tournee', aliases: ['tournee', 'secteur', 'categoriestournee'] },
  { header: 'Loué', field: 'loue', aliases: ['loue', 'location', 'enlocation', 'categoriesloue'], type: 'yesno' },
  { header: 'Prêté', field: 'prete', aliases: ['prete', 'pret', 'enpret', 'categoriesprete'], type: 'yesno' },
  { header: 'Stocké', field: 'stocke', aliases: ['stocke', 'enstock', 'categoriesstocke'], type: 'yesno' },
  { header: 'Archivé', field: 'archive', aliases: ['archive', 'inactif', 'categoriesarchive'], type: 'yesno' },
  { header: 'Conforme', field: 'conforme', aliases: ['conforme', 'conformite', 'categoriesconforme'], type: 'yesno' },
  { header: 'Sous-traitance', field: 'sousTraitance', aliases: ['soustraitance', 'soustraitant', 'opereensoustraitance', 'categoriesopereensoustraitance', 'categoriessoustraitance'], type: 'yesno' },
  { header: 'Maintenance autorisée', field: 'fsmAutorise', aliases: ['maintenanceautorisee', 'fsmautorise', 'maintenance', 'autorisationmaintenance', 'categoriesmaintenanceautorisee'], type: 'yesno' },
  { header: 'Victime avec survie', field: 'victimeSurvie', aliases: ['victimeavecsurvie', 'victimesurvie', 'categoriesvictimeavecsurvie'], type: 'yesno' },
  { header: 'Victime sans survie', field: 'victimeSansSurvie', aliases: ['victimesanssurvie', 'categoriesvictimesanssurvie'], type: 'yesno' },
  { header: 'Âge victime', field: 'ageVictime', aliases: ['agevictime', 'age', 'categoriesagevictime'] },
  { header: 'Commentaire campagne rappel', field: 'commentaireCampagneRappel', aliases: ['commentairecampagnerappel', 'campagnerappel'] },
  { header: 'Rappel mensuel auto', field: 'rappelMensuelAuto', aliases: ['rappelmensuelauto', 'rappelmensuel'], type: 'yesno' },
  { header: 'Rappel hebdo auto', field: 'rappelHebdoAuto', aliases: ['rappelhebdoauto', 'rappelhebdo', 'rappelhebdomadaire'], type: 'yesno' },
  { header: 'Rappel journalier auto', field: 'rappelJournalierAuto', aliases: ['rappeljournalierauto', 'rappeljournalier'], type: 'yesno' },
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
  { header: "Aide à l'accès", field: 'aideAcces', aliases: ['aidealacces', 'aideacces', 'aidedacces', 'commentaireadresse', 'emplacement', 'localisationaidedacces', 'localisation'] },
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
  { header: 'Rappel mensuel auto', field: 'rappelMensuelAuto', aliases: ['rappelmensuelauto'], type: 'yesno' },
  { header: 'Rappel hebdo auto', field: 'rappelHebdoAuto', aliases: ['rappelhebdoauto'], type: 'yesno' },
  { header: 'Rappel journalier auto', field: 'rappelJournalierAuto', aliases: ['rappeljournalierauto'], type: 'yesno' },

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
  { header: 'Contrat', field: 'contrat', aliases: ['contrat', 'aveccontrat', 'souscontrat', 'contratactif', 'contratencours'], type: 'yesno' },
  { header: 'Nom du contrat', field: 'nomContrat', aliases: ['nomducontrat', 'nomcontrat', 'typecontrat', 'titreducontrat'] },
  { header: 'Référence contrat', field: 'referenceContrat', aliases: ['referencecontrat', 'refcontrat', 'numerocontrat', 'referenceducontrat'] },
  { header: 'Début du contrat', field: 'debutContrat', aliases: ['debutducontrat', 'debutcontrat', 'datedebutcontrat'], type: 'date' },
  { header: 'Fin du contrat', field: 'finContrat', aliases: ['finducontrat', 'fincontrat', 'datefincontrat', 'expirationducontrat'], type: 'date' },
  { header: 'Payeur ID', field: 'payeurId', aliases: ['payeurid', 'idpayeur', 'codepayeur'] },
  { header: 'Client ID', field: 'clientIdField', aliases: ['clientid', 'idclient', 'codeclient', 'clientidfield'] },
  { header: 'Code PIN Signature', field: 'signaturePin', aliases: ['codepinsignature', 'signaturepin', 'pin', 'codepin', 'cledacces', 'accesskey'] },
  { header: 'Accès Portail Client', field: 'accesPortail', aliases: ['accesportailclient', 'accesportail', 'portailclient'], type: 'yesno' },
  { header: 'Identifiant Portail', field: 'identifiantPortail', aliases: ['identifiantportail', 'loginportail'] },
  { header: 'Mot de passe Portail', field: 'motDePassePortail', aliases: ['motdepasseportail', 'passwordportail'] },
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
  if (obj.modeleBatterieSecoursId || obj.lotBatterieSecours || obj.peremptionBatterieSecours) {
    obj.hasBatterieSecours = 'Oui';
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

  for (const def of DEFIB_CANONICAL_HEADERS) {
    for (let i = 0; i < normHeaders.length; i++) {
      if (!def.aliases.includes(normHeaders[i])) continue;
      let val = defib[def.field];

      // Prefer human-readable model names over internal v_... variable IDs when writing to Google Sheets
      if (def.field === 'modeleId' && defib.modele && !String(defib.modele).startsWith('v_')) {
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
    for (let i = 0; i < normHeaders.length; i++) {
      if (!def.aliases.includes(normHeaders[i])) continue;
      let val = def.isSpecifique ? item.specifiques?.[def.field] : item[def.field];
      if (def.field === 'identifiant' && !val && item.id) {
        val = item.id;
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

  const cleanClientId = String(obj.clientIdField || '').trim();
  const cleanSiret = String(obj.siret || '').trim();
  const cleanDenom = String(obj.denomination || '').trim();
  obj.id = cleanClientId || cleanSiret || (cleanDenom ? `cli_${cleanDenom.toLowerCase().replace(/[^a-z0-9]/g, '_')}` : `sheet_cli_${tenantId}_${rowIndex + 2}`);
  if (!obj.clientIdField) obj.clientIdField = obj.id;
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
      if (def.field === 'clientIdField' && !val && client.id) {
        val = client.id;
      }
      if (val !== undefined && val !== null) {
        outRow[i] = String(val);
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
  if (tabType === 'autresMateriels') {
    return [item.id, item.identifiant, item.numeroSerie, item.specifiques?.numSerie, item.denomination]
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
  Promise<{ items: any[]; headers: string[]; totalCount: number; fromSpreadsheet: boolean; hasRemoteHeaders?: boolean }>
>();

async function fetchRawSheetMatrix(spreadsheetUrl: string): Promise<{ headers: string[]; rows: string[][] } | null> {
  const extracted = extractSpreadsheetIdAndGid(spreadsheetUrl);
  if (!extracted) return null;
  const { spreadsheetId, gid } = extracted;
  const cfg = getGlobalGoogleConfig();

  // Strategy 1: Google Sheets API v4 (Service Account first, then API Key fallback)
  const accessToken = await getServiceAccountAccessToken();
  const sheetTitle = await resolveSheetTabTitle(spreadsheetId, gid);
  const rangeStr = sheetTitle ? `'${sheetTitle.replace(/'/g, "''")}'` : 'A1:ZZ50000';
  const targetRange = encodeURIComponent(rangeStr);

  if (accessToken) {
    try {
      const apiRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${targetRange}`,
        { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(45000) }
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
      const apiRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${targetRange}?key=${encodeURIComponent(cfg.apiKey)}`,
        { signal: AbortSignal.timeout(45000) }
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

export async function fetchTenantSheetCollection(
  spreadsheetUrl: string,
  tenantId: string,
  tabType: SheetTabType,
  forceRefresh = false
): Promise<{ items: any[]; headers: string[]; totalCount: number; fromSpreadsheet: boolean; hasRemoteHeaders?: boolean }> {
  const extracted = extractSpreadsheetIdAndGid(spreadsheetUrl);
  if (!extracted) {
    return { items: [], headers: [], totalCount: 0, fromSpreadsheet: false, hasRemoteHeaders: false };
  }

  const cacheKey = `${tenantId}_${tabType}_${extracted.spreadsheetId}_${extracted.gid || '0'}`;
  if (!forceRefresh && sheetMemoryCache.has(cacheKey)) {
    const cached = sheetMemoryCache.get(cacheKey)!;
    if (Date.now() - cached.fetchedAt < 60000) {
      return {
        items: cached.items,
        headers: cached.headers,
        totalCount: cached.items.length,
        fromSpreadsheet: true,
        hasRemoteHeaders: cached.headers.length > 0,
      };
    }
  }

  if (inFlightSheetFetches.has(cacheKey)) {
    return inFlightSheetFetches.get(cacheKey)!;
  }

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
          : CLIENTS_CANONICAL_HEADERS.map(d => d.header);

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
          : CLIENTS_CANONICAL_HEADERS;
      const precomputedMatches = buildColumnMatches(headers, canonicalDefs);

      if (rawMatrix && Array.isArray(rawMatrix.rows)) {
        for (let i = 0; i < rawMatrix.rows.length; i++) {
          const r = rawMatrix.rows[i];
          if (!r || r.every(c => !c || String(c).trim() === '')) continue;

          const mapped =
            tabType === 'defibrillateurs'
              ? mapRowToDefib(headers, r, i, tenantId, precomputedMatches)
              : tabType === 'autresMateriels'
              ? mapRowToAutreMateriel(headers, r, i, tenantId, precomputedMatches)
              : mapRowToClient(headers, r, i, tenantId, precomputedMatches);

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
            baseItems[existingIdx] = {
              ...baseItems[existingIdx],
              ...cleanUp,
              _sheetRowNumber: baseItems[existingIdx]._sheetRowNumber || upItem._sheetRowNumber,
            };
          } else {
            const { _rawSheetRow: _ignoreRaw, ...cleanUp } = upItem;
            baseItems.push(cleanUp);
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
        hasRemoteHeaders,
      };
    } finally {
      inFlightSheetFetches.delete(cacheKey);
    }
  })();

  inFlightSheetFetches.set(cacheKey, fetchPromise);
  return fetchPromise;
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
): Promise<{ success: boolean; count: number; syncedToRemoteSheet: boolean; records?: any[]; remoteError?: string }> {
  const extracted = extractSpreadsheetIdAndGid(spreadsheetUrl);
  if (!extracted || !Array.isArray(records) || records.length === 0) {
    return { success: false, count: 0, syncedToRemoteSheet: false };
  }

  return withSheetWriteLock(extracted.spreadsheetId, async () => {
    // Always forceRefresh=true before writing so we never miss a row that was just appended
    const currentData = await fetchTenantSheetCollection(spreadsheetUrl, tenantId, tabType, true);
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
    const rowsToUpdateRemote: Array<{ rowNumber: number; values: string[]; key: string }> = [];
    const rowsToAppendRemote: Array<{ values: string[]; key: string; itemRef: any }> = [];
    const upsertedList: any[] = [];
    const processedPrimaryKeys = new Set<string>();

    for (const rec of records) {
      if (!rec || typeof rec !== 'object') continue;
      const recKeys = getRecordLookupKeys(rec, tabType);
      const primaryKey = recKeys[0] || `item_${Date.now()}_${Math.random()}`;
      if (processedPrimaryKeys.has(primaryKey)) continue;
      processedPrimaryKeys.add(primaryKey);

      recKeys.forEach(k => deletedSet.delete(k));

      // Find if record already exists in currentData.items (by rowNumber first, then by lookup keys)
      const existingItem = currentData.items.find(b => {
        if (rec._sheetRowNumber && b._sheetRowNumber && rec._sheetRowNumber === b._sheetRowNumber) {
          return true;
        }
        const bKeys = getRecordLookupKeys(b, tabType);
        return bKeys.some(bk => recKeys.includes(bk));
      });

      const mergedItem = existingItem
        ? {
            ...existingItem,
            ...rec,
            _sheetRowNumber: rec._sheetRowNumber || existingItem._sheetRowNumber,
            _rawSheetRow: {
              ...(existingItem._rawSheetRow || {}),
              ...(rec._rawSheetRow || {}),
            },
          }
        : { ...rec };

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
          : mapClientToRow(headers, mergedItem);

      const rawByHeader: Record<string, string> = {};
      headers.forEach((h, i) => {
        rawByHeader[h] = rowValues[i] ?? '';
      });
      mergedItem._rawSheetRow = rawByHeader;

      // If user changed identifier on an existing row, remove old overlay entry so no duplicate ghost stays
      if (existingItem) {
        const oldKeys = getRecordLookupKeys(existingItem, tabType);
        for (const ok of oldKeys) {
          if (ok !== primaryKey && overlay.upsertedById[ok]) {
            delete overlay.upsertedById[ok];
          }
        }
      }

      upsertedList.push(mergedItem);

      if (mergedItem._sheetRowNumber && typeof mergedItem._sheetRowNumber === 'number' && mergedItem._sheetRowNumber >= 2) {
        rowsToUpdateRemote.push({ rowNumber: mergedItem._sheetRowNumber, values: rowValues, key: primaryKey });
      } else {
        rowsToAppendRemote.push({ values: rowValues, key: primaryKey, itemRef: mergedItem });
      }
    }

    // Invalidate memory cache so next read immediately reflects updated items
    const cacheKey = `${tenantId}_${tabType}_${extracted.spreadsheetId}_${extracted.gid || '0'}`;
    sheetMemoryCache.delete(cacheKey);

    // Push to live Google Sheet via Service Account or Apps Script Bridge
    let syncedToRemoteSheet = false;
    let remoteError = '';
    const accessToken = await getServiceAccountAccessToken();
    const cfg = getGlobalGoogleConfig();

    if (accessToken) {
      try {
        const sheetTitle = await resolveSheetTabTitle(extracted.spreadsheetId, extracted.gid);
        const rangePrefix = buildSheetRangePrefix(sheetTitle);
        const lastColLetter = columnIndexToLetter(headers.length - 1);

        // If remote sheet was completely blank (no header row), write the canonical header row first
        if (!currentData.hasRemoteHeaders && currentData.items.length === 0) {
          await fetch(
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
            }
          ).catch(() => {});
        }

        if (rowsToUpdateRemote.length > 0) {
          const dataPayload = rowsToUpdateRemote.map(u => ({
            range: `${rangePrefix}A${u.rowNumber}:${lastColLetter}${u.rowNumber}`,
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
          const appendRes = await fetch(
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
            }
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
            appends: rowsToAppendRemote.map(r => ({ values: r.values, key: r.key })),
          }),
          redirect: 'follow',
        });
        if (bridgeRes.ok) {
          syncedToRemoteSheet = true;
          remoteError = '';
        }
      } catch (err) {
        console.warn('[GoogleSheetsEngine] Apps Script Bridge write warning:', err);
      }
    }

    // If synced directly to the remote Google Sheet, remove any stale local overlay entries for these records
    // so fetchTenantSheetCollection never merges a duplicate copy on top of the live Google Sheet rows.
    if (syncedToRemoteSheet) {
      for (const item of upsertedList) {
        const itemKeys = getRecordLookupKeys(item, tabType);
        for (const k of itemKeys) {
          delete overlay.upsertedById[k];
        }
      }
      // Also clear any existing overlay entries that are now present in the live sheet
      overlay.upsertedById = {};
    } else {
      for (const item of upsertedList) {
        const itemKeys = getRecordLookupKeys(item, tabType);
        const pk = itemKeys[0] || `item_${Date.now()}`;
        overlay.upsertedById[pk] = item;
      }
    }

    overlay.deletedIds = Array.from(deletedSet);
    overlay.lastSyncedAt = Date.now();
    saveMirrorOverlay(tenantId, tabType, extracted.spreadsheetId, overlay);
    sheetMemoryCache.delete(cacheKey);

    return {
      success: true,
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
    const currentData = await fetchTenantSheetCollection(spreadsheetUrl, tenantId, tabType, true);
    const overlay = loadMirrorOverlay(tenantId, tabType, extracted.spreadsheetId);
    const normTargets = new Set(targetKeys.filter(Boolean).map(k => String(k).trim().toLowerCase()));

    const rowNumbersToClearSet = new Set<number>();

    // Also parse explicit row numbers from any synthetic sheet_df_ / sheet_am_ / sheet_cli_ keys
    for (const tk of targetKeys) {
      if (!tk) continue;
      const m = String(tk).trim().match(/^sheet_(?:df|am|cli)_[^_]+_(\d+)$/i);
      if (m && m[1]) {
        const rn = parseInt(m[1], 10);
        if (!isNaN(rn) && rn >= 2) {
          rowNumbersToClearSet.add(rn);
        }
      }
    }

    for (const item of currentData.items) {
      const iKeys = getRecordLookupKeys(item, tabType);
      if (iKeys.some(k => normTargets.has(k))) {
        if (item._sheetRowNumber && typeof item._sheetRowNumber === 'number' && item._sheetRowNumber >= 2) {
          rowNumbersToClearSet.add(item._sheetRowNumber);
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
          if (delDimRes.ok) syncedToRemoteSheet = true;
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

    sheetMemoryCache.delete(cacheKey);
    return { success: true, deletedCount: normTargets.size, syncedToRemoteSheet };
  });
}
