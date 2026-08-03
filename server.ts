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

  // CORS support and preflight handling for CRM website form embedding
  app.use("/api/crm/embed-lead", (req, res, next) => {
    const origin = req.headers.origin || "*";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, X-Requested-With, Origin");
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

  // Proxy route for Pennylane API to prevent CORS
  app.all("/api/pennylane/*", async (req, res) => {
    try {
      const urlObj = new URL(req.url, 'http://localhost');
      const subPath = urlObj.pathname.replace(/^\/api\/pennylane\//, '');
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
      
      const targetTenantId = tenantId || "demo";
      const collectionKey = targetTenantId === "demo" ? "tickets" : `${targetTenantId}_tickets`;
      
      // Fetch existing tickets from Firestore
      const docRef = doc(db, 'appData', collectionKey);
      const snap = await getDoc(docRef);
      let tickets: any[] = [];
      if (snap.exists()) {
        tickets = snap.data().value || [];
      }
      
      const randomId = `#${Math.floor(100000 + Math.random() * 900000)}`;
      const newTicket = {
        id: randomId,
        identifiant: "",
        objet: "Formulaire intégré",
        message: `[Message depuis le site web]\n${message}`,
        email: email,
        phone: "-",
        date: new Date().toISOString().replace('T', ' ').substring(0, 19),
        status: "Nouveau",
        envId: targetTenantId,
        tenantId: targetTenantId
      };
      
      tickets.unshift(newTicket);
      await setDoc(docRef, { value: tickets });
      
      // If redirectUrl is supplied, redirect there
      if (redirectUrl) {
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
      
      const apiKey = req.headers['x-defibeo-api-key'] || req.query.api_key;
      const tenantId = (req.headers['x-defibeo-tenant-id'] as string) || (req.query.tenant_id as string) || 'demo';

      // Example operational response for API tests and external calls
      if (cleanPath === 'variables' || cleanPath === 'variables/') {
        return res.json({
          status: "success",
          environnement: tenantId,
          version_api: "1.4.0",
          devise: "EUR",
          taux_tva_defaut: 20.0,
          duree_validite_devis_jours: 30,
          marques_dae_supportees: ["ZOLL", "HEARTSINE", "PHYSIO-CONTROL", "SCHILLER", "MINDRAY"],
          categories_crm: ["Technique", "Commercial", "Réclamation", "Formulaire Web", "Sans Catégorie"]
        });
      }

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
            ticket: newTicket
          });
        } else {
          // GET tickets
          const collectionKey = tenantId === "demo" ? "tickets" : `${tenantId}_tickets`;
          const docRef = doc(db, 'appData', collectionKey);
          const snap = await getDoc(docRef);
          let tickets: any[] = [];
          if (snap.exists()) {
            tickets = snap.data().value || [];
          }
          return res.json({ status: "success", count: tickets.length, tickets });
        }
      }

      if (cleanPath.startsWith('clients')) {
        return res.json({
          status: "success",
          client_id: cleanPath.split('/')[1] || "CLI-0042",
          entreprise: "Clinique Saint-Jean",
          email: "contact@clinique-stjean.fr",
          telephone: "0142680000",
          payeur_id: "PAY-9901",
          identifiant_unique: "SIRET-12345678900012",
          reference_contrat: "CTR-2026-99",
          debut_contrat: "2026-01-01",
          fin_contrat: "2028-12-31"
        });
      }

      if (cleanPath.startsWith('defibrillateurs')) {
        return res.json({
          status: "success",
          serie: "SN-9981240",
          identifiant: cleanPath.split('/')[1] || "DAE-88192",
          modele: "AED Plus",
          numero_atlasante: "ATLAS-77120",
          version_logiciel: "v3.2.1",
          client_id: "CLI-0042",
          contact_nom_prenom: "Jean Dupont",
          contact_portable: "0612345678",
          contact_email: "j.dupont@clinique-stjean.fr",
          boitier_modele: "Mural AIVIA 200",
          boitier_lot: "LOT-B-88",
          adresse_voie: "12 Avenue de Paris",
          ville: "Paris",
          code_postal: "75008",
          region: "Île-de-France",
          pays: "France",
          latitude: 48.8708,
          longitude: 2.3045,
          aide_acces: "Code porte 45A12 - Hall RDC",
          expiration_garantie: "2030-05-15",
          date_fabrication: "2024-02-10",
          derniere_maintenance: "2026-02-15",
          electrodes_adulte: {
            modele: "CPR-D Padz",
            lot: "LOT-A-990",
            date_insertion: "2026-02-15",
            date_peremption: "2028-02-15",
            lot_padpak: "PADPAK-A-01",
            peremption_padpak: "2028-02-15"
          },
          electrodes_pediatrique: {
            modele: "Pedi-Padz II",
            lot: "LOT-P-441",
            date_insertion: "2026-02-15",
            date_peremption: "2028-06-30",
            lot_padpak: "PADPAK-P-02",
            peremption_padpak: "2028-06-30"
          },
          batterie: {
            modele: "Pack Lithium 123A",
            lot: "LOT-BAT-77",
            date_insertion: "2026-02-15",
            date_peremption: "2030-02-15",
            pourcentage_constate: 100
          },
          peremption_trousse: "2028-12-31"
        });
      }

      // Default fallback endpoint info
      return res.json({
        status: "success",
        message: "API Defibeo Operational Endpoint",
        endpoint: cleanPath,
        tenant_id: tenantId,
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
