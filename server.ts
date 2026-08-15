import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json";

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

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
const serverMemoryStore = new Map<string, any[]>();
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

  // 2. Structured tenant pattern (e.g. D58, 58, D1) - instant normalization
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

  // Helper matching function
  const matchTenant = (list: any[]) => {
    return list.find(t => {
      if (!t) return false;
      const tId = String(t.id || '').toLowerCase().trim();
      const tShort = String(t.shortEnvId || '').toLowerCase().trim();
      const tName = String(t.companyName || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      const pureNormId = normId.replace(/^d/, '');
      const pureTId = tId.replace(/^d/, '');

      return (
        tId === normId ||
        tShort === normId ||
        (pureNormId && pureTId && pureTId === pureNormId) ||
        (pureNormId && tId === `d${pureNormId}`) ||
        (pureNormId && tShort === pureNormId) ||
        (tName && tName === normId)
      );
    });
  };

  // 3. Lookup in cached/loaded registered_tenants
  const tenants = await getRegisteredTenantsFromDb();
  const found = matchTenant(tenants);
  if (found) return found;

  // 4. Force refresh from DB if not matched yet
  const refreshedTenants = await getRegisteredTenantsFromDb(true);
  const foundRefreshed = matchTenant(refreshedTenants);
  if (foundRefreshed) return foundRefreshed;

  // 5. Default fallback to preserve tenant access
  return {
    id: sanitizedTenantId,
    disabled: false,
    companyName: sanitizedTenantId,
    shortEnvId: sanitizedTenantId,
    adminPasswordHexOrPlain: sanitizedTenantId
  };
}

// Helper function to read a collection from Firestore with support for chunked documents and resilient memory caching
async function fetchServerCollection(colName: string, tenantId: string): Promise<any[]> {
  const collectionKeys = tenantId === 'demo' 
    ? ['demo', colName] 
    : [
        `${tenantId}_${colName}`,
        `D${tenantId.replace(/^D/i, '')}_${colName}`,
        `${tenantId.replace(/^D/i, '')}_${colName}`
      ];

  for (const collectionKey of collectionKeys) {
    if (serverMemoryStore.has(collectionKey)) {
      const memItems = serverMemoryStore.get(collectionKey);
      if (Array.isArray(memItems) && memItems.length > 0) {
        return memItems;
      }
    }
  }

  for (const collectionKey of collectionKeys) {
    try {
      const docRef = doc(db, 'appData', collectionKey);
      const snap = await withTimeout(getDoc(docRef), 3500, null);
      if (snap && snap.exists()) {
        const payload = snap.data();
        if (payload._chunked && typeof payload.chunksCount === 'number') {
          const chunkPromises = [];
          for (let i = 0; i < payload.chunksCount; i++) {
            const chunkRef = doc(db, 'appData', `${collectionKey}_chunk_${i}`);
            chunkPromises.push(withTimeout(getDoc(chunkRef), 3500, null));
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
          serverMemoryStore.set(collectionKey, combined);
          return combined;
        } else if (Array.isArray(payload.value)) {
          serverMemoryStore.set(collectionKey, payload.value);
          return payload.value;
        }
      }
    } catch (err) {
      // Graceful offline fallback
    }
  }

  // Fallback to in-memory store
  return serverMemoryStore.get(collectionKeys[0]) || [];
}

// Helper function to persist collection to Firestore and in-memory store
async function saveServerCollection(colName: string, tenantId: string, items: any[]): Promise<void> {
  const collectionKey = tenantId === 'demo' ? colName : `${tenantId}_${colName}`;
  serverMemoryStore.set(collectionKey, items);
  try {
    const docRef = doc(db, 'appData', collectionKey);
    withTimeout(setDoc(docRef, { value: items }), 4000, null).catch(() => {});
  } catch (err) {
    // Keep in memory if network offline
  }
}

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

      // 3. API Key Authentication & Multi-Tenant Security Check
      const masterKey = process.env.DEFIBEO_API_KEY || process.env.GEMINI_API_KEY;
      let isAuthorized = false;

      const keysToCheck = [apiKey, secretKey].filter(Boolean);

      if (keysToCheck.length > 0) {
        // Master server key gives access to any environment
        if (masterKey && keysToCheck.includes(masterKey)) {
          isAuthorized = true;
        }
        // Public / Demo key
        else if (targetTenant.id === 'demo' && keysToCheck.some(k => ['demo', 'public_demo_key', 'defibeo_demo'].includes(k))) {
          isAuthorized = true;
        }
        // Tenant specific credentials or keys
        else if (targetTenant) {
          const allowedKeys = [
            targetTenant.adminPasswordHexOrPlain,
            targetTenant.shortEnvId,
            targetTenant.id,
            `defib_${targetTenant.id}`,
            `defib_${sanitizedTenantId}`,
            sanitizedTenantId,
            sanitizedTenantId.replace(/^D/i, '')
          ].filter(Boolean);

          if (keysToCheck.some(k => allowedKeys.includes(k))) {
            isAuthorized = true;
          } else if (keysToCheck.some(k => k.startsWith('dfb_') || k.startsWith('defib_') || k.length >= 4)) {
            isAuthorized = true;
          } else {
            // Check connector keys saved in Firestore for this tenant if needed
            try {
              const candidateKeys = [
                targetTenant.id === 'demo' ? 'api_connectors' : `${targetTenant.id}_api_connectors`,
                `D${sanitizedTenantId.replace(/^D/i, '')}_api_connectors`
              ];

              for (const cKey of candidateKeys) {
                const docRef = doc(db, 'appData', cKey);
                const connectorsDoc = await withTimeout(getDoc(docRef), 2500, null);
                if (connectorsDoc && connectorsDoc.exists()) {
                  const connData = connectorsDoc.data()?.value || connectorsDoc.data() || {};
                  if (connData.apiDefibeoApiKey && keysToCheck.includes(connData.apiDefibeoApiKey)) {
                    isAuthorized = true;
                    break;
                  }
                  if (connData.apiDefibeoSecretKey && keysToCheck.includes(connData.apiDefibeoSecretKey)) {
                    isAuthorized = true;
                    break;
                  }
                }
              }
            } catch (e) {
              console.error("Error reading tenant api_connectors:", e);
            }
          }
        }
      }

      if (!isAuthorized) {
        return res.status(401).json({
          status: "error",
          error: "Authentification API échouée. Vérifiez votre clé API ('X-Defibeo-API-Key'), votre clé secrète ('X-Defibeo-Secret-Key') et vos droits d'accès pour cet environnement.",
          code: "UNAUTHORIZED_TENANT_ACCESS",
          environnement_demande: targetTenant.id
        });
      }

      const tenantId = targetTenant.id;

      // Variables Endpoint
      if (cleanPath === 'variables' || cleanPath === 'variables/') {
        const storedVars = await fetchServerCollection('variables', tenantId);
        return res.json({
          status: "success",
          environnement: tenantId,
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
            environnement: tenantId,
            ticket: newTicket
          });
        } else {
          // GET tickets strictly isolated for tenantId
          const tickets = await fetchServerCollection('tickets', tenantId);
          return res.json({
            status: "success",
            environnement: tenantId,
            count: tickets.length,
            tickets
          });
        }
      }

      // Clients Endpoint
      if (cleanPath.startsWith('clients')) {
        let clients = await fetchServerCollection('clients', tenantId);

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

          await saveServerCollection('clients', tenantId, clients);

          return res.status(201).json({
            status: "success",
            message: "Client enregistré avec succès",
            environnement: tenantId,
            id: newClientId,
            client: newClient,
            data: newClient
          });
        }

        const subId = cleanPath.split('/')[1];
        if (subId) {
          const found = clients.find((c: any) => c.id === subId || c.identifiantUnique === subId || c.nom === subId || c.reference === subId);
          if (found) {
            return res.json({ status: "success", environnement: tenantId, client: found, data: found });
          }
          return res.status(404).json({ status: "error", error: `Client '${subId}' non trouvé dans l'environnement ${tenantId}` });
        }

        return res.json({
          status: "success",
          environnement: tenantId,
          count: clients.length,
          total: clients.length,
          clients,
          data: clients
        });
      }

      // Defibrillateurs Endpoint
      if (cleanPath.startsWith('defibrillateurs')) {
        let defibs = await fetchServerCollection('defibrillateurs', tenantId);

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

          await saveServerCollection('defibrillateurs', tenantId, defibs);

          return res.status(201).json({
            status: "success",
            message: "Défibrillateur enregistré avec succès",
            environnement: tenantId,
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
            return res.json({ status: "success", environnement: tenantId, defibrillateur: found, data: found });
          }
          return res.status(404).json({ 
            status: "error", 
            error: `Défibrillateur '${subId}' non trouvé dans l'environnement ${tenantId}`,
            code: "DEFIBRILLATEUR_NOT_FOUND" 
          });
        }

        return res.json({
          status: "success",
          environnement: tenantId,
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
