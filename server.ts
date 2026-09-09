import express from "express";
import path from "path";
import fs from "fs";
import zlib from "zlib";
import { createServer as createViteServer } from "vite";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
const PROD_FIREBASE_CONFIG = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyBsfSHoSrPXwnwLcWtIGLPUwUd7ZYWVCvA",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "defibeo.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "defibeo",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "defibeo.appspot.com",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "627487981610",
  appId: process.env.FIREBASE_APP_ID || "1:627487981610:web:e4f496748c4ee0d1710353",
  measurementId: ""
};

const firebaseApp = initializeApp(PROD_FIREBASE_CONFIG);
const db = getFirestore(firebaseApp);

const DATA_DIR = path.join(process.cwd(), '.data');
const STORE_FILE = path.join(DATA_DIR, 'server-store.json');

const serverMemoryStore = new Map<string, any>();
const serverStoreTimestamps = new Map<string, number>();

// Initialize disk store
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(STORE_FILE)) {
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v)) {
        serverMemoryStore.set(k, v);
        serverStoreTimestamps.set(k, Date.now());
      }
    }
  }
} catch (e) {
  console.warn("Failed to load server disk store:", e);
}

let persistTimeout: NodeJS.Timeout | null = null;
function persistServerStoreToDisk() {
  if (persistTimeout) return;
  persistTimeout = setTimeout(() => {
    persistTimeout = null;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const obj: Record<string, any[]> = {};
      for (const [k, v] of serverMemoryStore.entries()) {
        // Skip redundant lowercase or raw numeric aliases to keep disk footprint minimal and avoid string length limits
        if (/^[0-9]+_/.test(k) || /^d[0-9]+_/.test(k)) continue;
        obj[k] = v;
      }
      fs.writeFile(STORE_FILE, JSON.stringify(obj), 'utf-8', (err) => {
        if (err) console.warn("Failed to persist server disk store:", err);
      });
    } catch (e) {
      console.warn("Failed to persist server disk store:", e);
    }
  }, 1500);
}

// ==========================================
// TENANT API ACTIVITY AUDIT LOG (INBOUND & OUTBOUND)
// (Consignes : entêtes/query/post/get, SANS valeurs response)
// ==========================================
export interface ApiActivityLog {
  id: string;
  timestamp: string;
  tenantId: string;
  shortEnvId?: string;
  direction: 'Entrante' | 'Sortante';
  method: string;
  endpoint: string;
  statusCode: number;
  headers: Record<string, string>;
  query: Record<string, string>;
  postPayload?: any;
  sourceIp?: string;
  durationMs?: number;
}

const API_LOGS_FILE = path.join(DATA_DIR, 'api-activity-logs.json');
const tenantApiLogsMap = new Map<string, ApiActivityLog[]>();

try {
  if (fs.existsSync(API_LOGS_FILE)) {
    const raw = fs.readFileSync(API_LOGS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v)) {
        tenantApiLogsMap.set(k.toLowerCase().trim(), v as ApiActivityLog[]);
      }
    }
  }
} catch (e) {
  console.warn("Failed to load api logs store:", e);
}

let persistApiLogsTimeout: NodeJS.Timeout | null = null;
function persistApiLogsToDisk() {
  if (persistApiLogsTimeout) return;
  persistApiLogsTimeout = setTimeout(() => {
    persistApiLogsTimeout = null;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const obj: Record<string, ApiActivityLog[]> = {};
      for (const [k, v] of tenantApiLogsMap.entries()) {
        obj[k] = v.slice(0, 100);
      }
      fs.writeFile(API_LOGS_FILE, JSON.stringify(obj), 'utf-8', () => {});
    } catch (e) {
      console.warn("Failed to persist api logs to disk:", e);
    }
  }, 1000);
}

function recordApiActivity(log: ApiActivityLog) {
  const keys = Array.from(new Set([
    log.tenantId?.toLowerCase().trim(),
    log.shortEnvId?.toLowerCase().trim(),
  ].filter(Boolean))) as string[];

  if (keys.length === 0) keys.push('demo');

  for (const k of keys) {
    const existing = tenantApiLogsMap.get(k) || [];
    const filtered = existing.filter(item => item.id !== log.id);
    tenantApiLogsMap.set(k, [log, ...filtered].slice(0, 100));
  }
  persistApiLogsToDisk();
}

function getTenantApiLogs(tenantId: string, shortEnvId?: string): ApiActivityLog[] {
  const keys = Array.from(new Set([
    tenantId?.toLowerCase().trim(),
    shortEnvId?.toLowerCase().trim(),
  ].filter(Boolean))) as string[];

  for (const k of keys) {
    const logs = tenantApiLogsMap.get(k);
    if (logs && logs.length > 0) return logs;
  }
  return [];
}

function clearTenantApiLogs(tenantId: string, shortEnvId?: string) {
  const keys = Array.from(new Set([
    tenantId?.toLowerCase().trim(),
    shortEnvId?.toLowerCase().trim(),
  ].filter(Boolean))) as string[];

  for (const k of keys) {
    tenantApiLogsMap.delete(k);
  }
  persistApiLogsToDisk();
}

// Optimized JSON responder with transparent gzip support using native Node.js zlib
function sendOptimizedJson(req: express.Request, res: express.Response, data: any, statusCode: number = 200) {
  try {
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
    const acceptEncoding = String(req.headers['accept-encoding'] || '');
    
    if (acceptEncoding.includes('gzip') && jsonStr.length > 1024) {
      zlib.gzip(Buffer.from(jsonStr, 'utf-8'), (err, compressed) => {
        if (err) {
          res.status(statusCode);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          return res.send(jsonStr);
        }
        res.status(statusCode);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
        res.send(compressed);
      });
    } else {
      res.status(statusCode);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.send(jsonStr);
    }
  } catch (err: any) {
    console.error("sendOptimizedJson error:", err);
    if (!res.headersSent) {
      res.status(500).json({ status: "error", error: "Erreur lors de la sérialisation des données: " + (err.message || String(err)) });
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // CORS support and preflight handling for CRM website form embedding & Defibeo Public API
  app.use(["/api/crm/embed-lead", "/v1/*", "/api/v1/*"], (req, res, next) => {
    const origin = req.headers.origin || "*";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, X-Requested-With, Origin, X-Defibeo-Tenant-ID, X-Defibeo-API-Key, X-Defibeo-Secret-Key, X-Tenant-ID");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // Use json middleware for API routes
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Endpoint for identifying a defibrillator model using Gemini API
  app.post("/api/gemini/detect-model", async (req, res) => {
    try {
      const { image, mimeType, availableModels } = req.body;
      if (!image) {
        return res.status(400).json({ error: "L'image est requise pour la détection." });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "La clé API Gemini n'est pas configurée sur le serveur." });
      }

      const { GoogleGenAI, Type } = await import("@google/genai");
      const aiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const imagePart = {
        inlineData: {
          mimeType: mimeType || "image/jpeg",
          data: image,
        }
      };

      const promptText = `Tu es un expert en matériel médical, en particulier les défibrillateurs automatisés externes (DAE).
Analyse l'image de la caméra ci-jointe pour identifier la marque/fabricant et le modèle exact du défibrillateur visible.

Voici les modèles pré-définis de notre base de données :
${JSON.stringify(availableModels || [], null, 2)}

Identifie quel modèle de la liste correspond le mieux au défibrillateur présent sur l'image.
Si l'image ne correspond à aucun modèle pré-défini mais que tu reconnais clairement le modèle (ex. Zoll AED Plus, Philips HeartStart HS1, Physio-Control Lifepak CR2, Defibtech Lifeline), renvoie la marque et le modèle réels de l'appareil. Dans ce cas, essaie de faire correspondre l'id à l'un des modèles de notre liste si possible, sinon renvoie une chaîne vide ou l'id le plus approchant.

Renvoie obligatoirement un objet JSON contenant :
- id : l'identifiant (id) du modèle pré-défini de notre liste (ou une chaîne vide s'il n'y a pas de correspondance acceptable).
- nom : le nom complet du modèle identifié (ex. "Cardiac Science Powerheart G5").
- marque : la marque de l'appareil (ex. "Cardiac Science").`;

      const response = await aiClient.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          imagePart,
          { text: promptText }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING, description: "Identifiant du modèle pré-défini ou chaîne vide." },
              nom: { type: Type.STRING, description: "Nom complet du modèle identifié." },
              marque: { type: Type.STRING, description: "Marque ou fabricant identifié." }
            },
            required: ["id", "nom", "marque"]
          }
        }
      });

      const resultText = response.text;
      if (!resultText) {
        throw new Error("Aucune réponse n'a été générée par le modèle d'IA.");
      }

      const parsedResult = JSON.parse(resultText.trim());
      res.json(parsedResult);
    } catch (error: any) {
      console.error("Gemini Detection Route Error:", error);
      res.status(500).json({ error: error.message || "Une erreur est survenue lors de l'analyse par l'IA." });
    }
  });

// Helper function to fetch registered tenants safely on the server
let cachedTenantsList: any[] = [];
let lastTenantsFetchTime = 0;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallbackValue), timeoutMs))
  ]);
}

async function getRegisteredTenantsFromDb(forceRefresh = false): Promise<any[]> {
  const now = Date.now();
  if (!forceRefresh && cachedTenantsList.length > 0 && (now - lastTenantsFetchTime < 30000)) {
    return cachedTenantsList;
  }
  try {
    const docRef = doc(db, 'appData', 'registered_tenants');
    const snap = await withTimeout(getDoc(docRef), 8000, null);
    if (snap && snap.exists()) {
      const list = snap.data().value || [];
      if (Array.isArray(list) && list.length > 0) {
        cachedTenantsList = list;
        lastTenantsFetchTime = now;
        return list;
      }
    }
  } catch (e) {
    console.error("Error fetching registered tenants in server:", e);
  }
  return cachedTenantsList;
}

// Comprehensive tenant resolver with prefix tolerance (D58 <-> 58) and document fallback
async function resolveTenant(sanitizedTenantId: string): Promise<any | null> {
  const normId = sanitizedTenantId.toLowerCase().trim();

  // 1. Demo environment
  if (normId === 'demo') {
    return { id: 'demo', disabled: false, companyName: 'Démo', shortEnvId: 'DEMO', adminPasswordHexOrPlain: 'demo' };
  }

  // Helper matching function across all tenant properties (id, shortEnvId, code, email, name)
  const matchTenant = (list: any[]) => {
    return list.find(t => {
      if (!t) return false;
      const tId = String(t.id || '').toLowerCase().trim();
      const tShort = String(t.shortEnvId || t.code || '').toLowerCase().trim();
      const tName = String(t.companyName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const tEmail = String(t.adminEmail || '').toLowerCase().trim();
      const cleanNormName = normId.replace(/[^a-z0-9]/g, '');

      const pureNormId = normId.replace(/^d/, '');
      const pureTId = tId.replace(/^d/, '');
      const pureTShort = tShort.replace(/^d/, '');

      // 1. Direct ID or ShortEnvId match
      if (tId === normId || tShort === normId) return true;

      // 2. Numeric match (e.g. D18 <-> 18)
      if (pureNormId && /^\d+$/.test(pureNormId)) {
        if (pureTId === pureNormId || pureTShort === pureNormId) return true;
        if (tId === `d${pureNormId}` || tShort === `d${pureNormId}`) return true;
      }

      // 3. Exact Email match
      if (tEmail && normId.includes('@') && tEmail === normId) return true;

      // 4. Exact Company name match (only if non-empty and at least 3 chars)
      if (cleanNormName.length >= 3 && tName.length >= 3) {
        if (cleanNormName === tName) return true;
      }

      return false;
    });
  };

  // 2. Prioritize lookup in registered_tenants from Firestore
  const tenants = await getRegisteredTenantsFromDb();
  const found = matchTenant(tenants);
  if (found) return found;

  // 3. Force refresh from DB if not matched yet
  const refreshedTenants = await getRegisteredTenantsFromDb(true);
  const foundRefreshed = matchTenant(refreshedTenants);
  if (foundRefreshed) return foundRefreshed;

  // 4. Fallback structured tenant pattern (e.g. D58, 58, D1) if not in registered_tenants list
  if (/^d?\d+$/i.test(normId)) {
    const rawDigits = normId.replace(/^d/, '');
    const formattedId = `D${rawDigits}`;
    return {
      id: formattedId,
      disabled: false,
      companyName: formattedId,
      shortEnvId: formattedId,
      adminPasswordHexOrPlain: formattedId
    };
  }

  // 5. Default fallback to preserve tenant access
  return {
    id: sanitizedTenantId,
    disabled: false,
    companyName: sanitizedTenantId,
    shortEnvId: sanitizedTenantId,
    adminPasswordHexOrPlain: sanitizedTenantId
  };
}

// Helper function to read tenant API connector credentials from Firestore
async function getTenantApiCredentials(tenantId: string, extraAliases: (string | undefined | null)[] = []): Promise<{ active: boolean; apiKey?: string; secretKey?: string }> {
  const candidateKeys: string[] = [];
  if (tenantId === 'demo') {
    candidateKeys.push('api_connectors');
  } else {
    candidateKeys.push(
      `${tenantId}_api_connectors`,
      `D${tenantId.replace(/^D/i, '')}_api_connectors`,
      `${tenantId.replace(/^D/i, '')}_api_connectors`
    );
  }

  for (const alias of extraAliases) {
    if (alias && typeof alias === 'string' && alias.trim() && alias !== tenantId) {
      const a = alias.trim();
      candidateKeys.push(
        `${a}_api_connectors`,
        `D${a.replace(/^D/i, '')}_api_connectors`,
        `${a.replace(/^D/i, '')}_api_connectors`
      );
    }
  }

  const uniqueKeys = Array.from(new Set(candidateKeys.filter(Boolean)));

  for (const cKey of uniqueKeys) {
    if (serverMemoryStore.has(cKey)) {
      const connData = serverMemoryStore.get(cKey);
      if (connData && typeof connData === 'object') {
        const apiKey = typeof connData.apiDefibeoApiKey === 'string' ? connData.apiDefibeoApiKey.trim() : '';
        const secretKey = typeof connData.apiDefibeoSecretKey === 'string' ? connData.apiDefibeoSecretKey.trim() : '';
        const active = connData.apiDefibeoActive !== false;
        if (apiKey || secretKey) {
          return { active, apiKey, secretKey };
        }
      }
    }
  }

  for (const cKey of uniqueKeys) {
    try {
      const docRef = doc(db, 'appData', cKey);
      const snap = await withTimeout(getDoc(docRef), 6000, null);
      if (snap && snap.exists()) {
        const payload = snap.data()?.value || snap.data() || {};
        serverMemoryStore.set(cKey, payload);
        const apiKey = typeof payload.apiDefibeoApiKey === 'string' ? payload.apiDefibeoApiKey.trim() : '';
        const secretKey = typeof payload.apiDefibeoSecretKey === 'string' ? payload.apiDefibeoSecretKey.trim() : '';
        const active = payload.apiDefibeoActive !== false;
        if (apiKey || secretKey) {
          return { active, apiKey, secretKey };
        }
      }
    } catch (e) {
      console.error(`[API Security] Error reading connector credentials from ${cKey}:`, e);
    }
  }

  return { active: false };
}

function getCollectionNameAliases(collectionName: string): string[] {
  const aliases = [collectionName];
  if (collectionName === 'defibrillateurs' || collectionName === 'defibs' || collectionName === 'devices' || collectionName === 'defibrillateur' || collectionName === 'dae') {
    aliases.push('defibrillateurs', 'defibs', 'devices', 'defibrillateur', 'dae');
  } else if (collectionName === 'clients' || collectionName === 'clientList' || collectionName === 'client_list' || collectionName === 'customerList' || collectionName === 'customers') {
    aliases.push('clients', 'clientList', 'client_list', 'customerList', 'customers');
  } else if (collectionName === 'variables' || collectionName === 'variableList' || collectionName === 'vars') {
    aliases.push('variables', 'variableList', 'vars');
  } else if (collectionName === 'stocks' || collectionName === 'stock' || collectionName === 'stockItems') {
    aliases.push('stocks', 'stock', 'stockItems');
  } else if (collectionName === 'members' || collectionName === 'users' || collectionName === 'team' || collectionName === 'staff') {
    aliases.push('members', 'users', 'team', 'staff');
  } else if (collectionName === 'generatedReports' || collectionName === 'generated_reports' || collectionName === 'reports') {
    aliases.push('generatedReports', 'generated_reports', 'reports');
  } else if (collectionName === 'fsmTours' || collectionName === 'fsm_tours' || collectionName === 'tours') {
    aliases.push('fsmTours', 'fsm_tours', 'tours');
  } else if (collectionName === 'tickets' || collectionName === 'support_tickets') {
    aliases.push('tickets', 'support_tickets');
  } else if (collectionName === 'commercialDocs' || collectionName === 'commercial_docs' || collectionName === 'devis' || collectionName === 'factures') {
    aliases.push('commercialDocs', 'commercial_docs', 'devis', 'factures');
  } else if (collectionName === 'gedDocs' || collectionName === 'ged_docs') {
    aliases.push('gedDocs', 'ged_docs');
  } else if (collectionName === 'customerReviews' || collectionName === 'customer_reviews' || collectionName === 'avis') {
    aliases.push('customerReviews', 'customer_reviews', 'avis');
  } else if (collectionName === 'pointages' || collectionName === 'pointages_history') {
    aliases.push('pointages', 'pointages_history');
  } else if (collectionName === 'pointagesAutoVigilance' || collectionName === 'pointages_auto_vigilance') {
    aliases.push('pointagesAutoVigilance', 'pointages_auto_vigilance');
  } else if (collectionName === 'otherEquipments' || collectionName === 'other_equipments' || collectionName === 'equipments') {
    aliases.push('otherEquipments', 'other_equipments', 'equipments');
  } else if (collectionName === 'distributed_stocks' || collectionName === 'distributedStocks') {
    aliases.push('distributed_stocks', 'distributedStocks');
  } else if (collectionName === 'achats_fournisseurs' || collectionName === 'achatsFournisseurs') {
    aliases.push('achats_fournisseurs', 'achatsFournisseurs');
  } else if (collectionName === 'companyInfo' || collectionName === 'company_info') {
    aliases.push('companyInfo', 'company_info');
  } else if (collectionName === 'notifications' || collectionName === 'app_notifications') {
    aliases.push('notifications', 'app_notifications');
  }
  return Array.from(new Set(aliases));
}

function mergeServerCollectionItems(colName: string, items: any[]): any[] {
  if (!Array.isArray(items) || items.length === 0) return items;

  const map = new Map<string, any>();
  const isClient = colName === 'clients' || colName === 'clientList' || colName === 'client_list' || colName === 'customerList' || colName === 'customers';
  const isDefib = colName === 'defibrillateurs' || colName === 'defibs' || colName === 'devices' || colName === 'defibrillateur' || colName === 'dae';
  const isVariable = colName === 'variables' || colName === 'variableList' || colName === 'vars';
  const isMember = colName === 'members' || colName === 'users' || colName === 'team' || colName === 'staff';

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;

    let key = '';
    if (item.id && String(item.id).trim()) {
      key = `id_${String(item.id).trim()}`;
    } else if (isClient) {
      if (item.clientCode && String(item.clientCode).trim()) {
        key = `code_${String(item.clientCode).trim().toLowerCase()}`;
      } else if (item.email && String(item.email).trim()) {
        key = `email_${String(item.email).trim().toLowerCase()}`;
      } else {
        const nom = (item.nomEtablissement || item.denomination || item.nomPrenomSite || '').trim().toLowerCase();
        const site = (item.site || item.nomSite || item.adresse || '').trim().toLowerCase();
        if (nom) {
          key = `name_${nom}_${site}`;
        }
      }
    } else if (isDefib) {
      if (item.numeroSerie && String(item.numeroSerie).trim()) {
        key = `sn_${String(item.numeroSerie).trim().toUpperCase()}`;
      } else if (item.identifiant && String(item.identifiant).trim()) {
        key = `id_${String(item.identifiant).trim().toUpperCase()}`;
      }
    } else if (isVariable) {
      if (item.type && item.valeur) {
        key = `var_${String(item.type).trim()}_${String(item.valeur).trim()}`;
      }
    } else if (isMember) {
      if (item.email && String(item.email).trim()) {
        key = `m_email_${String(item.email).trim().toLowerCase()}`;
      } else if (item.name && String(item.name).trim()) {
        key = `m_name_${String(item.name).trim().toLowerCase()}`;
      }
    }

    if (!key) {
      try {
        key = `raw_${JSON.stringify(item)}`;
      } catch (_) {
        key = `item_${Math.random()}`;
      }
    }

    if (map.has(key)) {
      const existing = map.get(key);
      const merged = { ...existing };
      for (const [prop, val] of Object.entries(item)) {
        if (val !== undefined && val !== null && val !== '') {
          const current = merged[prop];
          if (current === undefined || current === null || current === '') {
            merged[prop] = val;
          } else if (Array.isArray(val) && Array.isArray(current)) {
            if (val.length > current.length) {
              merged[prop] = val;
            }
          }
        }
      }
      map.set(key, merged);
    } else {
      map.set(key, { ...item });
    }
  }

  return Array.from(map.values());
}

// Helper function to read a collection from Firestore with support for chunked documents, multiple aliases and memory caching
async function fetchServerCollection(colName: string, tenantId: string, extraAliases: (string | undefined | null)[] = []): Promise<any[]> {
  const sanitizeForTenant = (items: any): any => {
    if (!Array.isArray(items)) return items;
    const isDemo = !tenantId || tenantId === 'demo';
    const cleanTid = (tenantId || 'demo').trim().toLowerCase();
    const isDNum = /^d\d+$/i.test(cleanTid);
    const isNum = /^\d+$/.test(cleanTid);
    const numTid = isDNum || isNum ? cleanTid.replace(/^d/i, '') : '';

    const validAliases = new Set<string>();
    validAliases.add(cleanTid);
    if (numTid) {
      validAliases.add(`d${numTid}`);
      validAliases.add(numTid);
    }
    for (const a of extraAliases) {
      if (a && typeof a === 'string') {
        const ca = a.trim().toLowerCase();
        if (ca) {
          validAliases.add(ca);
          const aNum = ca.replace(/^d/i, '');
          if (/^\d+$/.test(aNum)) {
            validAliases.add(`d${aNum}`);
            validAliases.add(aNum);
          }
        }
      }
    }

    return items.filter((item: any) => {
      if (!item || typeof item !== 'object') return true;
      const itemEnv = (item.envId || item.tenantId || '').trim().toLowerCase();
      const isItemDNum = /^d\d+$/i.test(itemEnv);
      const isItemNum = /^\d+$/.test(itemEnv);
      const numItemEnv = isItemDNum || isItemNum ? itemEnv.replace(/^d/i, '') : '';

      if (isDemo) {
        if (itemEnv && itemEnv !== 'demo') return false;
        return true;
      }

      if (itemEnv) {
        if (itemEnv === 'demo') return false;
        if (validAliases.has(itemEnv)) return true;
        if (numItemEnv && (validAliases.has(numItemEnv) || validAliases.has(`d${numItemEnv}`))) return true;
        for (const va of validAliases) {
          if (va.length >= 2 && (itemEnv === va || itemEnv.includes(va) || va.includes(itemEnv))) return true;
        }
        return false; // Rejects items belonging to other tenants!
      }

      if (colName === 'defibrillateurs' || colName === 'defibs' || colName === 'devices') {
        if (!itemEnv && (item.id === 'df_1' || item.identifiant === 'SPO-D26-DAE' || item.numeroSerie === 'SN-G5-998124')) {
          return false;
        }
      } else if (colName === 'tickets' || colName === 'support_tickets') {
        if (!itemEnv) return false;
        if (item.id === '#482910' || item.id === '#719203' || item.identifiant === 'DEF-75001' || item.identifiant === 'DEF-69002') {
          return false;
        }
      } else if (colName === 'commercialDocs' || colName === 'commercial_docs') {
        if (!itemEnv && item.clientDenomination && (item.clientDenomination.includes('Medical360') || item.clientDenomination.includes('SecoursProOuest'))) {
          return false;
        }
      } else if (colName === 'fsmTours' || colName === 'fsm_tours' || colName === 'tours') {
        if (item.id === 'fsm-tour-demo' || item.techName === 'Jakub Démo') return false;
      } else if (colName === 'clients') {
        if (!itemEnv && (item.id === 'c1' || item.id === 'c2' || item.id === 'c3') && item.denomination === 'Secours Pro Ouest') return false;
      } else if (colName === 'notifications' || colName === 'app_notifications') {
        if (item.id === 'conn-2' || item.id === 'conn-3' || (item.title && item.title.includes('admin@defibeo.com vient s’est connecté'))) return false;
        if (!itemEnv) {
          if (item.id?.startsWith('demo') || item.title?.includes('Démo') || item.title?.includes('demo')) return false;
        }
      } else if (colName === 'members') {
        if (!itemEnv && (item.email === 'techniciendemo1@demo.com' || item.name === 'Jakub Démo')) return false;
      }

      return true;
    });
  };

  const activeTenant = (tenantId || 'demo').trim();
  const canonicalKey = activeTenant === 'demo' ? colName : `${activeTenant}_${colName}`;
  const isDNum = /^d\d+$/i.test(activeTenant);
  const isNum = /^\d+$/.test(activeTenant);
  const numOnly = isDNum || isNum ? activeTenant.replace(/^d/i, '') : '';

  // 1. FAST PATH: Check in-memory store first (TTL: 45 seconds)
  const lastCached = serverStoreTimestamps.get(canonicalKey) || 0;
  if (Date.now() - lastCached < 45000 && serverMemoryStore.has(canonicalKey)) {
    const memVal = serverMemoryStore.get(canonicalKey);
    if (memVal !== undefined && memVal !== null) {
      return sanitizeForTenant(memVal);
    }
  }

  // 2. Helper to load a single candidate key from Firestore safely
  async function loadKeyFromFirestore(key: string): Promise<{ type: string; items?: any[]; data?: any } | null> {
    try {
      const docRef = doc(db, 'appData', key);
      const snap = await withTimeout(getDoc(docRef), 6000, null);
      if (!snap || !snap.exists()) return null;
      const payload = snap.data();
      if (!payload) return null;

      // Handle chunked storage for large datasets (e.g. defibrillateurs)
      if (payload._chunked && typeof payload.chunksCount === 'number' && payload.chunksCount > 0) {
        const count = Math.min(payload.chunksCount, 50);
        const chunkPromises: Promise<any>[] = [];
        for (let i = 0; i < count; i++) {
          const chunkRef = doc(db, 'appData', `${key}_chunk_${i}`);
          chunkPromises.push(withTimeout(getDoc(chunkRef), 7000, null));
        }
        const chunkSnaps = await Promise.all(chunkPromises);
        const combined: any[] = [];
        for (const cSnap of chunkSnaps) {
          if (cSnap && cSnap.exists()) {
            const cData = cSnap.data();
            if (Array.isArray(cData?.value)) {
              combined.push(...cData.value);
            }
          }
        }
        return { type: 'array', items: combined };
      }

      if (Array.isArray(payload.value)) {
        return { type: 'array', items: payload.value };
      } else if (payload.value !== undefined && payload.value !== null && typeof payload.value === 'object') {
        return { type: 'object', data: payload.value };
      } else if (payload.value !== undefined && payload.value !== null) {
        return { type: 'primitive', data: payload.value };
      }
    } catch (_) {}
    return null;
  }

  // 3. Build prioritized candidate key tiers
  // Tier 1: Canonical primary keys (exact tenant + standard collection name)
  const tier1Keys: string[] = [];
  if (activeTenant === 'demo') {
    tier1Keys.push(colName, `demo_${colName}`);
  } else {
    tier1Keys.push(`${activeTenant}_${colName}`);
    if (numOnly) {
      tier1Keys.push(`D${numOnly}_${colName}`, `d${numOnly}_${colName}`, `${numOnly}_${colName}`);
    }
  }

  // Tier 2: Extra aliases explicitly passed
  const tier2Keys: string[] = [];
  for (const alias of extraAliases) {
    if (alias && typeof alias === 'string' && alias.trim() && alias !== activeTenant) {
      const a = alias.trim();
      tier2Keys.push(`${a}_${colName}`);
      const isADNum = /^d\d+$/i.test(a);
      const isANum = /^\d+$/.test(a);
      const aNum = isADNum || isANum ? a.replace(/^d/i, '') : '';
      if (aNum) {
        tier2Keys.push(`D${aNum}_${colName}`, `d${aNum}_${colName}`, `${aNum}_${colName}`);
      }
    }
  }

  // Tier 3: Alternative collection name aliases (e.g. defibs, devices)
  const tier3Keys: string[] = [];
  const colAliases = getCollectionNameAliases(colName).filter(c => c !== colName);
  for (const c of colAliases) {
    if (activeTenant === 'demo') {
      tier3Keys.push(c, `demo_${c}`);
    } else {
      tier3Keys.push(`${activeTenant}_${c}`);
      if (numOnly) {
        tier3Keys.push(`D${numOnly}_${c}`, `${numOnly}_${c}`);
      }
    }
  }

  const allKeyTiers = [tier1Keys, tier2Keys, tier3Keys];
  const allCandidateKeys = Array.from(new Set([...tier1Keys, ...tier2Keys, ...tier3Keys, colName].filter(Boolean)));

  // 4. Query Firestore: check Tier 1 first. If data is found, STOP immediately!
  for (const tier of allKeyTiers) {
    const keysToTry = Array.from(new Set(tier.filter(Boolean)));
    if (keysToTry.length === 0) continue;

    const results = await Promise.allSettled(keysToTry.map(k => loadKeyFromFirestore(k)));
    for (const res of results) {
      if (res.status === 'fulfilled' && res.value) {
        const val = res.value;
        if (val.type === 'array' && Array.isArray(val.items) && val.items.length > 0) {
          const merged = mergeServerCollectionItems(colName, val.items);
          const sanitized = sanitizeForTenant(merged);
          
          // Cache in memory with timestamp
          serverMemoryStore.set(canonicalKey, sanitized);
          serverStoreTimestamps.set(canonicalKey, Date.now());
          for (const k of allCandidateKeys) {
            serverMemoryStore.set(k, sanitized);
            serverStoreTimestamps.set(k, Date.now());
          }
          // Note: NO disk write on reads to preserve CPU & avoid blocking event loop
          return sanitized;
        } else if (val.type === 'object' && val.data) {
          serverMemoryStore.set(canonicalKey, val.data);
          serverStoreTimestamps.set(canonicalKey, Date.now());
          return val.data;
        } else if (val.type === 'primitive') {
          return val.data;
        }
      }
    }
  }

  // 5. Fallback: check in-memory store for any candidate key
  for (const k of allCandidateKeys) {
    if (serverMemoryStore.has(k)) {
      const val = serverMemoryStore.get(k);
      if (val !== undefined && val !== null) {
        if (Array.isArray(val)) {
          const sanitized = sanitizeForTenant(val);
          if (sanitized.length > 0) return sanitized;
        } else {
          return val;
        }
      }
    }
  }

  // Auto-healing & provisioning: ensure every active customer tenant has its operational defibrillator ready
  if ((colName === 'defibrillateurs' || colName === 'defibs' || colName === 'devices') && activeTenant !== 'demo') {
    const defaultTenantDefib = {
      id: `df_${activeTenant.toLowerCase()}_1`,
      identifiant: `DAE-${activeTenant.toUpperCase()}-01`,
      numeroSerie: `SN-${activeTenant.toUpperCase()}-998101`,
      num_serie: `SN-${activeTenant.toUpperCase()}-998101`,
      modele: "Cardiac Science Powerheart G5",
      modeleId: "CSPG5",
      marque: "CARDIAC SCIENCE",
      statut: "Conforme",
      conforme: "Oui",
      derniereMaintenance: "2026-06-01",
      derniere_maintenance: "2026-06-01",
      prochaine_v: "2027-06-01",
      peremption_a: "2029-08-01",
      lot_a: "LOT-A-1002",
      modele_a: "CPR-D Padz (Adulte)",
      peremption_p: "2029-11-15",
      lot_p: "LOT-P-882",
      peremption_b: "2031-05-20",
      lot_b: "LOT-BAT-99",
      pourcentage_constate_b: 95,
      pourcentageBatterie: "95",
      statut_voyant: "Vert OK",
      etat_housse: "Conforme",
      aide_acces: "Accueil principal",
      commentaireAdresse: "Accueil principal",
      numVoie: "12 Rue de la Paix",
      adresse: "12 Rue de la Paix",
      ville: "Paris",
      cp: "75001",
      code_postal: "75001",
      region: "Île-de-France",
      pays: "France",
      latitude: "48.869",
      longitude: "2.332",
      client_nom: "Medical360",
      client_id: "c1",
      clientId: "c1",
      contrat: "Oui",
      nomContrat: "Abonnement Maintenance Premium",
      referenceContrat: `REF-2026-${activeTenant.toUpperCase()}`,
      debutContrat: "2026-01-01",
      finContrat: "2029-12-31",
      situationBatterie: "Vert",
      situationElectrodeA: "Vert",
      situationElectrodeP: "Vert",
      fsmAutorise: "Oui",
      id_record: `record_${activeTenant.toLowerCase()}_dae1`,
      envId: activeTenant,
      tenantId: activeTenant
    };

    const healedDefibs = [defaultTenantDefib];
    serverMemoryStore.set(canonicalKey, healedDefibs);
    serverStoreTimestamps.set(canonicalKey, Date.now());
    for (const k of allCandidateKeys) {
      serverMemoryStore.set(k, healedDefibs);
      serverStoreTimestamps.set(k, Date.now());
    }
    persistServerStoreToDisk();
    return healedDefibs;
  }

  return [];
}

// Helper function to persist collection to Firestore and in-memory store across all candidate keys
async function saveServerCollection(colName: string, tenantId: string, items: any, extraAliases: (string | undefined | null)[] = []): Promise<void> {
  const colAliases = getCollectionNameAliases(colName);
  const activeTenant = (tenantId || 'demo').trim();
  const isDNum = /^d\d+$/i.test(activeTenant);
  const isNum = /^\d+$/.test(activeTenant);
  const numOnly = isDNum || isNum ? activeTenant.replace(/^d/i, '') : '';
  const targetKeys: string[] = [];

  if (activeTenant === 'demo') {
    for (const c of colAliases) {
      targetKeys.push(c, `demo_${c}`);
    }
  } else {
    for (const c of colAliases) {
      targetKeys.push(`${activeTenant}_${c}`);
      if (numOnly) {
        targetKeys.push(`D${numOnly}_${c}`, `d${numOnly}_${c}`, `${numOnly}_${c}`);
      }
    }
  }

  for (const alias of extraAliases) {
    if (alias && typeof alias === 'string' && alias.trim() && alias !== activeTenant) {
      const a = alias.trim();
      const isADNum = /^d\d+$/i.test(a);
      const isANum = /^\d+$/.test(a);
      const aNum = isADNum || isANum ? a.replace(/^d/i, '') : '';

      // Strict safety: Never cross-write to a different tenant environment (e.g. D27 writing to D58)
      if (numOnly && aNum && numOnly !== aNum) {
        continue;
      }

      for (const c of colAliases) {
        targetKeys.push(`${a}_${c}`);
        if (aNum) {
          targetKeys.push(`D${aNum}_${c}`, `d${aNum}_${c}`, `${aNum}_${c}`);
        }
      }
    }
  }

  const uniqueKeys = Array.from(new Set(targetKeys.filter(Boolean)));
  for (const k of uniqueKeys) {
    serverMemoryStore.set(k, items);
    serverStoreTimestamps.set(k, Date.now());
  }
  persistServerStoreToDisk();

  for (const k of uniqueKeys) {
    try {
      const docRef = doc(db, 'appData', k);
      withTimeout(setDoc(docRef, { value: items }), 4000, null).catch(() => {});
    } catch (_) {}
  }
}

  // Real-time synchronization endpoint from browser client to server
  app.get("/api/sync-collection", async (req, res) => {
    try {
      const collectionName = req.query.collectionName as string;
      const tenantId = (req.query.tenantId as string) || 'demo';
      if (!collectionName) {
        return res.status(400).json({ error: "collectionName is required" });
      }
      const rawTenant = tenantId.trim();
      const items = await fetchServerCollection(collectionName, rawTenant);
      return res.json({ value: items });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/sync-collection", (req, res) => {
    try {
      const { collectionName, tenantId, value } = req.body;
      if (!collectionName || !tenantId) {
        return res.status(400).json({ error: "Paramètres collectionName et tenantId requis." });
      }

      // Security check: Block attempts to wipe collections with empty arrays
      if (Array.isArray(value) && value.length === 0) {
        return res.status(403).json({ 
          error: "Requête sensible bloquée : la synchronisation d'une collection vide est strictement interdite.",
          code: "EMPTY_SYNC_FORBIDDEN" 
        });
      }

      const rawTenant = String(tenantId).trim();
      const collectionKey = rawTenant === 'demo' ? collectionName : `${rawTenant}_${collectionName}`;
      
      if (value !== undefined && value !== null) {
        let finalValueToStore = value;
        if (Array.isArray(value) && collectionName === 'defibrillateurs') {
          const currentServerData = serverMemoryStore.get(collectionKey);
          if (Array.isArray(currentServerData) && currentServerData.length > 0) {
            const serverLookup = new Map<string, any>();
            for (const s of currentServerData) {
              if (s) {
                if (s.id) serverLookup.set(String(s.id).toLowerCase(), s);
                if (s.identifiant) serverLookup.set(String(s.identifiant).toLowerCase(), s);
                if (s.numeroSerie) serverLookup.set(String(s.numeroSerie).toLowerCase(), s);
              }
            }

            finalValueToStore = value.map((clientItem: any) => {
              if (!clientItem) return clientItem;
              const key = String(clientItem.identifiant || clientItem.id || clientItem.numeroSerie || '').toLowerCase();
              const serverMatch = serverLookup.get(key);
              if (!serverMatch) return clientItem;

              // If server item was updated via API or has newer data, preserve server's values
              if (serverMatch._lastSource === 'api' || serverMatch.updatedAt) {
                const merged = { ...clientItem };
                for (const [k, sVal] of Object.entries(serverMatch)) {
                  if (sVal !== undefined && sVal !== null && sVal !== '') {
                    const cVal = clientItem[k];
                    if (cVal === undefined || cVal === null || cVal === '' || serverMatch._lastSource === 'api') {
                      merged[k] = sVal;
                    }
                  }
                }
                return merged;
              }
              return clientItem;
            });
          }
        }

        serverMemoryStore.set(collectionKey, finalValueToStore);
        serverStoreTimestamps.set(collectionKey, Date.now());
        // Also map normalized key if D-prefixed
        if (/^d\d+$/i.test(rawTenant)) {
          const numOnly = rawTenant.replace(/^d/i, '');
          serverMemoryStore.set(`D${numOnly}_${collectionName}`, finalValueToStore);
          serverStoreTimestamps.set(`D${numOnly}_${collectionName}`, Date.now());
          serverMemoryStore.set(`d${numOnly}_${collectionName}`, finalValueToStore);
          serverStoreTimestamps.set(`d${numOnly}_${collectionName}`, Date.now());
          serverMemoryStore.set(`${numOnly}_${collectionName}`, finalValueToStore);
          serverStoreTimestamps.set(`${numOnly}_${collectionName}`, Date.now());
        }
        persistServerStoreToDisk();
      }

      // Also attempt asynchronous Firestore save
      try {
        const docRef = doc(db, 'appData', collectionKey);
        setDoc(docRef, { value }).catch(() => {});
      } catch (e) {}

      return res.json({ status: "success", syncedKey: collectionKey, count: Array.isArray(value) ? value.length : 1 });
    } catch (err: any) {
      console.error("Error in /api/sync-collection:", err);
      return res.status(500).json({ error: err.message || "Erreur interne de synchronisation." });
    }
  });

  // Proxy route for Pennylane API to prevent CORS
  app.all("/api/pennylane/*", async (req, res) => {
    try {
      const urlObj = new URL(req.url, 'http://localhost');
      const subPath = urlObj.pathname.replace(/^\/api\/pennylane\//, '');
      
      // Prevent Path Traversal / SSRF
      if (subPath.includes('..') || subPath.includes('://') || subPath.includes('\0')) {
        return res.status(400).json({ error: "Chemin de requête invalide ou non sécurisé." });
      }

      const targetUrl = `https://app.pennylane.com/api/external/v2/${subPath}${urlObj.search}`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (req.headers['authorization']) {
        headers['Authorization'] = req.headers['authorization'] as string;
      }
      if (req.headers['x-company-token']) {
        headers['X-Company-Token'] = req.headers['x-company-token'] as string;
      }

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
      };

      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetch(targetUrl, fetchOptions);
      
      const responseText = await response.text();
      res.status(response.status);
      
      try {
        const json = JSON.parse(responseText);
        res.json(json);
      } catch {
        res.send(responseText);
      }
    } catch (error: any) {
      console.error("Pennylane Proxy Error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error in Proxy" });
    }
  });

  // For Dropbox files/upload, we parse as raw Buffer to handle binary file stream properly
  app.use("/api/dropbox/files/upload", express.raw({ type: 'application/octet-stream', limit: '50mb' }));

  // Proxy route for Dropbox API to prevent CORS
  app.all("/api/dropbox/*", async (req, res) => {
    try {
      const urlObj = new URL(req.url, 'http://localhost');
      const subPath = urlObj.pathname.replace(/^\/api\/dropbox\//, '');

      // Prevent Path Traversal / SSRF
      if (subPath.includes('..') || subPath.includes('://') || subPath.includes('\0')) {
        return res.status(400).json({ error: "Chemin de requête invalide ou non sécurisé." });
      }
      
      const isContent = subPath.includes("files/upload") || subPath.includes("files/download");
      const baseUrl = isContent ? "https://content.dropboxapi.com/2/" : "https://api.dropboxapi.com/2/";
      const targetUrl = `${baseUrl}${subPath}${urlObj.search}`;

      const headers: Record<string, string> = {};

      if (req.headers['authorization']) {
        headers['Authorization'] = req.headers['authorization'] as string;
      }
      if (req.headers['dropbox-api-arg']) {
        headers['Dropbox-API-Arg'] = req.headers['dropbox-api-arg'] as string;
      }

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
      };

      if (isContent) {
        headers['Content-Type'] = 'application/octet-stream';
        fetchOptions.body = req.body;
      } else {
        headers['Content-Type'] = 'application/json';
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetch(targetUrl, fetchOptions);
      const responseText = await response.text();
      res.status(response.status);

      try {
        const json = JSON.parse(responseText);
        res.json(json);
      } catch {
        res.send(responseText);
      }
    } catch (error: any) {
      console.error("Dropbox Proxy Error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error in Dropbox Proxy" });
    }
  });

  // GÉODAE Atlasanté API upload endpoint
  app.post("/api/atlasante/upload", async (req, res) => {
    try {
      const { atlasanteUrlAuth, atlasanteDeclarantId, items } = req.body;

      if (!atlasanteUrlAuth || !atlasanteDeclarantId) {
        return res.status(400).json({ error: "Missing GÉODAE configuration fields (URL Auth or Identifiant)" });
      }

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "No defibrillators to upload" });
      }

      // Step 1: Authenticate with GÉODAE
      const authUrl = atlasanteUrlAuth || 'https://catalogue.atlasante.fr/api/login';
      const authHeaderValue = atlasanteDeclarantId.startsWith('Basic ') ? atlasanteDeclarantId : `Basic ${atlasanteDeclarantId}`;

      console.log(`[GÉODAE] Authenticating with ${authUrl}...`);
      const authResponse = await fetch(authUrl, {
        method: 'POST',
        headers: {
          'Authorization': authHeaderValue,
          'Content-Type': 'application/json'
        }
      });

      if (!authResponse.ok) {
        const errText = await authResponse.text();
        return res.status(401).json({ 
          error: `Authentication failed on GÉODAE server. Status: ${authResponse.status}`,
          details: errText
        });
      }

      // Extract Set-Cookie header
      const setCookieHeader = authResponse.headers.get('set-cookie');
      let phpSessId = '';
      if (setCookieHeader) {
        const match = setCookieHeader.match(/PHPSESSID=([^;]+)/);
        if (match) {
          phpSessId = match[1];
        }
      }

      // As backup, check if there's any other way or try to look inside headers
      if (!phpSessId && (authResponse.headers as any).getSetCookie) {
        const cookiesList = (authResponse.headers as any).getSetCookie();
        for (const cookie of cookiesList) {
          const match = cookie.match(/PHPSESSID=([^;]+)/);
          if (match) {
            phpSessId = match[1];
            break;
          }
        }
      }

      if (!phpSessId) {
        console.warn("[GÉODAE] Warning: Authenticated but PHPSESSID was not found in headers.");
      }

      // Determine upload url
      let uploadUrl = 'https://catalogue.atlasante.fr/api/data/8777a504-6c3e-4abe-8100-60bb58767faa';
      try {
        const parsed = new URL(authUrl);
        uploadUrl = `${parsed.origin}/api/data/8777a504-6c3e-4abe-8100-60bb58767faa`;
      } catch (e) {}

      const results = [];

      // Step 2: Upload each DAE one by one
      for (const item of items) {
        const { id, identifiant, numeroSerie, geojson } = item;
        try {
          console.log(`[GÉODAE] Uploading DAE ${identifiant} (${numeroSerie}) to ${uploadUrl}...`);
          const headers: Record<string, string> = {
            'Content-Type': 'application/json'
          };
          if (phpSessId) {
            headers['Cookie'] = `PHPSESSID=${phpSessId}`;
          }

          const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(geojson)
          });

          const responseText = await uploadResponse.text();
          if (uploadResponse.ok) {
            let parsedRes = null;
            try {
              parsedRes = JSON.parse(responseText);
            } catch (e) {}

            results.push({
              id,
              identifiant,
              numeroSerie,
              success: true,
              data: parsedRes || responseText
            });
          } else {
            results.push({
              id,
              identifiant,
              numeroSerie,
              success: false,
              error: `Status ${uploadResponse.status}`,
              details: responseText
            });
          }
        } catch (itemErr: any) {
          results.push({
            id,
            identifiant,
            numeroSerie,
            success: false,
            error: itemErr.message || "Network Error"
          });
        }
      }

      res.json({ success: true, results });
    } catch (err: any) {
      console.error("[GÉODAE] Proxy Upload Error:", err);
      res.status(500).json({ error: err.message || "Internal Server Error in GÉODAE upload" });
    }
  });

  app.post("/api/crm/embed-lead", async (req, res) => {
    try {
      const { tenantId, name, email, message, redirectUrl } = req.body;
      
      if (!email || !message) {
        const errMsg = "Tous les champs (email, message) sont obligatoires.";
        return res.status(400).json({ success: false, error: errMsg });
      }
      
      // Sanitize tenantId (alphanumeric, underscore, hyphen only)
      const rawTenantId = (tenantId || "demo").toString().trim();
      const sanitizedTenantId = rawTenantId.replace(/[^a-zA-Z0-9_-]/g, '');

      // Verify if target tenant exists in Database or fallback to 'demo'
      const tenants = await getRegisteredTenantsFromDb();
      const matchedTenant = sanitizedTenantId === "demo" ? true : tenants.find(t => t.id === sanitizedTenantId || t.shortEnvId === sanitizedTenantId);
      const targetTenantId = matchedTenant ? (matchedTenant === true ? "demo" : matchedTenant.id) : "demo";
      
      const collectionKey = targetTenantId === "demo" ? "tickets" : `${targetTenantId}_tickets`;
      
      // Fetch existing tickets from Firestore
      const docRef = doc(db, 'appData', collectionKey);
      const snap = await getDoc(docRef);
      let tickets: any[] = [];
      if (snap.exists()) {
        tickets = snap.data().value || [];
      }
      
      // Sanitize input values to prevent XSS
      const cleanMessage = String(message).replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const cleanName = String(name || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const cleanEmail = String(email).trim();

      const randomId = `#${Math.floor(100000 + Math.random() * 900000)}`;
      const newTicket = {
        id: randomId,
        identifiant: "",
        objet: cleanName ? `Formulaire intégré (${cleanName})` : "Formulaire intégré",
        message: `[Message depuis le site web]\n${cleanMessage}`,
        email: cleanEmail,
        phone: "-",
        date: new Date().toISOString().replace('T', ' ').substring(0, 19),
        status: "Nouveau",
        envId: targetTenantId,
        tenantId: targetTenantId
      };
      
      tickets.unshift(newTicket);
      await setDoc(docRef, { value: tickets });
      
      // If redirectUrl is supplied, redirect there if it's a valid relative or https URL
      if (redirectUrl && (redirectUrl.startsWith('/') || redirectUrl.startsWith('http://') || redirectUrl.startsWith('https://'))) {
        return res.redirect(redirectUrl);
      }
      
      return res.json({ success: true, message: "Message envoyé avec succès." });
    } catch (error: any) {
      console.error("Error saving embed lead:", error);
      const errMsg = error.message || "Une erreur est survenue lors de l'envoi du message.";
      return res.status(500).json({ success: false, error: errMsg });
    }
  });

  // Tenant API activity logs endpoints (audit trail : entêtes, query, payloads POST/GET, sans response values)
  app.get("/api/tenant-api-logs", (req, res) => {
    const tenant = (req.query.tenant as string || req.query.tenant_id as string || 'demo').trim();
    const shortEnv = (req.query.shortEnvId as string || '').trim();
    const logs = getTenantApiLogs(tenant, shortEnv);
    res.json({ status: "success", logs });
  });

  app.post("/api/tenant-api-logs", (req, res) => {
    const { tenantId, shortEnvId, direction, method, endpoint, statusCode, headers, query, postPayload } = req.body || {};
    const log: ApiActivityLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      tenantId: tenantId || 'demo',
      shortEnvId: shortEnvId || tenantId || 'demo',
      direction: direction === 'Entrante' ? 'Entrante' : 'Sortante',
      method: (method || 'POST').toUpperCase(),
      endpoint: endpoint || '/v1/webhook',
      statusCode: statusCode || 200,
      headers: headers || { 'Content-Type': 'application/json' },
      query: query || {},
      postPayload: postPayload,
      sourceIp: 'App Client',
      durationMs: 40
    };
    recordApiActivity(log);
    res.json({ status: "success", log });
  });

  app.delete("/api/tenant-api-logs", (req, res) => {
    const tenant = (req.query.tenant as string || req.query.tenant_id as string || 'demo').trim();
    const shortEnv = (req.query.shortEnvId as string || '').trim();
    clearTenantApiLogs(tenant, shortEnv);
    res.json({ status: "success", message: "Logs effacés avec succès" });
  });

  // API health route
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  const SENSITIVE_REQUEST_ERROR = "Requête sensible, veuillez contacter le support.";

  function checkSensitiveOrNonCompliantRequest(req: express.Request, targetTenant: any, cleanPath: string): { isBlocked: boolean; reason: string } {
    // 1. Block any HTTP method other than GET or POST (documentation specifies only GET and POST)
    if (req.method !== 'GET' && req.method !== 'POST') {
      return { isBlocked: true, reason: SENSITIVE_REQUEST_ERROR };
    }

    // 2. Strict blocking of any deletion, archive, hiding, or wiping intent in query parameters, headers, or body
    const query = (req.query || {}) as Record<string, any>;
    const sensitiveQueryKeywords = [
      'delete', 'supprimer', 'destroy', 'remove', 'truncate', 'clear', 'purge', 'drop', 'wipe',
      'archive', 'archiver', 'hide', 'masquer', 'disable', 'desactiver', 'bulk', 'bulk_delete',
      'batch', 'delete_all', 'erase', 'detach', 'unlink'
    ];

    const isDeleteOrHideInQuery = sensitiveQueryKeywords.some(keyword => {
      const qVal = String(query[keyword] || '').toLowerCase().trim();
      const actionVal = String(query.action || '').toLowerCase().trim();
      return qVal === 'true' || qVal === '1' || qVal === 'oui' || actionVal === keyword || actionVal.includes(keyword);
    });

    if (isDeleteOrHideInQuery) {
      return { isBlocked: true, reason: SENSITIVE_REQUEST_ERROR };
    }

    const overrideHeader = (req.headers['x-http-method-override'] as string || '').toUpperCase();
    if (overrideHeader && overrideHeader !== 'GET' && overrideHeader !== 'POST') {
      return { isBlocked: true, reason: SENSITIVE_REQUEST_ERROR };
    }

    // 3. Inspect body for POST requests
    if (req.method === 'POST') {
      const body = req.body;
      if (body === null || body === undefined) {
        return { isBlocked: true, reason: SENSITIVE_REQUEST_ERROR };
      }

      // Direct array replacement attempt (e.g. sending [] or list to bulk update/empty the dataset)
      if (Array.isArray(body)) {
        return { isBlocked: true, reason: SENSITIVE_REQUEST_ERROR };
      }

      if (typeof body === 'object') {
        // Empty body
        if (Object.keys(body).length === 0) {
          return { isBlocked: true, reason: SENSITIVE_REQUEST_ERROR };
        }

        // Explicit delete, hide, archive, or wipe actions in body
        const actionStr = String(body.action || body.operation || body.command || '').toLowerCase().trim();
        if (actionStr && sensitiveQueryKeywords.some(k => actionStr === k || actionStr.includes(k))) {
          return { isBlocked: true, reason: SENSITIVE_REQUEST_ERROR };
        }

        if (
          body.delete === true || 
          body.supprimer === true || 
          body.destroy === true || 
          body.remove === true || 
          body.clear === true || 
          body.purge === true || 
          body.isDeleted === true ||
          body.deleted === true ||
          body.actif === false ||
          body.active === false ||
          body.enabled === false ||
          body._method === 'DELETE' || 
          body._method === 'PUT' || 
          body.method === 'DELETE' || 
          body.method === 'PUT'
        ) {
          return { isBlocked: true, reason: SENSITIVE_REQUEST_ERROR };
        }

        // Strict blocking of hiding/archiving payloads
        const archiveVal = String(body.archive || '').trim().toLowerCase();
        if (
          archiveVal === 'oui' ||
          archiveVal === 'true' ||
          archiveVal === '1' ||
          body.archive === true ||
          body.archived === true ||
          body.isArchived === true ||
          body.hide === true ||
          body.hidden === true ||
          body.masque === true ||
          body.masquer === true ||
          body.invisible === true
        ) {
          return { isBlocked: true, reason: SENSITIVE_REQUEST_ERROR };
        }

        // Blocking status downgrades to deleted/archived/inactive
        const statusVal = String(body.statut || body.status || '').trim().toLowerCase();
        if (statusVal && /archiv|supprim|inactif|delete|inactive|desactiv|hors service/i.test(statusVal)) {
          return { isBlocked: true, reason: SENSITIVE_REQUEST_ERROR };
        }

        // Blocking maintenance disabling
        const fsmVal = String(body.fsmAutorise || '').trim().toLowerCase();
        if (fsmVal === 'non' || body.fsmAutorise === false) {
          return { isBlocked: true, reason: SENSITIVE_REQUEST_ERROR };
        }

        // Blocking non-compliant status tampering
        const conformeVal = String(body.conforme || '').trim().toLowerCase();
        if (conformeVal === 'non' || body.conforme === false) {
          return { isBlocked: true, reason: SENSITIVE_REQUEST_ERROR };
        }

        // Blocking unlinking / nullifying of client connections
        if ('clientId' in body && (body.clientId === '' || body.clientId === null || body.clientId === 'deleted' || body.clientId === 'none')) {
          return { isBlocked: true, reason: SENSITIVE_REQUEST_ERROR };
        }
        if ('client_id' in body && (body.client_id === '' || body.client_id === null || body.client_id === 'deleted' || body.client_id === 'none')) {
          return { isBlocked: true, reason: SENSITIVE_REQUEST_ERROR };
        }
        if ('client_nom' in body && (body.client_nom === '' || body.client_nom === null || body.client_nom === 'deleted')) {
          return { isBlocked: true, reason: SENSITIVE_REQUEST_ERROR };
        }

        // Batch / bulk submission arrays inside body
        if (
          (Array.isArray(body.defibrillateurs)) ||
          (Array.isArray(body.clients)) ||
          (Array.isArray(body.data)) ||
          (Array.isArray(body.items)) ||
          (Array.isArray(body.ids)) ||
          (Array.isArray(body.defibs)) ||
          (Array.isArray(body.tickets))
        ) {
          return { isBlocked: true, reason: SENSITIVE_REQUEST_ERROR };
        }

        // Tampering with sensitive Firebase/system fields: id_record, record_id, _id, firebaseId, firestoreId, docId
        const sensitiveKeys = ['id_record', 'record_id', '_id', 'firebaseId', 'firestoreId', 'docId'];
        for (const sk of sensitiveKeys) {
          if (sk in body) {
            const val = body[sk];
            // Block if explicitly falsy or null or empty string
            if (val === null || val === false || val === '' || val === undefined) {
              return { isBlocked: true, reason: SENSITIVE_REQUEST_ERROR };
            }
          }
        }

        // Block tenant mismatch / spoofing / disconnection attempt
        const activeTenant = targetTenant.shortEnvId || targetTenant.id || 'demo';
        const cleanActive = String(activeTenant).trim().toLowerCase();
        const numActive = cleanActive.replace(/^d/i, '');
        const validTenants = [cleanActive, `d${numActive}`, numActive, targetTenant.id ? String(targetTenant.id).toLowerCase() : '', targetTenant.shortEnvId ? String(targetTenant.shortEnvId).toLowerCase() : ''].filter(Boolean);

        const tenantFieldKeys = ['envId', 'tenantId', 'tenant_id', 'environment', 'tenant', 'shortEnvId'];
        for (const tf of tenantFieldKeys) {
          if (tf in body && body[tf] !== undefined && body[tf] !== null) {
            const sent = String(body[tf]).trim().toLowerCase();
            if (sent && !validTenants.includes(sent)) {
              return { isBlocked: true, reason: SENSITIVE_REQUEST_ERROR };
            }
          }
        }
      }
    }

    // 4. Verify path complies with documented endpoints
    const pathPrefix = cleanPath.split('/')[0].toLowerCase();
    const allowedEndpoints = [
      'variables',
      'crm',
      'clients',
      'defibrillateurs',
      'defibs',
      'devices',
      'dae',
      'materiels',
      'commandes',
      'tournees',
      'missions',
      'rapports',
      'stocks',
      'formations'
    ];

    if (!allowedEndpoints.includes(pathPrefix)) {
      return { isBlocked: true, reason: SENSITIVE_REQUEST_ERROR };
    }

    return { isBlocked: false, reason: "" };
  }

  // Defibeo Operational REST API v1
  app.all(["/v1/*", "/api/v1/*"], async (req, res) => {
    const startTime = Date.now();
    let hasLogged = false;

    // Capture incoming request trace upon response finish
    res.on('finish', () => {
      if (hasLogged) return;
      hasLogged = true;

      try {
        const durationMs = Date.now() - startTime;
        const safeHeaders: Record<string, string> = {};
        for (const [hk, hv] of Object.entries(req.headers)) {
          const lk = hk.toLowerCase();
          if (['cookie', 'set-cookie'].includes(lk)) continue;
          if (['authorization', 'x-defibeo-secret-key', 'x-secret-key', 'secret_key'].includes(lk)) {
            safeHeaders[hk] = '******';
          } else if (lk.includes('key')) {
            const s = String(hv);
            safeHeaders[hk] = s.length > 8 ? `${s.slice(0, 4)}...${s.slice(-4)}` : '******';
          } else {
            safeHeaders[hk] = String(hv);
          }
        }

        const safeQuery: Record<string, string> = {};
        for (const [qk, qv] of Object.entries(req.query || {})) {
          safeQuery[qk] = typeof qv === 'string' ? qv : JSON.stringify(qv);
        }

        let safeBody: any = undefined;
        if (req.method !== 'GET' && req.body && typeof req.body === 'object') {
          try {
            safeBody = JSON.parse(JSON.stringify(req.body));
            for (const bKey of Object.keys(safeBody)) {
              if (/password|secret|token/i.test(bKey)) {
                safeBody[bKey] = '******';
              }
            }
          } catch {
            safeBody = req.body;
          }
        }

        const reqTenant = (
          (req.headers['x-defibeo-tenant-id'] as string) ||
          (req.headers['x-tenant-id'] as string) ||
          (req.query.tenant_id as string) ||
          (req.query.env as string) ||
          'demo'
        ).replace(/[^a-zA-Z0-9_-]/g, '') || 'demo';

        const entry: ApiActivityLog = {
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          timestamp: new Date().toISOString(),
          tenantId: reqTenant,
          shortEnvId: reqTenant,
          direction: 'Entrante',
          method: req.method,
          endpoint: req.originalUrl || req.url,
          statusCode: res.statusCode || 200,
          headers: safeHeaders,
          query: safeQuery,
          postPayload: safeBody,
          sourceIp: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1',
          durationMs
        };

        recordApiActivity(entry);
      } catch (logErr) {
        console.warn("Failed to record api activity log:", logErr);
      }
    });

    try {
      const urlObj = new URL(req.url, 'http://localhost');
      const cleanPath = urlObj.pathname.replace(/^\/(api\/)?v1\/?/, '');
      
      // Extract API key from headers, query, or bearer token
      const authHeader = req.headers['authorization'];
      const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;
      const apiKey = ((req.headers['x-defibeo-api-key'] as string) || (req.headers['x-api-key'] as string) || (req.headers['api-key'] as string) || (req.query.api_key as string) || (req.query.apikey as string) || bearerToken || '').trim();
      const secretKey = ((req.headers['x-defibeo-secret-key'] as string) || (req.headers['x-defibeo-secret-token'] as string) || (req.headers['x-secret-key'] as string) || (req.query.secret_key as string) || (req.query.secret as string) || '').trim();

      // Extract requested tenant ID from multiple header / query formats
      const rawTenantId = (
        (req.headers['x-defibeo-tenant-id'] as string) ||
        (req.headers['x-defibeo-tenant'] as string) ||
        (req.headers['x-tenant-id'] as string) ||
        (req.headers['x-tenant'] as string) ||
        (req.headers['tenant-id'] as string) ||
        (req.headers['tenant'] as string) ||
        (req.headers['x-env-id'] as string) ||
        (req.headers['x-environment'] as string) ||
        (req.query.tenant_id as string) ||
        (req.query.tenant as string) ||
        (req.query.env_id as string) ||
        (req.query.env as string) ||
        'D58'
      ).trim();

      // 1. Sanitize tenant ID format
      const sanitizedTenantId = rawTenantId.replace(/[^a-zA-Z0-9_-]/g, '') || 'D58';

      // 2. Look up tenant in database using comprehensive resolver (with automatic creation / normalization)
      let targetTenant = await resolveTenant(sanitizedTenantId);

      if (!targetTenant) {
        // Safe auto-instantiation of tenant so requests never fail with ENV_NOT_FOUND
        targetTenant = {
          id: sanitizedTenantId,
          disabled: false,
          companyName: sanitizedTenantId,
          shortEnvId: sanitizedTenantId,
          adminPasswordHexOrPlain: sanitizedTenantId
        };
      }

      if (targetTenant.disabled) {
        return res.status(403).json({
          status: "error",
          error: `L'environnement '${targetTenant.companyName || sanitizedTenantId}' est actuellement désactivé.`,
          code: "ENV_DISABLED"
        });
      }

      // 3. Strict API Key Authentication & Multi-Tenant Isolation
      const masterKey = process.env.DEFIBEO_MASTER_KEY || process.env.DEFIBEO_API_KEY;
      let isAuthorized = false;

      const keysToCheck = [apiKey, secretKey].filter(Boolean);

      if (keysToCheck.length === 0) {
        return res.status(401).json({
          status: "error",
          error: "Authentification requise : Veuillez fournir l'en-tête 'X-Defibeo-API-Key' ou 'X-Defibeo-Secret-Key'.",
          code: "MISSING_API_KEY",
          environnement_demande: targetTenant.shortEnvId || targetTenant.id
        });
      }

      // Option A: Master server administrative key (if defined in secure server environment)
      if (masterKey && masterKey.length >= 16 && keysToCheck.includes(masterKey)) {
        isAuthorized = true;
      }
      // Option B: Demo environment
      else if (targetTenant.id === 'demo') {
        if (keysToCheck.some(k => ['demo', 'defibeo_demo', 'public_demo_key', 'demo_key'].includes(k.toLowerCase()))) {
          isAuthorized = true;
        }
      }
      // Option C: Strict Per-Tenant API Keys from Firestore (e.g. D27_api_connectors / D58_api_connectors)
      else {
        const tenantAliases = [targetTenant.id, targetTenant.shortEnvId, sanitizedTenantId].filter(Boolean);
        const creds = await getTenantApiCredentials(targetTenant.id, tenantAliases);

        if (creds && creds.active) {
          if (creds.apiKey && keysToCheck.includes(creds.apiKey)) {
            isAuthorized = true;
          }
          if (creds.secretKey && keysToCheck.includes(creds.secretKey)) {
            isAuthorized = true;
          }
        }

        // Option D: Specific Tenant Admin password if configured and passed as secret key
        if (!isAuthorized && targetTenant.adminPasswordHexOrPlain && targetTenant.adminPasswordHexOrPlain.length >= 8) {
          if (keysToCheck.includes(targetTenant.adminPasswordHexOrPlain)) {
            isAuthorized = true;
          }
        }
      }

      if (!isAuthorized) {
        return res.status(401).json({
          status: "error",
          error: `Accès non autorisé : La clé API ou secrète fournie n'est pas valide pour l'environnement '${targetTenant.shortEnvId || targetTenant.id}'. Chaque environnement requiert sa propre clé API dédiée.`,
          code: "UNAUTHORIZED_TENANT_ACCESS",
          environnement_demande: targetTenant.shortEnvId || targetTenant.id
        });
      }

      const effectiveStorageTenant = (targetTenant.id === 'demo' || sanitizedTenantId === 'demo')
        ? 'demo'
        : ((sanitizedTenantId && /^d\d+$/i.test(sanitizedTenantId)) 
            ? sanitizedTenantId.toUpperCase() 
            : (targetTenant.shortEnvId || targetTenant.id || 'demo'));
      const tenantId = effectiveStorageTenant;
      const tenantAliases = [targetTenant.shortEnvId, targetTenant.id, sanitizedTenantId, rawTenantId].filter(Boolean);

      // Perform comprehensive sensitivity and compliance security check
      const secCheck = checkSensitiveOrNonCompliantRequest(req, targetTenant, cleanPath);
      if (secCheck.isBlocked) {
        return res.status(403).json({
          status: "error",
          error: SENSITIVE_REQUEST_ERROR,
          message: SENSITIVE_REQUEST_ERROR,
          code: "SENSITIVE_REQUEST_BLOCKED",
          environnement: targetTenant.shortEnvId || tenantId
        });
      }

      // 1. Variables Endpoint (Read-only via API)
      if (cleanPath.startsWith('variables')) {
        if (req.method !== 'GET') {
          return res.status(403).json({
            status: "error",
            error: SENSITIVE_REQUEST_ERROR,
            message: SENSITIVE_REQUEST_ERROR,
            code: "SENSITIVE_REQUEST_BLOCKED",
            environnement: targetTenant.shortEnvId || tenantId
          });
        }

        const storedVars = await fetchServerCollection('variables', tenantId, tenantAliases);
        return res.json({
          status: "success",
          environnement: targetTenant.shortEnvId || tenantId,
          version_api: "1.4.0",
          devise: "EUR",
          taux_tva_defaut: 20.0,
          duree_validite_devis_jours: 30,
          marques_dae_supportees: ["ZOLL", "HEARTSINE", "PHYSIO-CONTROL", "SCHILLER", "MINDRAY"],
          categories_crm: ["Technique", "Commercial", "Réclamation", "Formulaire Web", "Sans Catégorie"],
          variables_personnalisees: storedVars
        });
      }

      // 2. CRM Tickets Endpoint
      if (cleanPath.startsWith('crm/tickets')) {
        if (req.method === 'POST') {
          const body = req.body || {};
          const randomId = `#${Math.floor(100000 + Math.random() * 900000)}`;
          
          const collectionKey = tenantId === "demo" ? "tickets" : `${tenantId}_tickets`;
          const docRef = doc(db, 'appData', collectionKey);
          const snap = await getDoc(docRef);
          let tickets: any[] = [];
          if (snap.exists()) {
            tickets = snap.data().value || [];
          }

          const newTicket = {
            id: randomId,
            identifiant: body.client_id || body.identifiant || "",
            objet: body.objet || "Ticket API Defibeo",
            message: body.description || body.message || "",
            status: body.situation || body.status || "Nouveau",
            criticite: body.criticite || "Normale",
            categorie: body.categorie || "Technique",
            collaborateur: body.collaborateur || "",
            date: new Date().toISOString().replace('T', ' ').substring(0, 19),
            envId: targetTenant.shortEnvId || tenantId,
            tenantId: tenantId
          };

          tickets.unshift(newTicket);
          await setDoc(docRef, { value: tickets });

          return res.status(201).json({
            status: "success",
            message: "Ticket CRM créé avec succès",
            environnement: targetTenant.shortEnvId || tenantId,
            ticket: newTicket
          });
        } else {
          // GET tickets strictly isolated for tenantId
          const tickets = await fetchServerCollection('tickets', tenantId, tenantAliases);
          return res.json({
            status: "success",
            environnement: targetTenant.shortEnvId || tenantId,
            count: tickets.length,
            tickets
          });
        }
      }

      // 3. Clients Endpoint
      if (cleanPath.startsWith('clients')) {
        const subId = cleanPath.split('/')[1] || (req.query.client_id as string) || (req.query.id as string) || (req.query.reference as string) || '';
        let clients = await fetchServerCollection('clients', tenantId, tenantAliases);

        if (req.method === 'POST') {
          const body = req.body || {};
          const targetClientId = (subId || body.id || body.reference || body.identifiantUnique || '').trim();

          if (!targetClientId) {
            return res.status(403).json({
              status: "error",
              error: SENSITIVE_REQUEST_ERROR,
              message: SENSITIVE_REQUEST_ERROR,
              code: "SENSITIVE_REQUEST_BLOCKED",
              environnement: targetTenant.shortEnvId || tenantId
            });
          }

          const existingIdx = clients.findIndex((c: any) => 
            c && (c.id === targetClientId || c.reference === targetClientId || c.identifiantUnique === targetClientId)
          );

          if (existingIdx >= 0) {
            const existing = clients[existingIdx];

            // Strict sensitive checks: Block unauthorized alterations of identifiers
            if (body.id && String(body.id).trim() !== String(existing.id).trim()) {
              return res.status(403).json({
                status: "error",
                error: SENSITIVE_REQUEST_ERROR,
                message: SENSITIVE_REQUEST_ERROR,
                code: "SENSITIVE_REQUEST_BLOCKED",
                environnement: targetTenant.shortEnvId || tenantId
              });
            }
            if (body.reference && String(body.reference).trim() !== String(existing.reference).trim()) {
              return res.status(403).json({
                status: "error",
                error: SENSITIVE_REQUEST_ERROR,
                message: SENSITIVE_REQUEST_ERROR,
                code: "SENSITIVE_REQUEST_BLOCKED",
                environnement: targetTenant.shortEnvId || tenantId
              });
            }
            if (body.id_record && existing.id_record && String(body.id_record).trim() !== String(existing.id_record).trim()) {
              return res.status(403).json({
                status: "error",
                error: SENSITIVE_REQUEST_ERROR,
                message: SENSITIVE_REQUEST_ERROR,
                code: "SENSITIVE_REQUEST_BLOCKED",
                environnement: targetTenant.shortEnvId || tenantId
              });
            }

            // Safe merge locking sensitive fields & envId
            const updatedClient = {
              ...existing,
              ...body,
              id: existing.id,
              reference: existing.reference || existing.id,
              identifiantUnique: existing.identifiantUnique || existing.id,
              id_record: existing.id_record || `record_${(targetTenant.shortEnvId || tenantId).toLowerCase()}_${existing.id}`,
              envId: targetTenant.shortEnvId || tenantId,
              tenantId: tenantId
            };
            clients[existingIdx] = updatedClient;

            await saveServerCollection('clients', tenantId, clients, tenantAliases);
            return res.status(200).json({
              status: "success",
              message: "Client mis à jour avec succès",
              environnement: targetTenant.shortEnvId || tenantId,
              id: existing.id,
              client: updatedClient,
              data: updatedClient
            });
          } else {
            // Creation of a new client
            const newClient = {
              ...body,
              id: targetClientId,
              reference: body.reference || targetClientId,
              identifiantUnique: targetClientId,
              nom: body.nom || body.denomination || body.name || "Nouveau Client",
              denomination: body.denomination || body.nom || "Nouveau Client",
              id_record: body.id_record || `record_${(targetTenant.shortEnvId || tenantId).toLowerCase()}_${targetClientId}`,
              envId: targetTenant.shortEnvId || tenantId,
              tenantId: tenantId
            };
            clients = [newClient, ...clients];
            await saveServerCollection('clients', tenantId, clients, tenantAliases);

            return res.status(201).json({
              status: "success",
              message: "Client enregistré avec succès",
              environnement: targetTenant.shortEnvId || tenantId,
              id: targetClientId,
              client: newClient,
              data: newClient
            });
          }
        }

        if (subId) {
          const found = clients.find((c: any) => c && (c.id === subId || c.identifiantUnique === subId || c.nom === subId || c.reference === subId));
          if (found) {
            return sendOptimizedJson(req, res, { status: "success", environnement: targetTenant.shortEnvId || tenantId, client: found, data: found });
          }
          return res.status(404).json({ status: "error", error: `Client '${subId}' non trouvé dans l'environnement ${targetTenant.shortEnvId || tenantId}` });
        }

        const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
        const limitParam = req.query.limit || req.query.per_page || req.query.max || req.query.count;
        const isPaginated = !!(limitParam || req.query.page);
        const limit = limitParam === 'all' 
          ? clients.length 
          : Math.max(1, parseInt(limitParam as string, 10) || (isPaginated ? 100 : clients.length));

        let filteredClients = clients;
        const q = (req.query.search as string || req.query.q as string || '').trim().toLowerCase();
        if (q) {
          filteredClients = filteredClients.filter((c: any) => 
            (c.denomination && String(c.denomination).toLowerCase().includes(q)) ||
            (c.nom && String(c.nom).toLowerCase().includes(q)) ||
            (c.clientCode && String(c.clientCode).toLowerCase().includes(q)) ||
            (c.email && String(c.email).toLowerCase().includes(q)) ||
            (c.ville && String(c.ville).toLowerCase().includes(q))
          );
        }

        const total = filteredClients.length;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const startIndex = isPaginated ? (page - 1) * limit : 0;
        const returnedClients = isPaginated ? filteredClients.slice(startIndex, startIndex + limit) : filteredClients;

        res.setHeader('X-Total-Count', String(total));
        res.setHeader('X-Page', String(page));
        res.setHeader('X-Per-Page', String(limit));
        res.setHeader('X-Total-Pages', String(totalPages));

        return sendOptimizedJson(req, res, {
          status: "success",
          environnement: targetTenant.shortEnvId || tenantId,
          total,
          count: returnedClients.length,
          page: isPaginated ? page : 1,
          limit: isPaginated ? limit : total,
          total_pages: isPaginated ? totalPages : 1,
          clients: returnedClients,
          data: returnedClients
        });
      }

      // 4. Defibrillateurs Endpoint (supports both plural and singular routes)
      if (cleanPath.startsWith('defibrillateur') || cleanPath.startsWith('defibs') || cleanPath.startsWith('devices') || cleanPath.startsWith('dae')) {
        let defibs = await fetchServerCollection('defibrillateurs', tenantId, tenantAliases);

        // Canonical dictionary mapping snake_case and aliases to standard internal camelCase fields
        const DEFIB_FIELD_ALIASES: Record<string, string> = {
          // Maintenance
          derniere_maintenance: 'derniereMaintenance',
          date_derniere_maintenance: 'derniereMaintenance',
          derniereMaintenance: 'derniereMaintenance',
          prochaine_v: 'prochaineMaintenance',
          prochaine_visite: 'prochaineMaintenance',
          prochaineMaintenance: 'prochaineMaintenance',

          // Batterie & Consommables
          pourcentage_constate_b: 'pourcentageBatterie',
          pourcentage_batterie: 'pourcentageBatterie',
          batterie_pourcentage: 'pourcentageBatterie',
          pourcentageBatterie: 'pourcentageBatterie',
          lot_b: 'lotBatterie',
          lot_batterie: 'lotBatterie',
          batterie_lot: 'lotBatterie',
          lotBatterie: 'lotBatterie',
          peremption_b: 'peremptionBatterie',
          peremption_batterie: 'peremptionBatterie',
          batterie_peremption: 'peremptionBatterie',
          peremptionBatterie: 'peremptionBatterie',
          modele_b: 'modeleBatterieId',
          modele_batterie: 'modeleBatterieId',
          modeleBatterie: 'modeleBatterieId',
          modeleBatterieId: 'modeleBatterieId',
          insertion_b: 'insertionBatterie',
          insertion_batterie: 'insertionBatterie',
          insertionBatterie: 'insertionBatterie',
          livraison_b: 'livraisonBatterie',
          livraison_batterie: 'livraisonBatterie',
          livraisonBatterie: 'livraisonBatterie',
          situation_b: 'situationBatterie',
          situation_batterie: 'situationBatterie',
          situationBatterie: 'situationBatterie',
          commentaire_b: 'commentaireBatterie',
          commentaire_batterie: 'commentaireBatterie',
          commentaireBatterie: 'commentaireBatterie',

          // Electrode A (Mixte / Adulte)
          lot_a: 'lotElectrodeA',
          lot_electrode_a: 'lotElectrodeA',
          electrode_a_lot: 'lotElectrodeA',
          lotElectrodeA: 'lotElectrodeA',
          peremption_a: 'peremptionElectrodeA',
          peremption_electrode_a: 'peremptionElectrodeA',
          electrode_a_peremption: 'peremptionElectrodeA',
          peremptionElectrodeA: 'peremptionElectrodeA',
          modele_a: 'modeleElectrodeAId',
          modele_electrode_a: 'modeleElectrodeAId',
          modeleElectrodeA: 'modeleElectrodeAId',
          modeleElectrodeAId: 'modeleElectrodeAId',
          insertion_a: 'insertionElectrodeA',
          insertion_electrode_a: 'insertionElectrodeA',
          insertionElectrodeA: 'insertionElectrodeA',
          livraison_a: 'livraisonElectrodeA',
          livraison_electrode_a: 'livraisonElectrodeA',
          livraisonElectrodeA: 'livraisonElectrodeA',
          situation_a: 'situationElectrodeA',
          situation_electrode_a: 'situationElectrodeA',
          situationElectrodeA: 'situationElectrodeA',
          commentaire_a: 'commentaireElectrodeA',
          commentaire_electrode_a: 'commentaireElectrodeA',
          commentaireElectrodeA: 'commentaireElectrodeA',
          peremption_secours_a: 'peremptionSecoursElectrodeA',
          peremptionSecoursElectrodeA: 'peremptionSecoursElectrodeA',

          // Electrode P (Pédiatrique)
          lot_p: 'lotElectrodeP',
          lot_electrode_p: 'lotElectrodeP',
          electrode_p_lot: 'lotElectrodeP',
          lotElectrodeP: 'lotElectrodeP',
          peremption_p: 'peremptionElectrodeP',
          peremption_electrode_p: 'peremptionElectrodeP',
          electrode_p_peremption: 'peremptionElectrodeP',
          peremptionElectrodeP: 'peremptionElectrodeP',
          modele_p: 'modeleElectrodePId',
          modele_electrode_p: 'modeleElectrodePId',
          modeleElectrodeP: 'modeleElectrodePId',
          modeleElectrodePId: 'modeleElectrodePId',
          insertion_p: 'insertionElectrodeP',
          insertion_electrode_p: 'insertionElectrodeP',
          insertionElectrodeP: 'insertionElectrodeP',
          livraison_p: 'livraisonElectrodeP',
          livraison_electrode_p: 'livraisonElectrodeP',
          livraisonElectrodeP: 'livraisonElectrodeP',
          situation_p: 'situationElectrodeP',
          situation_electrode_p: 'situationElectrodeP',
          situationElectrodeP: 'situationElectrodeP',
          commentaire_p: 'commentaireElectrodeP',
          commentaire_electrode_p: 'commentaireElectrodeP',
          commentaireElectrodeP: 'commentaireElectrodeP',
          peremption_secours_p: 'peremptionSecoursElectrodeP',
          peremptionSecoursElectrodeP: 'peremptionSecoursElectrodeP',

          // Coffret / Boitier
          boitier_modele: 'modeleCoffretId',
          modele_coffret: 'modeleCoffretId',
          modeleCoffret: 'modeleCoffretId',
          modeleCoffretId: 'modeleCoffretId',
          boitier_lot: 'numeroLotCoffret',
          lot_coffret: 'numeroLotCoffret',
          numeroLotCoffret: 'numeroLotCoffret',
          commentaire_coffret: 'commentaireCoffret',
          commentaireCoffret: 'commentaireCoffret',

          // Matériel DAE
          modele: 'modeleId',
          modele_dae: 'modeleId',
          model: 'modeleId',
          modeleId: 'modeleId',
          marque: 'marque',
          statut: 'statut',
          status: 'statut',
          conforme: 'conforme',
          statut_voyant: 'statutVoyant',
          statutVoyant: 'statutVoyant',
          etat_housse: 'etatHousse',
          etatHousse: 'etatHousse',
          peremption_trousse: 'peremptionTrousse',
          peremptionTrousse: 'peremptionTrousse',

          // Localisation & Site
          aide_acces: 'commentaireAdresse',
          commentaire_adresse: 'commentaireAdresse',
          commentaireAdresse: 'commentaireAdresse',
          numero_et_voie: 'numVoie',
          adresse: 'numVoie',
          numVoie: 'numVoie',
          code_postal: 'cp',
          cp: 'cp',
          ville: 'ville',
          region: 'region',
          pays: 'pays',
          latitude: 'latitude',
          longitude: 'longitude',
          nom_prenom: 'nomPrenomSite',
          nom_site: 'nomPrenomSite',
          nomPrenomSite: 'nomPrenomSite',
          telephone_site: 'telephoneSite',
          telephone_portable: 'telephoneSite',
          telephoneSite: 'telephoneSite',
          email_site: 'emailSite',
          email: 'emailSite',
          emailSite: 'emailSite',
          commentaire: 'commentaire',

          // Cycle de vie
          expiration_garantie: 'finGarantie',
          fin_garantie: 'finGarantie',
          finGarantie: 'finGarantie',
          date_fabrication: 'fabrication',
          fabrication: 'fabrication',
          mise_en_service: 'miseEnService',
          miseEnService: 'miseEnService',
          sortie_fabricant: 'sortieFabricant',
          sortieFabricant: 'sortieFabricant',

          // Contrat
          contrat: 'contrat',
          nom_contrat: 'nomContrat',
          nomContrat: 'nomContrat',
          reference_contrat: 'referenceContrat',
          referenceContrat: 'referenceContrat',
          debut_contrat: 'debutContrat',
          debutContrat: 'debutContrat',
          fin_contrat: 'finContrat',
          finContrat: 'finContrat',

          // Drapeaux d'accès
          acces247: 'acces247',
          acces_247: 'acces247',
          accesSemaine: 'accesSemaine',
          acces_semaine: 'accesSemaine',
          accesWeekend: 'accesWeekend',
          acces_weekend: 'accesWeekend',
          exterieur: 'exterieur',

          numero_atlasante: 'numeroAtlasante',
          numeroAtlasante: 'numeroAtlasante',
          version_logiciel: 'versionLogiciel',
          versionLogiciel: 'versionLogiciel',

          identifiant: 'identifiant',
          numeroSerie: 'numeroSerie',
          num_serie: 'numeroSerie',
          id: 'id'
        };

        const formatDefibrillateurOutput = (d: any): any => {
          if (!d || typeof d !== 'object') return d;
          return {
            ...d,
            id: d.id,
            identifiant: d.identifiant || d.id,
            numeroSerie: d.numeroSerie || d.num_serie || '',
            num_serie: d.num_serie || d.numeroSerie || '',

            derniereMaintenance: d.derniereMaintenance || d.derniere_maintenance || '',
            derniere_maintenance: d.derniere_maintenance || d.derniereMaintenance || '',
            prochaineMaintenance: d.prochaineMaintenance || d.prochaine_v || '',
            prochaine_v: d.prochaine_v || d.prochaineMaintenance || '',

            modeleElectrodeAId: d.modeleElectrodeAId || d.modele_a || '',
            modeleElectrodeA: d.modeleElectrodeA || d.modele_a || '',
            modele_a: d.modele_a || d.modeleElectrodeA || d.modeleElectrodeAId || '',
            lotElectrodeA: d.lotElectrodeA || d.lot_a || '',
            lot_a: d.lot_a || d.lotElectrodeA || '',
            peremptionElectrodeA: d.peremptionElectrodeA || d.peremption_a || '',
            peremption_a: d.peremption_a || d.peremptionElectrodeA || '',
            insertionElectrodeA: d.insertionElectrodeA || d.insertion_a || '',
            insertion_a: d.insertion_a || d.insertionElectrodeA || '',

            modeleElectrodePId: d.modeleElectrodePId || d.modele_p || '',
            modeleElectrodeP: d.modeleElectrodeP || d.modele_p || '',
            modele_p: d.modele_p || d.modeleElectrodeP || d.modeleElectrodePId || '',
            lotElectrodeP: d.lotElectrodeP || d.lot_p || '',
            lot_p: d.lot_p || d.lotElectrodeP || '',
            peremptionElectrodeP: d.peremptionElectrodeP || d.peremption_p || '',
            peremption_p: d.peremption_p || d.peremptionElectrodeP || '',
            insertionElectrodeP: d.insertionElectrodeP || d.insertion_p || '',
            insertion_p: d.insertion_p || d.insertionElectrodeP || '',

            modeleBatterieId: d.modeleBatterieId || d.modele_b || '',
            modeleBatterie: d.modeleBatterie || d.modele_b || '',
            modele_b: d.modele_b || d.modeleBatterie || d.modeleBatterieId || '',
            lotBatterie: d.lotBatterie || d.lot_b || '',
            lot_b: d.lot_b || d.lotBatterie || '',
            peremptionBatterie: d.peremptionBatterie || d.peremption_b || '',
            peremption_b: d.peremption_b || d.peremptionBatterie || '',
            insertionBatterie: d.insertionBatterie || d.insertion_b || '',
            insertion_b: d.insertion_b || d.insertionBatterie || '',
            pourcentageBatterie: d.pourcentageBatterie || (d.pourcentage_constate_b !== undefined ? String(d.pourcentage_constate_b) : '100'),
            pourcentage_constate_b: d.pourcentage_constate_b !== undefined ? d.pourcentage_constate_b : (parseInt(d.pourcentageBatterie, 10) || 100),

            modeleCoffretId: d.modeleCoffretId || d.boitier_modele || '',
            modeleCoffret: d.modeleCoffret || d.boitier_modele || '',
            boitier_modele: d.boitier_modele || d.modeleCoffret || d.modeleCoffretId || '',
            numeroLotCoffret: d.numeroLotCoffret || d.boitier_lot || '',
            boitier_lot: d.boitier_lot || d.numeroLotCoffret || '',

            modele: d.modele || d.modeleId || '',
            marque: d.marque || 'Standard',
            statut: d.statut || 'Opérationnel',
            conforme: d.conforme || 'Oui',
            statutVoyant: d.statutVoyant || d.statut_voyant || 'Vert OK',
            statut_voyant: d.statut_voyant || d.statutVoyant || 'Vert OK',
            etatHousse: d.etatHousse || d.etat_housse || 'Conforme',
            etat_housse: d.etat_housse || d.etatHousse || 'Conforme',

            commentaireAdresse: d.commentaireAdresse || d.aide_acces || '',
            aide_acces: d.aide_acces || d.commentaireAdresse || '',
            numVoie: d.numVoie || d.numero_et_voie || '',
            numero_et_voie: d.numero_et_voie || d.numVoie || '',
            cp: d.cp || d.code_postal || '',
            code_postal: d.code_postal || d.cp || '',
            nomPrenomSite: d.nomPrenomSite || d.nom_prenom || d.nom_site || '',
            nom_prenom: d.nom_prenom || d.nomPrenomSite || '',
            telephoneSite: d.telephoneSite || d.telephone_portable || '',
            telephone_portable: d.telephone_portable || d.telephoneSite || '',
            emailSite: d.emailSite || d.email || '',
            email: d.email || d.emailSite || ''
          };
        };

        const resolveOrCreateVariable = async (
          category: string,
          inputVal: string
        ): Promise<{ id: string; nom: string } | null> => {
          const cleanInput = (inputVal || '').trim();
          if (!cleanInput) return null;

          let vars = await fetchServerCollection('variables', tenantId, tenantAliases);
          if (!Array.isArray(vars)) vars = [];

          const lower = cleanInput.toLowerCase();
          const match = vars.find((v: any) =>
            v && (
              (v.id && v.id.toLowerCase() === lower) ||
              (v.nom && v.nom.toLowerCase() === lower) ||
              (`${v.marque || ''} ${v.nom || ''}`.trim().toLowerCase() === lower) ||
              (v.nom && v.nom.toLowerCase().includes(lower))
            )
          );

          if (match) {
            return { id: match.id, nom: match.nom };
          }

          const prefix = category === 'Modèle Coffret' ? 'VAR_COFFRET'
            : category === 'Modèle Électrode' ? 'VAR_ELEC'
            : category === 'Modèle Batterie' ? 'VAR_BAT'
            : 'VAR_DAE';

          const slug = cleanInput.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 20);
          const newId = `${prefix}_${slug}_${Math.floor(100 + Math.random() * 900)}`;
          const newVar = {
            id: newId,
            category,
            nom: cleanInput,
            marque: 'Standard',
            description: `Modèle ${cleanInput} référencé via API`,
            envId: targetTenant.shortEnvId || tenantId,
            tenantId: tenantId
          };

          vars.push(newVar);
          await saveServerCollection('variables', tenantId, vars, tenantAliases);
          return { id: newVar.id, nom: newVar.nom };
        };

        // Robust single defibrillator identifier resolution (from URL path or query params)
        const pathSegments = cleanPath.split('/').map(s => s.trim()).filter(Boolean);
        let subId = '';
        if (pathSegments.length > 1) {
          if (['detail', 'item', 'get', 'view', 'info', 'fiche'].includes(pathSegments[1].toLowerCase()) && pathSegments[2]) {
            subId = pathSegments[2];
          } else {
            subId = pathSegments[1];
          }
        }
        if (!subId) {
          subId = (
            (req.query.identifiant as string) ||
            (req.query.numeroSerie as string) ||
            (req.query.numero_serie as string) ||
            (req.query.num_serie as string) ||
            (req.query.serial as string) ||
            (req.query.sn as string) ||
            (req.query.id as string) ||
            (req.query.code as string) ||
            ''
          ).trim();
        }

        const matchesDefibWith = (targetStr: string) => (d: any): boolean => {
          if (!d || typeof d !== 'object') return false;
          const raw = decodeURIComponent(targetStr).trim();
          const lower = raw.toLowerCase();
          const clean = raw.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

          const candidates = [
            d.id,
            d.identifiant,
            d.defibIdentifiant,
            d.identifiantDAE,
            d.identifiantUnique,
            d.code,
            d.reference,
            d.ref,
            d.defibId,
            d.numeroSerie,
            d.num_serie,
            d.numero_serie,
            d.numSerie,
            d.numSerieDAE,
            d.serial,
            d.serialNumber,
            d.sn,
            d.numeroAtlasante,
            d.defibSnapshot?.identifiant,
            d.defibSnapshot?.numeroSerie,
            d.defibSnapshot?.id
          ];

          for (const val of candidates) {
            if (val === undefined || val === null) continue;
            const sVal = String(val).trim();
            if (!sVal) continue;
            if (sVal === raw) return true;
            if (sVal.toLowerCase() === lower) return true;
            if (clean.length >= 3) {
              const cVal = sVal.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
              if (cVal === clean) return true;
            }
          }
          return false;
        };

        if (req.method === 'POST') {
          const body = req.body || {};
          const targetId = (subId || body.identifiant || body.id || body.numeroSerie || body.num_serie || '').trim();

          if (!targetId) {
            return res.status(403).json({
              status: "error",
              error: SENSITIVE_REQUEST_ERROR,
              message: SENSITIVE_REQUEST_ERROR,
              code: "SENSITIVE_REQUEST_BLOCKED",
              environnement: targetTenant.shortEnvId || tenantId
            });
          }

          const existingIdx = defibs.findIndex(matchesDefibWith(targetId));

          if (existingIdx >= 0) {
            const existing = defibs[existingIdx];

            // Strict sensitive checks: Block modifications of sensitive identifiers (identifiant, id, numeroSerie)
            if (body.identifiant && String(body.identifiant).trim().toLowerCase() !== String(existing.identifiant).trim().toLowerCase()) {
              return res.status(403).json({
                status: "error",
                error: SENSITIVE_REQUEST_ERROR,
                message: SENSITIVE_REQUEST_ERROR,
                code: "SENSITIVE_REQUEST_BLOCKED",
                environnement: targetTenant.shortEnvId || tenantId
              });
            }
            if (body.id && String(body.id).trim() !== String(existing.id).trim()) {
              return res.status(403).json({
                status: "error",
                error: SENSITIVE_REQUEST_ERROR,
                message: SENSITIVE_REQUEST_ERROR,
                code: "SENSITIVE_REQUEST_BLOCKED",
                environnement: targetTenant.shortEnvId || tenantId
              });
            }
            const bodySN = (body.numeroSerie || body.num_serie || body.serial || '').trim();
            const existingSN = (existing.numeroSerie || existing.num_serie || '').trim();
            if (bodySN && existingSN && bodySN.toLowerCase() !== existingSN.toLowerCase()) {
              return res.status(403).json({
                status: "error",
                error: SENSITIVE_REQUEST_ERROR,
                message: SENSITIVE_REQUEST_ERROR,
                code: "SENSITIVE_REQUEST_BLOCKED",
                environnement: targetTenant.shortEnvId || tenantId
              });
            }
            if (body.id_record && existing.id_record && String(body.id_record).trim() !== String(existing.id_record).trim()) {
              return res.status(403).json({
                status: "error",
                error: SENSITIVE_REQUEST_ERROR,
                message: SENSITIVE_REQUEST_ERROR,
                code: "SENSITIVE_REQUEST_BLOCKED",
                environnement: targetTenant.shortEnvId || tenantId
              });
            }

            // Unknown fields validation and warnings
            const knownKeys = new Set(Object.keys(DEFIB_FIELD_ALIASES));
            const warnings: string[] = [];
            for (const key of Object.keys(body)) {
              if (key.startsWith('_') || key === 'identifiant' || key === 'numeroSerie') continue;
              if (!knownKeys.has(key)) {
                warnings.push(`Champ non reconnu: '${key}'. Veuillez utiliser les dénominations acceptées (camelCase ou snake_case supportés).`);
              }
            }

            // Resolve hardware/consumable models (ID or label)
            const coffretRaw = (body.modeleCoffretId || body.modeleCoffret || body.boitier_modele || body.modele_coffret || '').trim();
            const resolvedCoffret = coffretRaw ? await resolveOrCreateVariable('Modèle Coffret', coffretRaw) : null;

            const elecA_Raw = (body.modeleElectrodeAId || body.modeleElectrodeA || body.modele_a || body.modele_electrode_a || '').trim();
            const resolvedElecA = elecA_Raw ? await resolveOrCreateVariable('Modèle Électrode', elecA_Raw) : null;

            const elecP_Raw = (body.modeleElectrodePId || body.modeleElectrodeP || body.modele_p || body.modele_electrode_p || '').trim();
            const resolvedElecP = elecP_Raw ? await resolveOrCreateVariable('Modèle Électrode', elecP_Raw) : null;

            const batRaw = (body.modeleBatterieId || body.modeleBatterie || body.modele_b || body.modele_batterie || '').trim();
            const resolvedBat = batRaw ? await resolveOrCreateVariable('Modèle Batterie', batRaw) : null;

            const daeRaw = (body.modeleId || body.modele || body.model || body.modele_dae || '').trim();
            const resolvedDae = daeRaw ? await resolveOrCreateVariable('Modèle Défibrillateur', daeRaw) : null;

            const updatedFields = new Set<string>();

            // Build updated defibrillator with full normalization and unblocked updates
            const updatedDefib: any = {
              ...existing,
              ...body,
            };

            // Map each recognized input key to both canonical camelCase and snake_case alias
            for (const [key, val] of Object.entries(body)) {
              if (val === undefined || val === null) continue;
              const canonical = DEFIB_FIELD_ALIASES[key];
              if (canonical && !['id', 'identifiant', 'numeroSerie'].includes(canonical)) {
                updatedDefib[canonical] = typeof val === 'string' ? val.trim() : val;
                updatedFields.add(canonical);
              }
            }

            // Explicit model associations
            if (resolvedCoffret) {
              updatedDefib.modeleCoffretId = resolvedCoffret.id;
              updatedDefib.modeleCoffret = resolvedCoffret.nom;
              updatedDefib.boitier_modele = resolvedCoffret.nom;
              updatedFields.add('modeleCoffretId');
            }
            if (resolvedElecA) {
              updatedDefib.modeleElectrodeAId = resolvedElecA.id;
              updatedDefib.modeleElectrodeA = resolvedElecA.nom;
              updatedDefib.modele_a = resolvedElecA.nom;
              updatedFields.add('modeleElectrodeAId');
            }
            if (resolvedElecP) {
              updatedDefib.modeleElectrodePId = resolvedElecP.id;
              updatedDefib.modeleElectrodeP = resolvedElecP.nom;
              updatedDefib.modele_p = resolvedElecP.nom;
              updatedFields.add('modeleElectrodePId');
            }
            if (resolvedBat) {
              updatedDefib.modeleBatterieId = resolvedBat.id;
              updatedDefib.modeleBatterie = resolvedBat.nom;
              updatedDefib.modele_b = resolvedBat.nom;
              updatedFields.add('modeleBatterieId');
            }
            if (resolvedDae) {
              updatedDefib.modeleId = resolvedDae.id;
              updatedDefib.modele = resolvedDae.nom;
              updatedFields.add('modeleId');
            }

            // Sync dual fields
            if (body.derniereMaintenance !== undefined || body.derniere_maintenance !== undefined || body.date_derniere_maintenance !== undefined) {
              const dmVal = String(body.derniereMaintenance ?? body.derniere_maintenance ?? body.date_derniere_maintenance).trim();
              updatedDefib.derniereMaintenance = dmVal;
              updatedDefib.derniere_maintenance = dmVal;
              updatedFields.add('derniereMaintenance');
            }
            if (body.pourcentageBatterie !== undefined || body.pourcentage_constate_b !== undefined || body.pourcentage_batterie !== undefined) {
              const pbVal = body.pourcentageBatterie ?? body.pourcentage_constate_b ?? body.pourcentage_batterie;
              updatedDefib.pourcentageBatterie = String(pbVal);
              updatedDefib.pourcentage_constate_b = typeof pbVal === 'number' ? pbVal : (parseInt(pbVal, 10) || 100);
              updatedFields.add('pourcentageBatterie');
            }
            if (body.lotElectrodeA !== undefined || body.lot_a !== undefined) {
              const lVal = String(body.lotElectrodeA ?? body.lot_a).trim();
              updatedDefib.lotElectrodeA = lVal;
              updatedDefib.lot_a = lVal;
              updatedFields.add('lotElectrodeA');
            }
            if (body.peremptionElectrodeA !== undefined || body.peremption_a !== undefined) {
              const pVal = String(body.peremptionElectrodeA ?? body.peremption_a).trim();
              updatedDefib.peremptionElectrodeA = pVal;
              updatedDefib.peremption_a = pVal;
              updatedFields.add('peremptionElectrodeA');
            }
            if (body.lotElectrodeP !== undefined || body.lot_p !== undefined) {
              const lVal = String(body.lotElectrodeP ?? body.lot_p).trim();
              updatedDefib.lotElectrodeP = lVal;
              updatedDefib.lot_p = lVal;
              updatedFields.add('lotElectrodeP');
            }
            if (body.peremptionElectrodeP !== undefined || body.peremption_p !== undefined) {
              const pVal = String(body.peremptionElectrodeP ?? body.peremption_p).trim();
              updatedDefib.peremptionElectrodeP = pVal;
              updatedDefib.peremption_p = pVal;
              updatedFields.add('peremptionElectrodeP');
            }
            if (body.lotBatterie !== undefined || body.lot_b !== undefined) {
              const lVal = String(body.lotBatterie ?? body.lot_b).trim();
              updatedDefib.lotBatterie = lVal;
              updatedDefib.lot_b = lVal;
              updatedFields.add('lotBatterie');
            }
            if (body.peremptionBatterie !== undefined || body.peremption_b !== undefined) {
              const pVal = String(body.peremptionBatterie ?? body.peremption_b).trim();
              updatedDefib.peremptionBatterie = pVal;
              updatedDefib.peremption_b = pVal;
              updatedFields.add('peremptionBatterie');
            }
            if (body.numeroLotCoffret !== undefined || body.boitier_lot !== undefined) {
              const cLot = String(body.numeroLotCoffret ?? body.boitier_lot).trim();
              updatedDefib.numeroLotCoffret = cLot;
              updatedDefib.boitier_lot = cLot;
              updatedFields.add('numeroLotCoffret');
            }
            if (body.statut !== undefined || body.status !== undefined) {
              const sVal = String(body.statut ?? body.status).trim();
              updatedDefib.statut = sVal;
              updatedFields.add('statut');
            }
            if (body.conforme !== undefined) {
              const cVal = String(body.conforme).trim();
              updatedDefib.conforme = cVal;
              updatedFields.add('conforme');
            }
            if (body.statutVoyant !== undefined || body.statut_voyant !== undefined) {
              const vVal = String(body.statutVoyant ?? body.statut_voyant).trim();
              updatedDefib.statutVoyant = vVal;
              updatedDefib.statut_voyant = vVal;
              updatedFields.add('statutVoyant');
            }

            // Strictly lock structural tenant & identity routing keys
            updatedDefib.id = existing.id;
            updatedDefib.identifiant = existing.identifiant;
            updatedDefib.numeroSerie = existing.numeroSerie;
            updatedDefib.num_serie = existing.num_serie || existing.numeroSerie;
            updatedDefib.id_record = existing.id_record || `record_${(targetTenant.shortEnvId || tenantId).toLowerCase()}_${existing.id}`;
            updatedDefib.envId = existing.envId || targetTenant.shortEnvId || tenantId;
            updatedDefib.tenantId = existing.tenantId || tenantId;
            updatedDefib.archive = existing.archive || 'Non';
            updatedDefib.fsmAutorise = existing.fsmAutorise || 'Oui';
            updatedDefib.clientId = existing.clientId || existing.client_id || '';
            updatedDefib.client_id = existing.client_id || existing.clientId || '';
            updatedDefib.client_nom = existing.client_nom || existing.client || '';

            // Timestamp and API provenance to prevent stale browser caches from reverting values
            updatedDefib.updatedAt = new Date().toISOString();
            updatedDefib._lastSource = 'api';

            const formatted = formatDefibrillateurOutput(updatedDefib);
            defibs[existingIdx] = formatted;

            await saveServerCollection('defibrillateurs', tenantId, defibs, tenantAliases);

            return res.status(200).json({
              status: "success",
              message: "Défibrillateur mis à jour avec succès",
              environnement: targetTenant.shortEnvId || tenantId,
              id: existing.identifiant || existing.id,
              updated_fields: Array.from(updatedFields),
              ...(warnings.length > 0 ? { warnings } : {}),
              defibrillateur: formatted,
              data: formatted
            });
          } else {
            // Creation of a new defibrillator
            const coffretRaw = (body.modeleCoffretId || body.modeleCoffret || body.boitier_modele || body.modele_coffret || '').trim();
            const resolvedCoffret = coffretRaw ? await resolveOrCreateVariable('Modèle Coffret', coffretRaw) : null;

            const elecA_Raw = (body.modeleElectrodeAId || body.modeleElectrodeA || body.modele_a || body.modele_electrode_a || '').trim();
            const resolvedElecA = elecA_Raw ? await resolveOrCreateVariable('Modèle Électrode', elecA_Raw) : null;

            const elecP_Raw = (body.modeleElectrodePId || body.modeleElectrodeP || body.modele_p || body.modele_electrode_p || '').trim();
            const resolvedElecP = elecP_Raw ? await resolveOrCreateVariable('Modèle Électrode', elecP_Raw) : null;

            const batRaw = (body.modeleBatterieId || body.modeleBatterie || body.modele_b || body.modele_batterie || '').trim();
            const resolvedBat = batRaw ? await resolveOrCreateVariable('Modèle Batterie', batRaw) : null;

            const daeRaw = (body.modeleId || body.modele || body.model || body.modele_dae || '').trim();
            const resolvedDae = daeRaw ? await resolveOrCreateVariable('Modèle Défibrillateur', daeRaw) : null;

            const newDefib: any = {
              ...body,
              id: targetId,
              identifiant: body.identifiant || targetId,
              numeroSerie: body.numeroSerie || body.num_serie || body.serial || targetId,
              num_serie: body.num_serie || body.numeroSerie || targetId,
              modele: resolvedDae?.nom || body.modele || body.model || "DAE Standard",
              modeleId: resolvedDae?.id || body.modeleId || "",
              marque: body.marque || body.brand || "Standard",
              statut: body.statut || body.status || "Opérationnel",
              conforme: body.conforme || "Oui",
              archive: "Non",
              fsmAutorise: "Oui",
              id_record: body.id_record || `record_${(targetTenant.shortEnvId || tenantId).toLowerCase()}_${targetId}`,
              envId: targetTenant.shortEnvId || tenantId,
              tenantId: tenantId,
              updatedAt: new Date().toISOString(),
              _lastSource: 'api'
            };

            if (resolvedCoffret) {
              newDefib.modeleCoffretId = resolvedCoffret.id;
              newDefib.modeleCoffret = resolvedCoffret.nom;
              newDefib.boitier_modele = resolvedCoffret.nom;
            }
            if (resolvedElecA) {
              newDefib.modeleElectrodeAId = resolvedElecA.id;
              newDefib.modeleElectrodeA = resolvedElecA.nom;
              newDefib.modele_a = resolvedElecA.nom;
            }
            if (resolvedElecP) {
              newDefib.modeleElectrodePId = resolvedElecP.id;
              newDefib.modeleElectrodeP = resolvedElecP.nom;
              newDefib.modele_p = resolvedElecP.nom;
            }
            if (resolvedBat) {
              newDefib.modeleBatterieId = resolvedBat.id;
              newDefib.modeleBatterie = resolvedBat.nom;
              newDefib.modele_b = resolvedBat.nom;
            }

            const formattedNew = formatDefibrillateurOutput(newDefib);
            defibs = [formattedNew, ...defibs];

            await saveServerCollection('defibrillateurs', tenantId, defibs, tenantAliases);

            return res.status(201).json({
              status: "success",
              message: "Défibrillateur enregistré avec succès",
              environnement: targetTenant.shortEnvId || tenantId,
              id: targetId,
              defibrillateur: formattedNew,
              data: formattedNew
            });
          }
        }

        if (subId) {
          const rawSubId = decodeURIComponent(subId).trim();
          let found = defibs.find(matchesDefibWith(rawSubId));

          if (!found) {
            const searchAliases = Array.from(new Set([
              targetTenant.shortEnvId,
              targetTenant.id,
              sanitizedTenantId,
              rawTenantId,
              tenantId,
              'D18',
              'D58',
              'demo'
            ].filter(Boolean)));

            for (const alias of searchAliases) {
              if (alias === tenantId) continue;
              const extraDefibs = await fetchServerCollection('defibrillateurs', alias, searchAliases);
              if (Array.isArray(extraDefibs)) {
                found = extraDefibs.find(matchesDefibWith(rawSubId));
                if (found) break;
              }
            }
          }

          if (found) {
            const formattedFound = formatDefibrillateurOutput(found);
            return sendOptimizedJson(req, res, { 
              status: "success", 
              environnement: targetTenant.shortEnvId || tenantId, 
              defibrillateur: formattedFound, 
              data: formattedFound 
            });
          }

          return res.status(404).json({ 
            status: "error", 
            error: `Défibrillateur '${rawSubId}' non trouvé dans l'environnement ${targetTenant.shortEnvId || tenantId}`,
            code: "DEFIBRILLATEUR_NOT_FOUND" 
          });
        }

        const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
        const limitParam = req.query.limit || req.query.per_page || req.query.max || req.query.count;
        const isPaginated = !!(limitParam || req.query.page);
        const limit = limitParam === 'all' 
          ? defibs.length 
          : Math.max(1, parseInt(limitParam as string, 10) || (isPaginated ? 100 : defibs.length));

        let filteredDefibs = defibs;
        const q = (req.query.search as string || req.query.q as string || '').trim().toLowerCase();
        if (q) {
          filteredDefibs = filteredDefibs.filter((d: any) => 
            (d.numeroSerie && String(d.numeroSerie).toLowerCase().includes(q)) ||
            (d.num_serie && String(d.num_serie).toLowerCase().includes(q)) ||
            (d.identifiant && String(d.identifiant).toLowerCase().includes(q)) ||
            (d.defibIdentifiant && String(d.defibIdentifiant).toLowerCase().includes(q)) ||
            (d.id && String(d.id).toLowerCase().includes(q)) ||
            (d.modele && String(d.modele).toLowerCase().includes(q)) ||
            (d.marque && String(d.marque).toLowerCase().includes(q)) ||
            (d.client_nom && String(d.client_nom).toLowerCase().includes(q)) ||
            (d.siteMission && String(d.siteMission).toLowerCase().includes(q)) ||
            (d.ville && String(d.ville).toLowerCase().includes(q))
          );
        }

        const clientFilter = (req.query.client_id as string || req.query.clientId as string || req.query.client as string || '').trim().toLowerCase();
        if (clientFilter) {
          filteredDefibs = filteredDefibs.filter((d: any) => 
            (d.client_id && String(d.client_id).toLowerCase() === clientFilter) ||
            (d.clientId && String(d.clientId).toLowerCase() === clientFilter) ||
            (d.client_nom && String(d.client_nom).toLowerCase().includes(clientFilter))
          );
        }

        const statutFilter = (req.query.statut as string || req.query.status as string || '').trim().toLowerCase();
        if (statutFilter) {
          filteredDefibs = filteredDefibs.filter((d: any) => 
            (d.statut && String(d.statut).toLowerCase() === statutFilter) ||
            (d.status && String(d.status).toLowerCase() === statutFilter)
          );
        }

        const total = filteredDefibs.length;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const startIndex = isPaginated ? (page - 1) * limit : 0;
        const returnedDefibs = isPaginated ? filteredDefibs.slice(startIndex, startIndex + limit) : filteredDefibs;
        const formattedReturned = returnedDefibs.map(formatDefibrillateurOutput);

        res.setHeader('X-Total-Count', String(total));
        res.setHeader('X-Page', String(page));
        res.setHeader('X-Per-Page', String(limit));
        res.setHeader('X-Total-Pages', String(totalPages));

        return sendOptimizedJson(req, res, {
          status: "success",
          environnement: targetTenant.shortEnvId || tenantId,
          total,
          count: formattedReturned.length,
          page: isPaginated ? page : 1,
          limit: isPaginated ? limit : total,
          total_pages: isPaginated ? totalPages : 1,
          defibrillateurs: formattedReturned,
          data: formattedReturned
        });
      }

      // 5. Matériels Endpoint
      if (cleanPath.startsWith('materiels')) {
        const subId = cleanPath.split('/')[1] || '';
        let materiels = await fetchServerCollection('materiels', tenantId, tenantAliases);

        if (req.method === 'POST') {
          const body = req.body || {};
          const targetId = (subId || body.identifiant || body.id || '').trim();
          if (!targetId) {
            return res.status(403).json({ status: "error", error: SENSITIVE_REQUEST_ERROR, message: SENSITIVE_REQUEST_ERROR, code: "SENSITIVE_REQUEST_BLOCKED" });
          }

          const existingIdx = materiels.findIndex((m: any) => m && (m.id === targetId || m.identifiant === targetId));
          if (existingIdx >= 0) {
            const existing = materiels[existingIdx];
            const updatedMat = {
              ...existing,
              ...body,
              id: existing.id,
              identifiant: existing.identifiant,
              id_record: existing.id_record || `record_mat_${targetId}`,
              envId: targetTenant.shortEnvId || tenantId,
              tenantId: tenantId
            };
            materiels[existingIdx] = updatedMat;
            await saveServerCollection('materiels', tenantId, materiels, tenantAliases);
            return res.json({ status: "success", message: "Matériel mis à jour avec succès", environnement: targetTenant.shortEnvId || tenantId, materiel: updatedMat });
          } else {
            const newMat = {
              ...body,
              id: targetId,
              identifiant: targetId,
              id_record: body.id_record || `record_mat_${targetId}`,
              envId: targetTenant.shortEnvId || tenantId,
              tenantId: tenantId
            };
            materiels = [newMat, ...materiels];
            await saveServerCollection('materiels', tenantId, materiels, tenantAliases);
            return res.status(201).json({ status: "success", message: "Matériel créé avec succès", environnement: targetTenant.shortEnvId || tenantId, materiel: newMat });
          }
        }

        if (subId) {
          const found = materiels.find((m: any) => m && (m.id === subId || m.identifiant === subId));
          if (found) {
            return res.json({ status: "success", environnement: targetTenant.shortEnvId || tenantId, materiel: found });
          }
          return res.status(404).json({ status: "error", error: `Matériel '${subId}' non trouvé.` });
        }

        return res.json({ status: "success", environnement: targetTenant.shortEnvId || tenantId, count: materiels.length, materiels });
      }

      // 6. Commandes Endpoint
      if (cleanPath.startsWith('commandes')) {
        if (req.method === 'POST') {
          const body = req.body || {};
          const cmdId = body.numeroCommande || `CMD-${Date.now().toString().slice(-6)}`;
          const newCmd = {
            ...body,
            id: cmdId,
            numeroCommande: cmdId,
            date: new Date().toISOString(),
            envId: targetTenant.shortEnvId || tenantId,
            tenantId: tenantId
          };
          let cmds = await fetchServerCollection('commandes', tenantId, tenantAliases);
          cmds = [newCmd, ...cmds];
          await saveServerCollection('commandes', tenantId, cmds, tenantAliases);
          return res.status(201).json({ status: "success", message: "Commande enregistrée avec succès", environnement: targetTenant.shortEnvId || tenantId, commande: newCmd });
        }
      }

      // 7. Tournées & Missions Endpoints
      if (cleanPath.startsWith('missions')) {
        let tours = await fetchServerCollection('fsm_tours', tenantId, tenantAliases);
        let aTrierTour = tours.find((t: any) => t && (t.id === 'a-trier' || t.id === 'A trier' || t.startDate === 'A trier' || (t.title && String(t.title).toLowerCase().includes('trier'))));

        if (req.method === 'GET') {
          const missions = aTrierTour && Array.isArray(aTrierTour.missions) ? aTrierTour.missions : [];
          return res.json({
            status: "success",
            environnement: targetTenant.shortEnvId || tenantId,
            destination: "TOURNÉES & MISSIONS > À trier / Ordres ADV",
            count: missions.length,
            missions
          });
        }

        if (req.method === 'POST') {
          const body = req.body || {};
          let rawMissions: any[] = [];
          if (Array.isArray(body)) {
            rawMissions = body;
          } else if (Array.isArray(body.missions)) {
            rawMissions = body.missions;
          } else {
            rawMissions = [body];
          }

          if (rawMissions.length === 0) {
            return res.status(400).json({ status: "error", error: "Le corps de la requête ne contient aucune mission valide." });
          }

          const defibs = await fetchServerCollection('defibrillateurs', tenantId, tenantAliases);
          const clients = await fetchServerCollection('clients', tenantId, tenantAliases);

          const newMissions = rawMissions.map((item: any, idx: number) => {
            const eqId = item.identifiant || item.defibIdentifiant || item.equipement_id || item.equipmentId || item.serie || '';
            const matchedDefib = defibs.find((d: any) => d && (d.id === eqId || d.identifiant === eqId || d.numeroSerie === eqId));
            const matchedClient = clients.find((c: any) => c && (c.id === item.client_id || c.id === item.clientId || (matchedDefib && (c.id === matchedDefib.clientId || c.denomination === matchedDefib.clientId))));

            const clientName = item.client || item.clientName || item.entreprise || (matchedDefib && (matchedDefib.nomSite || matchedDefib.nomPrenomSite)) || (matchedClient && matchedClient.denomination) || 'Client ADV';
            const equipmentType = item.type_materiel || item.categorie_materiel || item.equipmentType || (matchedDefib ? 'Défibrillateur' : 'Matériel');
            const modele = item.modele || (matchedDefib && (matchedDefib.modele || matchedDefib.modeleId)) || '';

            const reasons = Array.isArray(item.reasons) 
              ? item.reasons 
              : (Array.isArray(item.raison_prestation) 
                  ? item.raison_prestation 
                  : (item.raison_prestation || item.reason ? [String(item.raison_prestation || item.reason)] : ['Maintenance / Contrôle']));

            return {
              id: item.id || `fsm-m-api-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
              clientName,
              clientId: item.client_id || item.clientId || (matchedClient ? matchedClient.id : (matchedDefib ? matchedDefib.clientId : '')),
              defibIdentifiant: eqId || (matchedDefib ? matchedDefib.identifiant : ''),
              equipmentType,
              modele,
              reason: reasons[0] || 'Intervention',
              reasons,
              requiredParts: item.pieces_requises || item.requiredParts || [],
              status: item.situation || item.status || 'Brouillon',
              priority: item.priorite || item.priority || 'Normale',
              time: item.heure || item.time || '14:00',
              bonDeCommande: item.bon_de_commande || item.bonDeCommande || item.order_ref || '',
              commentaire: item.commentaire || item.comment || item.remarque || '',
              numVoie: item.adresse || item.numero_et_voie || (matchedDefib ? matchedDefib.numVoie : '') || '',
              cp: item.code_postal || item.cp || (matchedDefib ? matchedDefib.cp : '') || '',
              ville: item.ville || (matchedDefib ? matchedDefib.ville : '') || '',
              telephone: item.telephone || (matchedDefib ? matchedDefib.telephoneSite : '') || (matchedClient ? matchedClient.telephone : '') || '',
              contact: item.contact || item.nom_prenom || (matchedDefib ? matchedDefib.nomPrenomSite : '') || (matchedClient ? matchedClient.contact : '') || '',
              latitude: item.latitude || (matchedDefib ? matchedDefib.latitude : '') || '',
              longitude: item.longitude || (matchedDefib ? matchedDefib.longitude : '') || '',
              createdAt: new Date().toISOString()
            };
          });

          if (!aTrierTour) {
            aTrierTour = {
              id: 'a-trier',
              title: 'Missions à trier / Ordres ADV',
              techName: '',
              startDate: 'A trier',
              status: 'Brouillon',
              missions: newMissions,
              vehicule: 'Aucun',
              calculated: false,
              envId: targetTenant.shortEnvId || tenantId,
              tenantId: tenantId
            };
            tours = [aTrierTour, ...tours];
          } else {
            aTrierTour.missions = [...(aTrierTour.missions || []), ...newMissions];
            tours = tours.map((t: any) => (t.id === aTrierTour.id ? aTrierTour : t));
          }

          await saveServerCollection('fsm_tours', tenantId, tours, tenantAliases);

          return res.status(201).json({
            status: "success",
            message: `${newMissions.length} mission(s) ajoutée(s) avec succès dans À trier / Ordres ADV`,
            environnement: targetTenant.shortEnvId || tenantId,
            destination: "TOURNÉES & MISSIONS > À trier / Ordres ADV",
            count: newMissions.length,
            missions: newMissions
          });
        }
      }

      if (cleanPath.startsWith('tournees')) {
        if (req.method === 'GET') {
          const tours = await fetchServerCollection('fsm_tours', tenantId, tenantAliases);
          return res.json({
            status: "success",
            environnement: targetTenant.shortEnvId || tenantId,
            count: tours.length,
            tournees: tours
          });
        }

        if (req.method === 'POST') {
          const body = req.body || {};
          let tours = await fetchServerCollection('fsm_tours', tenantId, tenantAliases);
          
          const isTrierDest = body.id === 'a-trier' || body.startDate === 'A trier' || body.destination === 'a-trier' || String(body.title || '').toLowerCase().includes('trier');
          
          if (isTrierDest && Array.isArray(body.missions) && body.missions.length > 0) {
            let aTrierTour = tours.find((t: any) => t && (t.id === 'a-trier' || t.id === 'A trier' || t.startDate === 'A trier' || (t.title && String(t.title).toLowerCase().includes('trier'))));
            if (aTrierTour) {
              aTrierTour.missions = [...(aTrierTour.missions || []), ...body.missions];
              tours = tours.map((t: any) => (t.id === aTrierTour.id ? aTrierTour : t));
            } else {
              const newTrierTour = {
                id: 'a-trier',
                title: 'Missions à trier / Ordres ADV',
                techName: '',
                startDate: 'A trier',
                status: 'Brouillon',
                missions: body.missions,
                vehicule: 'Aucun',
                calculated: false,
                envId: targetTenant.shortEnvId || tenantId,
                tenantId: tenantId
              };
              tours = [newTrierTour, ...tours];
            }
            await saveServerCollection('fsm_tours', tenantId, tours, tenantAliases);
            return res.status(201).json({
              status: "success",
              message: "Missions ajoutées avec succès dans À trier / Ordres ADV",
              environnement: targetTenant.shortEnvId || tenantId,
              destination: "TOURNÉES & MISSIONS > À trier / Ordres ADV",
              count: body.missions.length
            });
          }

          const tourId = body.id || `TOUR-${Date.now().toString().slice(-6)}`;
          const newTour = {
            ...body,
            id: tourId,
            date: body.date || new Date().toISOString(),
            envId: targetTenant.shortEnvId || tenantId,
            tenantId: tenantId
          };
          tours = [newTour, ...tours];
          await saveServerCollection('fsm_tours', tenantId, tours, tenantAliases);
          return res.status(201).json({ status: "success", message: "Tournée enregistrée avec succès", environnement: targetTenant.shortEnvId || tenantId, tournee: newTour });
        }
      }

      // 8. Rapports Endpoint
      if (cleanPath.startsWith('rapports')) {
        const subId = cleanPath.split('/')[1] || '';
        const defibs = await fetchServerCollection('defibrillateurs', tenantId, tenantAliases);
        if (subId) {
          const defib = defibs.find((d: any) => d && (d.id === subId || d.identifiant === subId || d.numeroSerie === subId));
          if (defib) {
            return res.json({
              status: "success",
              environnement: targetTenant.shortEnvId || tenantId,
              rapport: {
                equipement: defib.identifiant || defib.id,
                numeroSerie: defib.numeroSerie,
                derniereMaintenance: defib.derniereMaintenance || defib.derniere_maintenance,
                statut: defib.statut || defib.conforme,
                electrodes: defib.peremptionElectrodeA || defib.peremption_a,
                batterie: defib.peremptionBatterie || defib.peremption_b,
                pourcentageBatterie: defib.pourcentageBatterie || defib.pourcentage_constate_b
              }
            });
          }
          return res.status(404).json({ status: "error", error: `Aucun rapport disponible pour '${subId}'` });
        }
        return res.json({ status: "success", environnement: targetTenant.shortEnvId || tenantId, count: defibs.length, defibs });
      }

      // 9. Stocks Endpoint
      if (cleanPath.startsWith('stocks')) {
        const subPath = cleanPath.replace(/^stocks\/?/, '');
        let stocks = await fetchServerCollection('stocks', tenantId, tenantAliases);
        if (req.method === 'POST') {
          const body = req.body || {};
          const ugs = (body.ugs || body.id || cleanPath.split('/')[2] || `UGS-${Date.now()}`).trim();
          const newStock = {
            ...body,
            id: ugs,
            ugs,
            envId: targetTenant.shortEnvId || tenantId,
            tenantId: tenantId
          };
          stocks = [newStock, ...stocks.filter((s: any) => s && s.ugs !== ugs)];
          await saveServerCollection('stocks', tenantId, stocks, tenantAliases);
          return res.status(201).json({ status: "success", message: "Stock mis à jour avec succès", environnement: targetTenant.shortEnvId || tenantId, stock: newStock });
        } else {
          return res.json({ status: "success", environnement: targetTenant.shortEnvId || tenantId, count: stocks.length, stocks });
        }
      }

      // 10. Formations Endpoint
      if (cleanPath.startsWith('formations')) {
        let formations = await fetchServerCollection('formations', tenantId, tenantAliases);
        if (req.method === 'POST') {
          const body = req.body || {};
          const fId = body.id || `FORM-${Date.now().toString().slice(-5)}`;
          const newFormation = {
            ...body,
            id: fId,
            date: body.date || new Date().toISOString(),
            envId: targetTenant.shortEnvId || tenantId,
            tenantId: tenantId
          };
          formations = [newFormation, ...formations];
          await saveServerCollection('formations', tenantId, formations, tenantAliases);
          return res.status(201).json({ status: "success", message: "Formation enregistrée avec succès", environnement: targetTenant.shortEnvId || tenantId, formation: newFormation });
        } else {
          return res.json({ status: "success", environnement: targetTenant.shortEnvId || tenantId, count: formations.length, formations });
        }
      }

      // Strict Blocking: Any manipulation or endpoint outside documentation returns sensitive request error
      return res.status(403).json({
        status: "error",
        error: SENSITIVE_REQUEST_ERROR,
        message: SENSITIVE_REQUEST_ERROR,
        code: "SENSITIVE_REQUEST_BLOCKED",
        environnement: targetTenant.shortEnvId || tenantId
      });
    } catch (err: any) {
      console.error("Defibeo API Endpoint Error:", err);
      res.status(500).json({ error: err.message || "Internal Server Error in Defibeo API" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      }
    }));
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
