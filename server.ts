import express from "express";
import path from "path";
import fs from "fs";
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
      }
    }
  }
} catch (e) {
  console.warn("Failed to load server disk store:", e);
}

function persistServerStoreToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const obj: Record<string, any[]> = {};
    for (const [k, v] of serverMemoryStore.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (e) {
    console.warn("Failed to persist server disk store:", e);
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

      return (
        tId === normId ||
        tShort === normId ||
        (pureNormId && pureTId && pureTId === pureNormId) ||
        (pureNormId && pureTShort && pureTShort === pureNormId) ||
        (pureNormId && tId === `d${pureNormId}`) ||
        (pureNormId && tShort === `d${pureNormId}`) ||
        (cleanNormName && tName && (tName.includes(cleanNormName) || cleanNormName.includes(tName))) ||
        (tEmail && (tEmail === normId || tEmail.startsWith(normId)))
      );
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
  if (collectionName === 'generatedReports' || collectionName === 'generated_reports' || collectionName === 'reports') {
    aliases.push('generatedReports', 'generated_reports', 'reports');
  } else if (collectionName === 'fsmTours' || collectionName === 'fsm_tours' || collectionName === 'tours') {
    aliases.push('fsmTours', 'fsm_tours', 'tours');
  } else if (collectionName === 'tickets' || collectionName === 'support_tickets') {
    aliases.push('tickets', 'support_tickets');
  } else if (collectionName === 'commercialDocs' || collectionName === 'commercial_docs') {
    aliases.push('commercialDocs', 'commercial_docs');
  } else if (collectionName === 'gedDocs' || collectionName === 'ged_docs') {
    aliases.push('gedDocs', 'ged_docs');
  } else if (collectionName === 'customerReviews' || collectionName === 'customer_reviews') {
    aliases.push('customerReviews', 'customer_reviews');
  } else if (collectionName === 'pointages' || collectionName === 'pointages_history') {
    aliases.push('pointages', 'pointages_history');
  } else if (collectionName === 'pointagesAutoVigilance' || collectionName === 'pointages_auto_vigilance') {
    aliases.push('pointagesAutoVigilance', 'pointages_auto_vigilance');
  } else if (collectionName === 'otherEquipments' || collectionName === 'other_equipments') {
    aliases.push('otherEquipments', 'other_equipments');
  } else if (collectionName === 'distributed_stocks' || collectionName === 'distributedStocks') {
    aliases.push('distributed_stocks', 'distributedStocks');
  } else if (collectionName === 'achats_fournisseurs' || collectionName === 'achatsFournisseurs') {
    aliases.push('achats_fournisseurs', 'achatsFournisseurs');
  } else if (collectionName === 'companyInfo' || collectionName === 'company_info') {
    aliases.push('companyInfo', 'company_info');
  }
  return Array.from(new Set(aliases));
}

// Helper function to read a collection from Firestore with support for chunked documents, multiple aliases and memory caching
async function fetchServerCollection(colName: string, tenantId: string, extraAliases: (string | undefined | null)[] = []): Promise<any[]> {
  const sanitizeForTenant = (items: any): any => {
    if (!Array.isArray(items)) return items;
    const isDemo = !tenantId || tenantId === 'demo';
    const cleanTid = (tenantId || 'demo').trim().toLowerCase();

    return items.filter((item: any) => {
      if (!item || typeof item !== 'object') return true;
      const itemEnv = (item.envId || item.tenantId || '').trim().toLowerCase();

      if (isDemo) {
        if (itemEnv && itemEnv !== 'demo') return false;
        return true;
      }

      if (itemEnv && itemEnv !== cleanTid) {
        return false;
      }

      if (colName === 'commercialDocs' || colName === 'commercial_docs') {
        if (!itemEnv && item.clientDenomination && (item.clientDenomination.includes('Medical360') || item.clientDenomination.includes('SecoursProOuest'))) {
          return false;
        }
      } else if (colName === 'fsmTours' || colName === 'fsm_tours' || colName === 'tours') {
        if (item.id === 'fsm-tour-demo' || item.techName === 'Jakub Démo') return false;
      } else if (colName === 'clients') {
        if (!itemEnv && item.id === 'c1' && item.denomination === 'Secours Pro Ouest') return false;
      } else if (colName === 'notifications') {
        if (item.id === 'conn-2' || item.id === 'conn-3' || (item.title && item.title.includes('admin@defibeo.com vient s’est connecté'))) return false;
      }

      return true;
    });
  };

  const colAliases = getCollectionNameAliases(colName);
  const rawKeys: string[] = [];
  const activeTenant = (tenantId || 'demo').trim();
  
  if (activeTenant === 'demo') {
    for (const c of colAliases) {
      rawKeys.push(c, `demo_${c}`);
    }
  } else {
    for (const c of colAliases) {
      rawKeys.push(`${activeTenant}_${c}`);
    }
  }

  // Deduplicate keys
  const collectionKeys = Array.from(new Set(rawKeys.filter(Boolean)));

  // 1. Check memory store first for populated list
  for (const collectionKey of collectionKeys) {
    if (serverMemoryStore.has(collectionKey)) {
      const memItems = serverMemoryStore.get(collectionKey);
      if (Array.isArray(memItems) && memItems.length > 0) {
        return sanitizeForTenant(memItems);
      }
    }
  }

  // 2. Query Firestore with chunk auto-discovery across candidate keys
  for (const collectionKey of collectionKeys) {
    try {
      const docRef = doc(db, 'appData', collectionKey);
      const snap = await withTimeout(getDoc(docRef), 10000, null);
      if (snap && snap.exists()) {
        const payload = snap.data();
        let isChunked = payload._chunked && typeof payload.chunksCount === 'number';
        let chunksCount = payload.chunksCount || 0;

        if (!isChunked) {
          // Auto-discovery of chunk_0
          try {
            const c0Ref = doc(db, 'appData', `${collectionKey}_chunk_0`);
            const c0Snap = await withTimeout(getDoc(c0Ref), 3000, null);
            if (c0Snap && c0Snap.exists()) {
              isChunked = true;
              chunksCount = 30;
            }
          } catch (_) {}
        }

        if (isChunked) {
          const chunkPromises = [];
          for (let i = 0; i < (chunksCount || 30); i++) {
            const chunkRef = doc(db, 'appData', `${collectionKey}_chunk_${i}`);
            chunkPromises.push(withTimeout(getDoc(chunkRef), 10000, null));
          }
          const chunkSnaps = await Promise.all(chunkPromises);
          let combined: any[] = [];
          for (const cSnap of chunkSnaps) {
            if (cSnap && cSnap.exists()) {
              const cData = cSnap.data();
              if (Array.isArray(cData.value)) {
                combined.push(...cData.value);
              }
            }
          }
          if (combined.length > 0) {
            const sanitized = sanitizeForTenant(combined);
            for (const ck of collectionKeys) {
              serverMemoryStore.set(ck, sanitized);
            }
            persistServerStoreToDisk();
            return sanitized;
          }
        } else if (payload.value !== undefined && payload.value !== null) {
          if (!Array.isArray(payload.value) || payload.value.length > 0) {
            const sanitized = sanitizeForTenant(payload.value);
            for (const ck of collectionKeys) {
              serverMemoryStore.set(ck, sanitized);
            }
            persistServerStoreToDisk();
            return sanitized;
          }
        }
      }
    } catch (err) {
      // Graceful fallback
    }
  }

  // 3. Fallback to in-memory store (prefer non-empty)
  for (const collectionKey of collectionKeys) {
    if (serverMemoryStore.has(collectionKey)) {
      const val = serverMemoryStore.get(collectionKey);
      if (val !== undefined && val !== null && (!Array.isArray(val) || val.length > 0)) {
        return sanitizeForTenant(val);
      }
    }
  }
  for (const collectionKey of collectionKeys) {
    if (serverMemoryStore.has(collectionKey)) {
      return sanitizeForTenant(serverMemoryStore.get(collectionKey));
    }
  }
  return [];
}

// Helper function to persist collection to Firestore and in-memory store
async function saveServerCollection(colName: string, tenantId: string, items: any, extraAliases: (string | undefined | null)[] = []): Promise<void> {
  const collectionKey = tenantId === 'demo' ? colName : `${tenantId}_${colName}`;
  serverMemoryStore.set(collectionKey, items);
  for (const a of extraAliases) {
    if (a && typeof a === 'string' && a.trim() && a !== tenantId) {
      serverMemoryStore.set(`${a.trim()}_${colName}`, items);
    }
  }
  persistServerStoreToDisk();
  try {
    const docRef = doc(db, 'appData', collectionKey);
    withTimeout(setDoc(docRef, { value: items }), 4000, null).catch(() => {});
  } catch (err) {
    // Keep in memory if network offline
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
      const rawTenant = String(tenantId).trim();
      const collectionKey = rawTenant === 'demo' ? collectionName : `${rawTenant}_${collectionName}`;
      
      if (value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0)) {
        serverMemoryStore.set(collectionKey, value);
        // Also map normalized key if D-prefixed
        if (/^d\d+$/i.test(rawTenant)) {
          const numOnly = rawTenant.replace(/^d/i, '');
          serverMemoryStore.set(`D${numOnly}_${collectionName}`, value);
          serverMemoryStore.set(`${numOnly}_${collectionName}`, value);
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

  // API health route
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Defibeo Operational REST API v1
  app.all(["/v1/*", "/api/v1/*"], async (req, res) => {
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

      const tenantId = targetTenant.id;
      const tenantAliases = [targetTenant.shortEnvId, targetTenant.id, sanitizedTenantId, rawTenantId].filter(Boolean);

      // Variables Endpoint
      if (cleanPath.startsWith('variables')) {
        // Strict blocking: Prohibit deletion of system variables and settings via API DEFIBEO
        const isDeleteAction = 
          req.method === 'DELETE' || 
          req.query.action === 'delete' || 
          req.query.action === 'supprimer' || 
          req.query.delete === 'true' ||
          (req.body && (
            req.body.action === 'delete' || 
            req.body.action === 'supprimer' || 
            req.body.delete === true || 
            req.body.supprimer === true ||
            req.body._method === 'DELETE'
          ));

        if (isDeleteAction) {
          return res.status(403).json({
            status: "error",
            error: "Suppression interdite : La suppression des variables système et de configuration via l'API DEFIBEO est strictement bloquée pour préserver la stabilité et l'intégrité de l'environnement.",
            code: "VARIABLE_DELETION_PROHIBITED",
            message: "Action non autorisée : Les variables ne peuvent pas être supprimées via l'API DEFIBEO.",
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

      // CRM Tickets Endpoint
      if (cleanPath.startsWith('crm/tickets')) {
        if (req.method === 'POST') {
          const { categorie, situation, criticite, objet, client_id, collaborateur, description } = req.body;
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
            identifiant: client_id || "",
            objet: objet || "Ticket API Defibeo",
            message: description || "",
            status: situation || "Nouveau",
            criticite: criticite || "Normale",
            categorie: categorie || "Technique",
            collaborateur: collaborateur || "",
            date: new Date().toISOString().replace('T', ' ').substring(0, 19),
            envId: tenantId
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

      // Clients Endpoint
      if (cleanPath.startsWith('clients')) {
        // Strict blocking: Prohibit deletion of clients via API DEFIBEO
        const isDeleteAction = 
          req.method === 'DELETE' || 
          req.query.action === 'delete' || 
          req.query.action === 'supprimer' || 
          req.query.delete === 'true' ||
          (req.body && (
            req.body.action === 'delete' || 
            req.body.action === 'supprimer' || 
            req.body.delete === true || 
            req.body.supprimer === true ||
            req.body._method === 'DELETE'
          ));

        if (isDeleteAction) {
          return res.status(403).json({
            status: "error",
            error: "Suppression interdite : La suppression des clients via l'API DEFIBEO est strictement bloquée pour des raisons de conformité, traçabilité et intégrité des données comptables et contractuelles.",
            code: "CLIENT_DELETION_PROHIBITED",
            message: "Action non autorisée : Les clients ne peuvent pas être supprimés via l'API DEFIBEO.",
            environnement: targetTenant.shortEnvId || tenantId
          });
        }

        let clients = await fetchServerCollection('clients', tenantId, tenantAliases);

        if (req.method === 'POST') {
          const body = req.body || {};
          const newClientId = body.id || body.reference || body.identifiantUnique || `CLI-${Date.now().toString().slice(-4)}`;
          const newClient = {
            id: newClientId,
            nom: body.nom || body.name || "Nouveau Client",
            reference: body.reference || newClientId,
            email: body.email || "",
            telephone: body.telephone || body.phone || "",
            adresse: body.adresse || body.address || "",
            ville: body.ville || body.city || "",
            code_postal: body.code_postal || body.codePostal || body.zip || "",
            ...body
          };

          const existingIdx = clients.findIndex((c: any) => c.id === newClientId || c.reference === newClientId);
          if (existingIdx >= 0) {
            clients[existingIdx] = { ...clients[existingIdx], ...newClient };
          } else {
            clients = [newClient, ...clients];
          }

          await saveServerCollection('clients', tenantId, clients, tenantAliases);

          return res.status(201).json({
            status: "success",
            message: "Client enregistré avec succès",
            environnement: targetTenant.shortEnvId || tenantId,
            id: newClientId,
            client: newClient,
            data: newClient
          });
        }

        const subId = cleanPath.split('/')[1];
        if (subId) {
          const found = clients.find((c: any) => c.id === subId || c.identifiantUnique === subId || c.nom === subId || c.reference === subId);
          if (found) {
            return res.json({ status: "success", environnement: targetTenant.shortEnvId || tenantId, client: found, data: found });
          }
          return res.status(404).json({ status: "error", error: `Client '${subId}' non trouvé dans l'environnement ${targetTenant.shortEnvId || tenantId}` });
        }

        return res.json({
          status: "success",
          environnement: targetTenant.shortEnvId || tenantId,
          count: clients.length,
          total: clients.length,
          clients,
          data: clients
        });
      }

      // Defibrillateurs Endpoint
      if (cleanPath.startsWith('defibrillateurs')) {
        // Strict blocking: Prohibit deletion of defibrillators via API DEFIBEO
        const isDeleteAction = 
          req.method === 'DELETE' || 
          req.query.action === 'delete' || 
          req.query.action === 'supprimer' || 
          req.query.delete === 'true' ||
          (req.body && (
            req.body.action === 'delete' || 
            req.body.action === 'supprimer' || 
            req.body.delete === true || 
            req.body.supprimer === true ||
            req.body._method === 'DELETE'
          ));

        if (isDeleteAction) {
          return res.status(403).json({
            status: "error",
            error: "Suppression interdite : La suppression des défibrillateurs via l'API DEFIBEO est strictement bloquée pour des raisons de conformité, traçabilité et intégrité des données de sécurité sanitaire.",
            code: "DEFIBRILLATEUR_DELETION_PROHIBITED",
            message: "Action non autorisée : Les défibrillateurs ne peuvent pas être supprimés via l'API DEFIBEO.",
            environnement: targetTenant.shortEnvId || tenantId
          });
        }

        let defibs = await fetchServerCollection('defibrillateurs', tenantId, tenantAliases);

        if (req.method === 'POST') {
          const body = req.body || {};
          const newId = body.identifiant || body.id || body.numeroSerie || `DAE-${Date.now().toString().slice(-4)}`;
          const newDefib = {
            id: newId,
            identifiant: newId,
            modele: body.modele || body.model || "DAE Standard",
            marque: body.marque || body.brand || "Standard",
            numeroSerie: body.numeroSerie || body.num_serie || body.serial || newId,
            num_serie: body.num_serie || body.numeroSerie || newId,
            statut: body.statut || body.status || "Opérationnel",
            client_nom: body.client_nom || body.clientNom || body.client || "",
            client_id: body.client_id || body.clientId || "",
            adresse: body.adresse || body.address || "",
            ville: body.ville || body.city || "",
            code_postal: body.code_postal || body.codePostal || body.zip || "",
            date_peremption_electrodes: body.date_peremption_electrodes || body.electrodes || "",
            date_peremption_pile: body.date_peremption_pile || body.pile || "",
            ...body
          };

          const existingIdx = defibs.findIndex((d: any) => d.id === newId || d.identifiant === newId || d.numeroSerie === newId);
          if (existingIdx >= 0) {
            defibs[existingIdx] = { ...defibs[existingIdx], ...newDefib };
          } else {
            defibs = [newDefib, ...defibs];
          }

          await saveServerCollection('defibrillateurs', tenantId, defibs, tenantAliases);

          return res.status(201).json({
            status: "success",
            message: "Défibrillateur enregistré avec succès",
            environnement: targetTenant.shortEnvId || tenantId,
            id: newId,
            defibrillateur: newDefib,
            data: newDefib
          });
        }

        const subId = cleanPath.split('/')[1];
        if (subId) {
          let found = defibs.find((d: any) => 
            d.id === subId || 
            d.identifiant === subId || 
            d.numeroSerie === subId || 
            d.num_serie === subId ||
            (d.identifiant && d.identifiant.toLowerCase() === subId.toLowerCase()) ||
            (d.numeroSerie && d.numeroSerie.toLowerCase() === subId.toLowerCase())
          );

          // If not found in current tenant partition, check standard demo database as fallback
          if (!found && tenantId !== 'demo') {
            const demoDefibs = await fetchServerCollection('defibrillateurs', 'demo');
            found = demoDefibs.find((d: any) => 
              d.id === subId || 
              d.identifiant === subId || 
              d.numeroSerie === subId || 
              d.num_serie === subId ||
              (d.identifiant && d.identifiant.toLowerCase() === subId.toLowerCase()) ||
              (d.numeroSerie && d.numeroSerie.toLowerCase() === subId.toLowerCase())
            );
          }

          if (found) {
            return res.json({ status: "success", environnement: targetTenant.shortEnvId || tenantId, defibrillateur: found, data: found });
          }
          return res.status(404).json({ 
            status: "error", 
            error: `Défibrillateur '${subId}' non trouvé dans l'environnement ${targetTenant.shortEnvId || tenantId}`,
            code: "DEFIBRILLATEUR_NOT_FOUND" 
          });
        }

        return res.json({
          status: "success",
          environnement: targetTenant.shortEnvId || tenantId,
          count: defibs.length,
          total: defibs.length,
          defibrillateurs: defibs,
          data: defibs
        });
      }

      // Default fallback endpoint info
      return res.json({
        status: "success",
        message: "API Defibeo Operational Endpoint",
        endpoint: cleanPath,
        environnement: tenantId,
        timestamp: new Date().toISOString()
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
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
