import express from "express";
import path from "path";
import fs from "fs";
import zlib from "zlib";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const currentFilename = typeof __filename !== 'undefined' ? __filename : (typeof import.meta !== 'undefined' && (import.meta as any)?.url ? fileURLToPath((import.meta as any).url) : '');
const currentDirname = typeof __dirname !== 'undefined' ? __dirname : (currentFilename ? path.dirname(currentFilename) : process.cwd());
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

function unwrapFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return val;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return parseFloat(val.doubleValue);
  if ('booleanValue' in val) return val.booleanValue;
  if ('nullValue' in val) return null;
  if ('mapValue' in val) {
    const obj: Record<string, any> = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      obj[k] = unwrapFirestoreValue(v);
    }
    return obj;
  }
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map(unwrapFirestoreValue);
  }
  return val;
}

async function fetchFirestoreDocumentRest(key: string, timeoutMs: number = 2500): Promise<Record<string, any> | null> {
  try {
    const apiKey = PROD_FIREBASE_CONFIG.apiKey;
    const url = `https://firestore.googleapis.com/v1/projects/defibeo/databases/(default)/documents/appData/${encodeURIComponent(key)}?key=${apiKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json: any = await res.json();
    if (!json || !json.fields) return null;
    const result: Record<string, any> = {};
    for (const [fk, fv] of Object.entries(json.fields)) {
      result[fk] = unwrapFirestoreValue(fv);
    }
    return result;
  } catch (_) {
    return null;
  }
}

function resolveDataDirs() {
  const candidateDataDirs = [
    path.join(process.cwd(), 'data'),
    path.join(process.cwd(), '.data'),
    path.join(currentDirname, 'data'),
    path.join(currentDirname, '..', 'data'),
    path.join(currentDirname, 'dist', 'data')
  ];
  let chosenDataDir = candidateDataDirs.find(d => fs.existsSync(d)) || path.join(process.cwd(), 'data');

  const candidateChunksDirs = [
    path.join(process.cwd(), 'data', 'chunks'),
    path.join(process.cwd(), '.data', 'chunks'),
    path.join(currentDirname, 'data', 'chunks'),
    path.join(currentDirname, '..', 'data', 'chunks'),
    path.join(currentDirname, 'dist', 'data', 'chunks')
  ];
  let chosenChunksDir = candidateChunksDirs.find(d => fs.existsSync(d)) || path.join(chosenDataDir, 'chunks');

  const candidateIndexFiles = [
    path.join(process.cwd(), 'data', 'defib_compact_index.json'),
    path.join(process.cwd(), '.data', 'defib_compact_index.json'),
    path.join(currentDirname, 'data', 'defib_compact_index.json'),
    path.join(currentDirname, '..', 'data', 'defib_compact_index.json'),
    path.join(currentDirname, 'dist', 'data', 'defib_compact_index.json')
  ];
  let chosenIndexFile = candidateIndexFiles.find(f => fs.existsSync(f)) || '';

  return { chosenDataDir, chosenChunksDir, chosenIndexFile };
}

const { chosenDataDir: DATA_DIR, chosenChunksDir: CHUNKS_DIR, chosenIndexFile: COMPACT_INDEX_FILE } = resolveDataDirs();
const STORE_FILE = path.join(DATA_DIR, 'server-store.json');
const COLLECTIONS_DIR = path.join(DATA_DIR, 'collections');

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallbackValue), timeoutMs))
  ]);
}

// Normalization helpers for boolean/text inputs ('Oui'/'Non', true/false, 1/0)
const normalizeYesNo = (val: any, defaultVal: 'Oui' | 'Non' = 'Oui'): 'Oui' | 'Non' => {
  if (val === undefined || val === null || val === '') return defaultVal;
  if (typeof val === 'boolean') return val ? 'Oui' : 'Non';
  if (typeof val === 'number') return val === 1 ? 'Oui' : (val === 0 ? 'Non' : defaultVal);
  const s = String(val).trim().toLowerCase();
  if (['oui', 'true', '1', 'yes', 'y', 'vrai', 'o', 'present', 'présent'].includes(s)) return 'Oui';
  if (['non', 'false', '0', 'no', 'n', 'faux', 'absent'].includes(s)) return 'Non';
  return defaultVal;
};

const toBoolean = (val: any, defaultVal: boolean = false): boolean => {
  if (val === undefined || val === null || val === '') return defaultVal;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  const s = String(val).trim().toLowerCase();
  if (['oui', 'true', '1', 'yes', 'y', 'vrai', 'o', 'present', 'présent'].includes(s)) return true;
  if (['non', 'false', '0', 'no', 'n', 'faux', 'absent'].includes(s)) return false;
  return defaultVal;
};

// Compact tuple: [id, identifiant, numeroSerie, chunkIdx, env]
type CompactDefibTuple = [string, string, string, number, string];
const defibLocationIndex = new Map<string, CompactDefibTuple>();
let isCompactIndexLoaded = false;

function loadCompactIndexSync() {
  if (isCompactIndexLoaded) return;
  try {
    const candidateFiles = [
      COMPACT_INDEX_FILE,
      path.join(process.cwd(), 'data', 'defib_compact_index.json'),
      path.join(process.cwd(), '.data', 'defib_compact_index.json'),
      path.join(currentDirname, 'data', 'defib_compact_index.json'),
      path.join(currentDirname, '..', 'data', 'defib_compact_index.json'),
      path.join(currentDirname, 'dist', 'data', 'defib_compact_index.json')
    ].filter(Boolean);

    for (const f of candidateFiles) {
      if (f && fs.existsSync(f)) {
        const raw = fs.readFileSync(f, 'utf-8');
        const parsed = JSON.parse(raw);
        for (const [k, v] of Object.entries(parsed)) {
          defibLocationIndex.set(k.toLowerCase(), v as CompactDefibTuple);
        }
        isCompactIndexLoaded = true;
        console.log(`[Index] Loaded compact index with ${defibLocationIndex.size} keys from ${f}`);
        break;
      }
    }
  } catch (err) {
    console.warn('[Index] Could not load compact index:', err);
  }
}

// Warm up compact index immediately at module evaluation
loadCompactIndexSync();

// In-memory cache for loaded chunk arrays to avoid repeated disk reads
const loadedChunkCache = new Map<number, any[]>();
const loadedChunkMtime = new Map<number, number>();

function loadChunkFileSync(chunkIdx: number, prefix: string = 'D27_defibrillateurs'): any[] | null {
  const candidateChunkDirs = [
    CHUNKS_DIR,
    path.join(process.cwd(), 'data', 'chunks'),
    path.join(process.cwd(), '.data', 'chunks'),
    path.join(currentDirname, 'data', 'chunks'),
    path.join(currentDirname, '..', 'data', 'chunks'),
    path.join(currentDirname, 'dist', 'data', 'chunks')
  ];

  for (const dir of candidateChunkDirs) {
    const p = path.join(dir, `${prefix}_chunk_${chunkIdx}.json`);
    if (fs.existsSync(p)) {
      try {
        const stat = fs.statSync(p);
        const prevMtime = loadedChunkMtime.get(chunkIdx);
        if (loadedChunkCache.has(chunkIdx) && prevMtime && stat.mtimeMs <= prevMtime) {
          return loadedChunkCache.get(chunkIdx)!;
        }
        const items = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (Array.isArray(items)) {
          loadedChunkCache.set(chunkIdx, items);
          loadedChunkMtime.set(chunkIdx, stat.mtimeMs);
          for (const item of items) {
            indexDefibrillateur(item, item.envId || item.tenantId || 'D58');
          }
          return items;
        }
      } catch (_) {}
    }
  }
  if (loadedChunkCache.has(chunkIdx)) {
    return loadedChunkCache.get(chunkIdx)!;
  }
  return null;
}

function saveSingleDefibrillateurToChunk(defib: any, chunkIdx: number, prefix: string = 'D27_defibrillateurs'): boolean {
  try {
    // 1. Update in memory cache
    const cachedChunk = loadedChunkCache.get(chunkIdx);
    if (cachedChunk && Array.isArray(cachedChunk)) {
      const idx = cachedChunk.findIndex(d => d && (d.id === defib.id || d.identifiant === defib.identifiant || d.numeroSerie === defib.numeroSerie));
      if (idx >= 0) {
        cachedChunk[idx] = { ...cachedChunk[idx], ...defib };
      } else {
        cachedChunk.push(defib);
      }
    }

    // 2. Update chunk file on disk immediately (O(1), ~2ms)
    const candidateDirs = [
      CHUNKS_DIR,
      path.join(process.cwd(), 'data', 'chunks'),
      path.join(process.cwd(), '.data', 'chunks'),
      path.join(currentDirname, 'data', 'chunks'),
      path.join(currentDirname, 'dist', 'data', 'chunks')
    ];
    for (const d of candidateDirs) {
      const p = path.join(d, `${prefix}_chunk_${chunkIdx}.json`);
      if (fs.existsSync(p)) {
        try {
          const chunkArr = JSON.parse(fs.readFileSync(p, 'utf-8'));
          if (Array.isArray(chunkArr)) {
            const idx = chunkArr.findIndex(d => d && (d.id === defib.id || d.identifiant === defib.identifiant || d.numeroSerie === defib.numeroSerie));
            if (idx >= 0) {
              chunkArr[idx] = { ...chunkArr[idx], ...defib };
            } else {
              chunkArr.push(defib);
            }
            fs.writeFileSync(p, JSON.stringify(chunkArr), 'utf-8');
            loadedChunkCache.set(chunkIdx, chunkArr);
            try {
              const stat = fs.statSync(p);
              loadedChunkMtime.set(chunkIdx, stat.mtimeMs);
            } catch (_) {}
          }
        } catch (_) {}
      }
    }

    // 3. Update fastDefibIndex in memory
    indexDefibrillateur(defib, defib.envId || defib.tenantId || 'D58');

    // 4. Asynchronously persist to Firestore in background without blocking caller
    (async () => {
      try {
        const chunkDocRef = doc(db, 'appData', `${prefix}_chunk_${chunkIdx}`);
        const snap = await withTimeout(getDoc(chunkDocRef), 3000, null);
        if (snap && snap.exists()) {
          const docData = snap.data();
          const arr = docData?.value || [];
          if (Array.isArray(arr)) {
            const idx = arr.findIndex((d: any) => d && (d.id === defib.id || d.identifiant === defib.identifiant || d.numeroSerie === defib.numeroSerie));
            if (idx >= 0) {
              arr[idx] = { ...arr[idx], ...defib };
            } else {
              arr.push(defib);
            }
            await setDoc(chunkDocRef, { ...docData, value: arr });
          }
        }
      } catch (err) {
        console.warn(`[Background Chunk Sync] Warning on chunk ${chunkIdx}:`, err);
      }
    })().catch(() => {});

    return true;
  } catch (err) {
    console.warn('[Chunk Save] Error updating defib in chunk:', err);
    return false;
  }
}

async function fetchChunkRest(chunkIdx: number, prefix: string = 'D27_defibrillateurs'): Promise<any[] | null> {
  if (loadedChunkCache.has(chunkIdx)) {
    return loadedChunkCache.get(chunkIdx)!;
  }
  try {
    const apiKey = PROD_FIREBASE_CONFIG.apiKey;
    const url = `https://firestore.googleapis.com/v1/projects/defibeo/databases/(default)/documents/appData/${prefix}_chunk_${chunkIdx}?key=${apiKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json: any = await res.json();
    const rawValues = json.fields?.value?.arrayValue?.values;
    if (!Array.isArray(rawValues)) return null;

    const unwrapRestField = (val: any): any => {
      if (!val || typeof val !== 'object') return val;
      if ('stringValue' in val) return val.stringValue;
      if ('integerValue' in val) return parseInt(val.integerValue, 10);
      if ('doubleValue' in val) return parseFloat(val.doubleValue);
      if ('booleanValue' in val) return val.booleanValue;
      if ('nullValue' in val) return null;
      if ('mapValue' in val) {
        const out: any = {};
        for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
          out[k] = unwrapRestField(v);
        }
        return out;
      }
      if ('arrayValue' in val) {
        return (val.arrayValue.values || []).map(unwrapRestField);
      }
      return val;
    };

    const items = rawValues.map(unwrapRestField);
    if (Array.isArray(items) && items.length > 0) {
      loadedChunkCache.set(chunkIdx, items);
      try {
        if (!fs.existsSync(CHUNKS_DIR)) fs.mkdirSync(CHUNKS_DIR, { recursive: true });
        fs.writeFileSync(path.join(CHUNKS_DIR, `${prefix}_chunk_${chunkIdx}.json`), JSON.stringify(items), 'utf-8');
      } catch (_) {}
      for (const item of items) {
        indexDefibrillateur(item, item.envId || item.tenantId || 'D58');
      }
      return items;
    }
  } catch (_) {}
  return null;
}

const serverMemoryStore = new Map<string, any>();
const serverStoreTimestamps = new Map<string, number>();

// O(1) in-memory index for equipment and defibrillator lookups by ID, serial, or reference
interface DefibIndexEntry {
  defib: any;
  tenant: string;
}
const fastDefibIndex = new Map<string, DefibIndexEntry>();

function normalizeDefibLookupKey(val: any): string {
  if (val === undefined || val === null) return '';
  return String(val).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function indexDefibrillateur(defib: any, tenant: string = 'D58') {
  if (!defib || typeof defib !== 'object') return;
  const t = defib.tenantId || defib.envId || tenant || 'D58';
  const entry: DefibIndexEntry = { defib, tenant: t };

  const candidateValues = [
    defib.id,
    defib.identifiant,
    defib.defibIdentifiant,
    defib.identifiantDAE,
    defib.identifiant_dae,
    defib.identifiantUnique,
    defib.identifiant_unique,
    defib.id_dae,
    defib.code,
    defib.reference,
    defib.ref,
    defib.defibId,
    defib.numeroSerie,
    defib.num_serie,
    defib.numero_serie,
    defib.numSerie,
    defib.numSerieDAE,
    defib.serial,
    defib.serialNumber,
    defib.serial_number,
    defib.sn,
    defib.numeroAtlasante,
    defib.numero_atlasante,
    defib.defibSnapshot?.identifiant,
    defib.defibSnapshot?.numeroSerie,
    defib.defibSnapshot?.id
  ];

  for (const raw of candidateValues) {
    if (raw === undefined || raw === null) continue;
    const str = String(raw).trim();
    if (!str) continue;
    const stripped = str.replace(/^[:=]+/, '').replace(/^['"]|['"]$/g, '').trim();

    fastDefibIndex.set(str, entry);
    fastDefibIndex.set(`:${str}`, entry);
    fastDefibIndex.set(str.toLowerCase(), entry);
    fastDefibIndex.set(`:${str.toLowerCase()}`, entry);

    if (stripped && stripped !== str) {
      fastDefibIndex.set(stripped, entry);
      fastDefibIndex.set(`:${stripped}`, entry);
      fastDefibIndex.set(stripped.toLowerCase(), entry);
      fastDefibIndex.set(`:${stripped.toLowerCase()}`, entry);
    }

    const norm = normalizeDefibLookupKey(str);
    if (norm && norm.length >= 3) {
      fastDefibIndex.set(norm, entry);
    }
    if (stripped && stripped !== str) {
      const normStripped = normalizeDefibLookupKey(stripped);
      if (normStripped && normStripped.length >= 3) {
        fastDefibIndex.set(normStripped, entry);
      }
    }
  }
}

// Chunked sync buffers for handling massive collections (18,000+ items)
interface ChunkBuffer {
  collectionName: string;
  tenantId: string;
  canonicalKey: string;
  totalChunks: number;
  totalCount: number;
  chunks: (any[] | null)[];
  lastUpdated: number;
}
const syncChunkBuffers = new Map<string, ChunkBuffer>();

// Initialize disk store
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(COLLECTIONS_DIR)) {
    fs.mkdirSync(COLLECTIONS_DIR, { recursive: true });
  }
  if (!fs.existsSync(CHUNKS_DIR)) {
    fs.mkdirSync(CHUNKS_DIR, { recursive: true });
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
  // Also load any dedicated collection files
  if (fs.existsSync(COLLECTIONS_DIR)) {
    const files = fs.readdirSync(COLLECTIONS_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const key = file.replace(/\.json$/, '');
        try {
          const content = fs.readFileSync(path.join(COLLECTIONS_DIR, file), 'utf-8');
          const parsed = JSON.parse(content);
          if (parsed !== undefined && parsed !== null) {
            serverMemoryStore.set(key, parsed);
            serverStoreTimestamps.set(key, Date.now());
            if (key.includes('defibrillateurs') && Array.isArray(parsed)) {
              for (const item of parsed) {
                indexDefibrillateur(item, key.replace(/_defibrillateurs$/, ''));
              }
            }
          }
        } catch (colErr) {
          console.warn(`Failed to read collection file ${file}:`, colErr);
        }
      }
    }
  }
} catch (e) {
  console.warn("Failed to load server disk store:", e);
}

let persistTimeout: NodeJS.Timeout | null = null;

function persistSingleCollectionToDisk(key: string, value: any) {
  try {
    if (!fs.existsSync(COLLECTIONS_DIR)) {
      fs.mkdirSync(COLLECTIONS_DIR, { recursive: true });
    }
    const filePath = path.join(COLLECTIONS_DIR, `${key}.json`);
    fs.writeFileSync(filePath, JSON.stringify(value), 'utf-8');
  } catch (e) {
    console.warn(`Failed to persist collection ${key} to disk:`, e);
  }
}

function persistServerStoreToDiskNow() {
  if (persistTimeout) {
    clearTimeout(persistTimeout);
    persistTimeout = null;
  }
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const obj: Record<string, any[]> = {};
    for (const [k, v] of serverMemoryStore.entries()) {
      // Skip redundant lowercase or raw numeric aliases to keep disk footprint minimal and avoid string length limits
      if (/^[0-9]+_/.test(k) || /^d[0-9]+_/.test(k)) continue;
      // Large collections are saved individually in collections/ to avoid overflowing single JSON
      if (Array.isArray(v) && v.length > 500) {
        persistSingleCollectionToDisk(k, v);
        continue;
      }
      obj[k] = v;
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(obj), 'utf-8');
  } catch (e) {
    console.warn("Failed to persist server disk store immediately:", e);
  }
}

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
        if (Array.isArray(v) && v.length > 500) {
          persistSingleCollectionToDisk(k, v);
          continue;
        }
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

  // Use json middleware for API routes with high limit to handle large datasets (18,000+ items)
  app.use(express.json({ limit: '200mb' }));
  app.use(express.urlencoded({ extended: true, limit: '200mb' }));

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

  // Always append default D27 and generic connectors as fallback for shared tenant credentials
  candidateKeys.push('D27_api_connectors', 'D58_api_connectors', 'api_connectors');

  const uniqueKeys = Array.from(new Set(candidateKeys.filter(Boolean)));

  for (const cKey of uniqueKeys) {
    if (serverMemoryStore.has(cKey)) {
      const rawData = serverMemoryStore.get(cKey);
      const connData = (rawData && typeof rawData === 'object' && 'value' in rawData) ? rawData.value : rawData;
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
    const diskFile = path.join(COLLECTIONS_DIR, `${cKey}.json`);
    if (fs.existsSync(diskFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(diskFile, 'utf-8'));
        const connData = (parsed && typeof parsed === 'object' && 'value' in parsed) ? parsed.value : parsed;
        if (connData && typeof connData === 'object') {
          const apiKey = typeof connData.apiDefibeoApiKey === 'string' ? connData.apiDefibeoApiKey.trim() : '';
          const secretKey = typeof connData.apiDefibeoSecretKey === 'string' ? connData.apiDefibeoSecretKey.trim() : '';
          const active = connData.apiDefibeoActive !== false;
          if (apiKey || secretKey) {
            serverMemoryStore.set(cKey, connData);
            return { active, apiKey, secretKey };
          }
        }
      } catch (_) {}
    }
  }

  for (const cKey of uniqueKeys) {
    try {
      let rawData = await fetchFirestoreDocumentRest(cKey, 1500);
      if (!rawData) {
        const docRef = doc(db, 'appData', cKey);
        const snap = await withTimeout(getDoc(docRef), 1200, null);
        if (snap && snap.exists()) {
          rawData = snap.data() || {};
        }
      }
      if (rawData) {
        const payload = (rawData && typeof rawData === 'object' && 'value' in rawData) ? rawData.value : rawData;
        serverMemoryStore.set(cKey, payload);
        try {
          fs.writeFileSync(path.join(COLLECTIONS_DIR, `${cKey}.json`), JSON.stringify(payload), 'utf-8');
        } catch (_) {}
        const apiKey = typeof payload?.apiDefibeoApiKey === 'string' ? payload.apiDefibeoApiKey.trim() : '';
        const secretKey = typeof payload?.apiDefibeoSecretKey === 'string' ? payload.apiDefibeoSecretKey.trim() : '';
        const active = payload?.apiDefibeoActive !== false;
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
      const isItemFromApi = item._lastSource === 'api';
      const isExistingFromApi = existing._lastSource === 'api';
      
      const itemTime = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
      const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;

      // When merging, if incoming item is from API or has newer/equal timestamp, it takes precedence
      const incomingTakesPrecedence = isItemFromApi || (itemTime > 0 && itemTime >= existingTime) || (!isExistingFromApi && !existingTime);

      const merged = incomingTakesPrecedence ? { ...existing, ...item } : { ...item, ...existing };
      for (const [prop, val] of Object.entries(item)) {
        if (val !== undefined && val !== null && val !== '') {
          const current = merged[prop];
          if (incomingTakesPrecedence) {
            merged[prop] = val;
          } else if (current === undefined || current === null || current === '') {
            merged[prop] = val;
          } else if (Array.isArray(val) && Array.isArray(current)) {
            if (val.length > current.length) {
              merged[prop] = val;
            }
          }
        }
      }

      if (isItemFromApi || isExistingFromApi) {
        merged._lastSource = 'api';
      }
      if (itemTime > 0 || existingTime > 0) {
        merged.updatedAt = (itemTime >= existingTime ? item.updatedAt : existing.updatedAt) || new Date().toISOString();
      }

      map.set(key, merged);
    } else {
      map.set(key, { ...item });
    }
  }

  return Array.from(map.values());
}

function toBoolean(val: any, defaultVal: boolean = false): boolean {
  if (val === undefined || val === null || val === '') return defaultVal;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  const s = String(val).trim().toLowerCase();
  if (['oui', 'true', '1', 'yes', 'y', 'vrai', 'o', 'present', 'présent'].includes(s)) return true;
  if (['non', 'false', '0', 'no', 'n', 'faux', 'absent'].includes(s)) return false;
  return defaultVal;
}

function matchesDefibWith(targetStr: string): (d: any) => boolean {
  return (d: any): boolean => {
    if (!d || typeof d !== 'object') return false;
    const raw = decodeURIComponent(targetStr).trim();
    const stripped = raw.replace(/^[:=]+/, '').replace(/^['"]|['"]$/g, '').trim();
    const lower = raw.toLowerCase();
    const strippedLower = stripped.toLowerCase();
    const clean = stripped.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    const candidates = [
      d.id,
      d.identifiant,
      d.defibIdentifiant,
      d.identifiantDAE,
      d.identifiant_dae,
      d.identifiantUnique,
      d.identifiant_unique,
      d.id_dae,
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
      d.serial_number,
      d.sn,
      d.numeroAtlasante,
      d.numero_atlasante,
      d.defibSnapshot?.identifiant,
      d.defibSnapshot?.numeroSerie,
      d.defibSnapshot?.id
    ];

    for (const val of candidates) {
      if (val === undefined || val === null) continue;
      const sVal = String(val).trim();
      if (!sVal) continue;
      const sValStripped = sVal.replace(/^[:=]+/, '').replace(/^['"]|['"]$/g, '').trim();
      if (sVal === raw || sVal === stripped || sValStripped === stripped || sValStripped === raw) return true;
      if (sVal.toLowerCase() === lower || sVal.toLowerCase() === strippedLower || sValStripped.toLowerCase() === strippedLower) return true;
      if (clean.length >= 3) {
        const cVal = sVal.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        if (cVal === clean) return true;
      }
    }
    return false;
  };
}

function formatDefibrillateurOutput(d: any): any {
  if (!d || typeof d !== 'object') return d;
  return {
    ...d,
    id: d.id,
    identifiant: d.identifiant || d.id,
    numeroSerie: d.numeroSerie || d.num_serie || '',
    num_serie: d.num_serie || d.numeroSerie || '',

    derniereMaintenance: d.derniereMaintenance || d.derniere_maintenance || d.date_derniere_maintenance || '',
    derniere_maintenance: d.derniere_maintenance || d.derniereMaintenance || d.date_derniere_maintenance || '',
    date_derniere_maintenance: d.date_derniere_maintenance || d.derniere_maintenance || d.derniereMaintenance || '',
    prochaineMaintenance: d.prochaineMaintenance || d.prochaine_visite || d.prochaine_v || '',
    prochaine_visite: d.prochaine_visite || d.prochaineMaintenance || d.prochaine_v || '',
    prochaine_v: d.prochaine_v || d.prochaine_visite || d.prochaineMaintenance || '',

    modeleElectrodeAId: d.modeleElectrodeAId || d.modele_a || d.modeleElectrodeA || '',
    modeleElectrodeA: d.modeleElectrodeA || d.modele_electrode_a || d.modele_a || '',
    modele_electrode_a: d.modele_electrode_a || d.modeleElectrodeA || d.modele_a || '',
    modele_a: d.modele_a || d.modele_electrode_a || d.modeleElectrodeA || d.modeleElectrodeAId || '',
    lotElectrodeA: d.lotElectrodeA || d.lot_electrode_a || d.lot_a || '',
    lot_electrode_a: d.lot_electrode_a || d.lotElectrodeA || d.lot_a || '',
    lot_a: d.lot_a || d.lot_electrode_a || d.lotElectrodeA || '',
    peremptionElectrodeA: d.peremptionElectrodeA || d.peremption_electrode_a || d.peremption_a || '',
    peremption_electrode_a: d.peremption_electrode_a || d.peremptionElectrodeA || d.peremption_a || '',
    peremption_a: d.peremption_a || d.peremption_electrode_a || d.peremptionElectrodeA || '',
    date_peremption_a: d.date_peremption_a || d.peremption_a || d.peremptionElectrodeA || '',
    insertionElectrodeA: d.insertionElectrodeA || d.insertion_electrode_a || d.insertion_a || '',
    insertion_electrode_a: d.insertion_electrode_a || d.insertionElectrodeA || d.insertion_a || '',
    insertion_a: d.insertion_a || d.insertion_electrode_a || d.insertionElectrodeA || '',
    livraisonElectrodeA: d.livraisonElectrodeA || d.livraison_electrode_a || d.livraison_a || '',
    livraison_electrode_a: d.livraison_electrode_a || d.livraisonElectrodeA || d.livraison_a || '',
    livraison_a: d.livraison_a || d.livraison_electrode_a || d.livraisonElectrodeA || '',
    situationElectrodeA: d.situationElectrodeA || d.situation_a || 'Vert',
    situation_a: d.situation_a || d.situationElectrodeA || 'Vert',
    commentaireElectrodeA: d.commentaireElectrodeA || d.commentaire_a || '',
    commentaire_a: d.commentaire_a || d.commentaireElectrodeA || '',
    peremptionSecoursElectrodeA: d.peremptionSecoursElectrodeA || d.peremption_secours_a || '',
    peremption_secours_a: d.peremption_secours_a || d.peremptionSecoursElectrodeA || '',
    hasElectrodeASecours: d.hasElectrodeASecours || d.has_electrode_a_secours || 'Non',
    has_electrode_a_secours: d.has_electrode_a_secours || d.hasElectrodeASecours || 'Non',
    modeleElectrodeASecoursId: d.modeleElectrodeASecoursId || d.modele_secours_a || d.modeleElectrodeASecours || '',
    modele_secours_a: d.modele_secours_a || d.modeleElectrodeASecoursId || '',
    lotElectrodeASecours: d.lotElectrodeASecours || d.lot_secours_a || '',
    lot_secours_a: d.lot_secours_a || d.lotElectrodeASecours || '',
    hasPadpakA: d.hasPadpakA || d.has_padpak_a || 'Non',
    has_padpak_a: d.has_padpak_a || d.hasPadpakA || 'Non',
    lotPadpakA: d.lotPadpakA || d.lot_padpak_a || '',
    lot_padpak_a: d.lot_padpak_a || d.lotPadpakA || '',
    peremptionPadpakA: d.peremptionPadpakA || d.peremption_padpak_a || '',
    peremption_padpak_a: d.peremption_padpak_a || d.peremptionPadpakA || '',

    modeleElectrodePId: d.modeleElectrodePId || d.modele_p || d.modeleElectrodeP || '',
    modeleElectrodeP: d.modeleElectrodeP || d.modele_electrode_p || d.modele_p || '',
    modele_electrode_p: d.modele_electrode_p || d.modeleElectrodeP || d.modele_p || '',
    modele_p: d.modele_p || d.modele_electrode_p || d.modeleElectrodeP || d.modeleElectrodePId || '',
    lotElectrodeP: d.lotElectrodeP || d.lot_electrode_p || d.lot_p || '',
    lot_electrode_p: d.lot_electrode_p || d.lotElectrodeP || d.lot_p || '',
    lot_p: d.lot_p || d.lot_electrode_p || d.lotElectrodeP || '',
    peremptionElectrodeP: d.peremptionElectrodeP || d.peremption_electrode_p || d.peremption_p || '',
    peremption_electrode_p: d.peremption_electrode_p || d.peremptionElectrodeP || d.peremption_p || '',
    peremption_p: d.peremption_p || d.peremption_electrode_p || d.peremptionElectrodeP || '',
    date_peremption_p: d.date_peremption_p || d.peremption_p || d.peremptionElectrodeP || '',
    insertionElectrodeP: d.insertionElectrodeP || d.insertion_electrode_p || d.insertion_p || '',
    insertion_electrode_p: d.insertion_electrode_p || d.insertionElectrodeP || d.insertion_p || '',
    insertion_p: d.insertion_p || d.insertion_electrode_p || d.insertionElectrodeP || '',
    livraisonElectrodeP: d.livraisonElectrodeP || d.livraison_electrode_p || d.livraison_p || '',
    livraison_electrode_p: d.livraison_electrode_p || d.livraisonElectrodeP || d.livraison_p || '',
    livraison_p: d.livraison_p || d.livraison_electrode_p || d.livraisonElectrodeP || '',
    situationElectrodeP: d.situationElectrodeP || d.situation_p || 'Vert',
    situation_p: d.situation_p || d.situationElectrodeP || 'Vert',
    commentaireElectrodeP: d.commentaireElectrodeP || d.commentaire_p || '',
    commentaire_p: d.commentaire_p || d.commentaireElectrodeP || '',
    peremptionSecoursElectrodeP: d.peremptionSecoursElectrodeP || d.peremption_secours_p || '',
    peremption_secours_p: d.peremption_secours_p || d.peremptionSecoursElectrodeP || '',
    hasElectrodePSecours: d.hasElectrodePSecours || d.has_electrode_p_secours || 'Non',
    has_electrode_p_secours: d.has_electrode_p_secours || d.hasElectrodePSecours || 'Non',
    modeleElectrodePSecoursId: d.modeleElectrodePSecoursId || d.modele_secours_p || d.modeleElectrodePSecours || '',
    modele_secours_p: d.modele_secours_p || d.modeleElectrodePSecoursId || '',
    lotElectrodePSecours: d.lotElectrodePSecours || d.lot_secours_p || '',
    lot_secours_p: d.lot_secours_p || d.lotElectrodePSecours || '',
    hasPadpakP: d.hasPadpakP || d.has_padpak_p || 'Non',
    has_padpak_p: d.has_padpak_p || d.hasPadpakP || 'Non',
    lotPadpakP: d.lotPadpakP || d.lot_padpak_p || '',
    lot_padpak_p: d.lot_padpak_p || d.lotPadpakP || '',
    peremptionPadpakP: d.peremptionPadpakP || d.peremption_padpak_p || '',
    peremption_padpak_p: d.peremption_padpak_p || d.peremptionPadpakP || '',

    modeleBatterieId: d.modeleBatterieId || d.modele_b || d.modeleBatterie || '',
    modeleBatterie: d.modeleBatterie || d.modele_batterie || d.modele_b || '',
    modele_batterie: d.modele_batterie || d.modeleBatterie || d.modele_b || '',
    modele_b: d.modele_b || d.modele_batterie || d.modeleBatterie || d.modeleBatterieId || '',
    lotBatterie: d.lotBatterie || d.lot_batterie || d.lot_b || '',
    lot_batterie: d.lot_batterie || d.lotBatterie || d.lot_b || '',
    lot_b: d.lot_b || d.lot_batterie || d.lotBatterie || '',
    peremptionBatterie: d.peremptionBatterie || d.peremption_batterie || d.peremption_b || '',
    peremption_batterie: d.peremption_batterie || d.peremptionBatterie || d.peremption_b || '',
    peremption_b: d.peremption_b || d.peremption_batterie || d.peremptionBatterie || '',
    date_peremption_batterie: d.date_peremption_batterie || d.peremption_b || d.peremptionBatterie || '',
    insertionBatterie: d.insertionBatterie || d.insertion_batterie || d.insertion_b || '',
    insertion_batterie: d.insertion_batterie || d.insertionBatterie || d.insertion_b || '',
    insertion_b: d.insertion_b || d.insertion_batterie || d.insertionBatterie || '',
    livraisonBatterie: d.livraisonBatterie || d.livraison_batterie || d.livraison_b || '',
    livraison_batterie: d.livraison_batterie || d.livraisonBatterie || d.livraison_b || '',
    livraison_b: d.livraison_b || d.livraison_batterie || d.livraisonBatterie || '',
    fabricationBatterie: d.fabricationBatterie || d.fabrication_b || d.date_fabrication_batterie || '',
    fabrication_b: d.fabrication_b || d.fabricationBatterie || d.date_fabrication_batterie || '',
    situationBatterie: d.situationBatterie || d.situation_b || 'Vert',
    situation_b: d.situation_b || d.situationBatterie || 'Vert',
    pourcentageBatterie: d.pourcentageBatterie || (d.pourcentage_constate_b !== undefined ? String(d.pourcentage_constate_b) : '100'),
    pourcentage_constate_b: d.pourcentage_constate_b !== undefined ? d.pourcentage_constate_b : (parseInt(d.pourcentageBatterie, 10) || 100),
    pourcentage_batterie: d.pourcentage_constate_b !== undefined ? d.pourcentage_constate_b : (parseInt(d.pourcentageBatterie, 10) || 100),
    commentaireBatterie: d.commentaireBatterie || d.commentaire_b || '',
    commentaire_b: d.commentaire_b || d.commentaireBatterie || '',
    hasBatterieSecours: d.hasBatterieSecours || d.has_batterie_secours || 'Non',
    has_batterie_secours: d.has_batterie_secours || d.hasBatterieSecours || 'Non',
    modeleBatterieSecoursId: d.modeleBatterieSecoursId || d.modele_secours_b || d.modeleBatterieSecours || '',
    modele_secours_b: d.modele_secours_b || d.modeleBatterieSecoursId || '',
    lotBatterieSecours: d.lotBatterieSecours || d.lot_secours_b || '',
    lot_secours_b: d.lot_secours_b || d.lotBatterieSecours || '',
    peremptionBatterieSecours: d.peremptionBatterieSecours || d.peremption_secours_b || '',
    peremption_secours_b: d.peremption_secours_b || d.peremptionBatterieSecours || '',

    modeleCoffretId: d.modeleCoffretId || d.boitier_modele || d.modele_coffret || '',
    modeleCoffret: d.modeleCoffret || d.modele_coffret || d.boitier_modele || '',
    modele_coffret: d.modele_coffret || d.modeleCoffret || d.boitier_modele || '',
    boitier_modele: d.boitier_modele || d.modele_coffret || d.modeleCoffret || d.modeleCoffretId || '',
    numeroLotCoffret: d.numeroLotCoffret || d.boitier_lot || d.lot_coffret || '',
    lot_coffret: d.lot_coffret || d.numeroLotCoffret || d.boitier_lot || '',
    boitier_lot: d.boitier_lot || d.lot_coffret || d.numeroLotCoffret || '',
    commentaireCoffret: d.commentaireCoffret || d.commentaire_coffret || '',
    commentaire_coffret: d.commentaire_coffret || d.commentaireCoffret || '',

    // Trousse de secours (8 champs conformes à la console web)
    peremptionTrousse: d.peremptionTrousse || d.peremption_trousse || '',
    peremption_trousse: d.peremption_trousse || d.peremptionTrousse || '',

    kitCiseauxPresents: d.kitCiseauxPresents || d.kit_ciseaux_presents || d.ciseaux_presents || 'Oui',
    kit_ciseaux_presents: d.kit_ciseaux_presents || d.kitCiseauxPresents || d.ciseaux_presents || 'Oui',
    ciseaux_presents: d.ciseaux_presents || d.kitCiseauxPresents || d.kit_ciseaux_presents || 'Oui',
    ciseaux_presents_bool: toBoolean(d.kitCiseauxPresents ?? d.kit_ciseaux_presents ?? d.ciseaux_presents ?? 'Oui', true),

    kitMasquePresent: d.kitMasquePresent || d.kit_masque_present || d.masque_present || 'Oui',
    kit_masque_present: d.kit_masque_present || d.kitMasquePresent || d.masque_present || 'Oui',
    masque_present: d.masque_present || d.kitMasquePresent || d.kit_masque_present || 'Oui',
    masque_present_bool: toBoolean(d.kitMasquePresent ?? d.kit_masque_present ?? d.masque_present ?? 'Oui', true),

    kitPeremptionMasque: d.kitPeremptionMasque || d.kit_peremption_masque || d.peremption_masque || '',
    kit_peremption_masque: d.kit_peremption_masque || d.kitPeremptionMasque || d.peremption_masque || '',
    peremption_masque: d.peremption_masque || d.kitPeremptionMasque || d.kit_peremption_masque || '',

    kitServiettesPresentes: d.kitServiettesPresentes || d.kit_serviettes_presentes || d.serviettes_presentes || 'Oui',
    kit_serviettes_presentes: d.kit_serviettes_presentes || d.kitServiettesPresentes || d.serviettes_presentes || 'Oui',
    serviettes_presentes: d.serviettes_presentes || d.kitServiettesPresentes || d.kit_serviettes_presentes || 'Oui',
    serviettes_presentes_bool: toBoolean(d.kitServiettesPresentes ?? d.kit_serviettes_presentes ?? d.serviettes_presentes ?? 'Oui', true),

    kitPeremptionServiettes: d.kitPeremptionServiettes || d.kit_peremption_serviettes || d.peremption_serviettes || '',
    kit_peremption_serviettes: d.kit_peremption_serviettes || d.kitPeremptionServiettes || d.peremption_serviettes || '',
    peremption_serviettes: d.peremption_serviettes || d.kitPeremptionServiettes || d.kit_peremption_serviettes || '',

    kitGantsPresents: d.kitGantsPresents || d.kit_gants_presents || d.gants_presents || d.paire_gants_presents || 'Oui',
    kit_gants_presents: d.kit_gants_presents || d.kitGantsPresents || d.gants_presents || d.paire_gants_presents || 'Oui',
    gants_presents: d.gants_presents || d.kitGantsPresents || d.kit_gants_presents || d.paire_gants_presents || 'Oui',
    paire_gants_presents: d.paire_gants_presents || d.kitGantsPresents || d.kit_gants_presents || d.gants_presents || 'Oui',
    gants_presents_bool: toBoolean(d.kitGantsPresents ?? d.kit_gants_presents ?? d.gants_presents ?? d.paire_gants_presents ?? 'Oui', true),

    kitRasoirPresent: d.kitRasoirPresent || d.kit_rasoir_present || d.rasoir_present || d.rasoir || 'Oui',
    kit_rasoir_present: d.kit_rasoir_present || d.kitRasoirPresent || d.rasoir_present || d.rasoir || 'Oui',
    rasoir_present: d.rasoir_present || d.kitRasoirPresent || d.kit_rasoir_present || d.rasoir || 'Oui',
    rasoir: d.rasoir || d.kitRasoirPresent || d.kit_rasoir_present || d.rasoir_present || 'Oui',
    rasoir_present_bool: toBoolean(d.kitRasoirPresent ?? d.kit_rasoir_present ?? d.rasoir_present ?? d.rasoir ?? 'Oui', true),

    modele: d.modele || d.modele_dae || d.modeleId || '',
    modele_dae: d.modele_dae || d.modele || d.modeleId || '',
    modeleId: d.modeleId || d.modele || '',
    marque: d.marque || d.brand || 'Standard',
    brand: d.brand || d.marque || 'Standard',
    statut: d.statut || d.status || 'Opérationnel',
    status: d.status || d.statut || 'Opérationnel',
    conforme: d.conforme || 'Oui',
    statutVoyant: d.statutVoyant || d.statut_voyant || 'Vert OK',
    statut_voyant: d.statut_voyant || d.statutVoyant || 'Vert OK',
    etatHousse: d.etatHousse || d.etat_housse || 'Conforme',
    etat_housse: d.etat_housse || d.etatHousse || 'Conforme',

    commentaireAdresse: d.commentaireAdresse || d.aide_acces || '',
    aide_acces: d.aide_acces || d.commentaireAdresse || '',
    numVoie: d.numVoie || d.numero_et_voie || d.adresse || '',
    numero_et_voie: d.numero_et_voie || d.numVoie || d.adresse || '',
    adresse: d.adresse || d.numVoie || d.numero_et_voie || '',
    cp: d.cp || d.code_postal || '',
    code_postal: d.code_postal || d.cp || '',
    ville: d.ville || d.city || '',
    city: d.city || d.ville || '',
    region: d.region || '',
    pays: d.pays || d.country || '',
    country: d.country || d.pays || '',
    latitude: d.latitude || d.lat || '',
    lat: d.lat || d.latitude || '',
    longitude: d.longitude || d.lon || d.lng || '',
    lon: d.lon || d.longitude || '',
    lng: d.lng || d.longitude || '',
    nomPrenomSite: d.nomPrenomSite || d.nom_prenom || d.nom_site || '',
    nom_prenom: d.nom_prenom || d.nomPrenomSite || d.nom_site || '',
    nom_site: d.nom_site || d.nomPrenomSite || d.nom_prenom || '',
    nomSite: d.nomSite || d.nom_site || d.nomPrenomSite || '',
    categorieEtablissement: d.categorieEtablissement || d.categorie_etablissement || '',
    categorie_etablissement: d.categorie_etablissement || d.categorieEtablissement || '',
    telephoneSite: d.telephoneSite || d.telephone_portable || d.telephone_site || d.phone || d.tel || '',
    telephone_portable: d.telephone_portable || d.telephoneSite || d.telephone_site || d.phone || d.tel || '',
    telephone_site: d.telephone_site || d.telephoneSite || d.telephone_portable || d.phone || d.tel || '',
    emailSite: d.emailSite || d.email || d.email_site || '',
    email: d.email || d.emailSite || d.email_site || '',
    email_site: d.email_site || d.emailSite || d.email || '',
    commentaire: d.commentaire || d.notes || d.note || '',
    notes: d.notes || d.commentaire || '',
    commentaireInterne: d.commentaireInterne || d.commentaire_interne || '',
    commentaire_interne: d.commentaire_interne || d.commentaireInterne || '',
    horaires: d.horaires || '',

    finGarantie: d.finGarantie || d.fin_garantie || d.expiration_garantie || '',
    fin_garantie: d.fin_garantie || d.finGarantie || d.expiration_garantie || '',
    fabrication: d.fabrication || d.date_fabrication || '',
    date_fabrication: d.date_fabrication || d.fabrication || '',
    miseEnService: d.miseEnService || d.mise_en_service || '',
    mise_en_service: d.mise_en_service || d.miseEnService || '',
    sortieFabricant: d.sortieFabricant || d.sortie_fabricant || '',
    sortie_fabricant: d.sortie_fabricant || d.sortieFabricant || '',

    contrat: d.contrat || d.nomContrat || d.nom_contrat || '',
    nomContrat: d.nomContrat || d.nom_contrat || d.contrat || '',
    nom_contrat: d.nom_contrat || d.nomContrat || d.contrat || '',
    referenceContrat: d.referenceContrat || d.reference_contrat || '',
    reference_contrat: d.reference_contrat || d.referenceContrat || '',
    debutContrat: d.debutContrat || d.debut_contrat || '',
    debut_contrat: d.debut_contrat || d.debutContrat || '',
    finContrat: d.finContrat || d.fin_contrat || '',
    fin_contrat: d.fin_contrat || d.finContrat || '',
    payeurId: d.payeurId || d.payeur_id || '',
    payeur_id: d.payeur_id || d.payeurId || '',
    clientIdField: d.clientIdField || d.client_id_field || '',
    client_id_field: d.client_id_field || d.clientIdField || '',

    acces247: d.acces247 !== undefined ? d.acces247 : (d.acces_247 !== undefined ? d.acces_247 : false),
    acces_247: d.acces_247 !== undefined ? d.acces_247 : (d.acces247 !== undefined ? d.acces247 : false),
    acces_247_bool: toBoolean(d.acces247 ?? d.acces_247, false),
    accesSemaine: d.accesSemaine !== undefined ? d.accesSemaine : (d.acces_semaine !== undefined ? d.acces_semaine : false),
    acces_semaine: d.acces_semaine !== undefined ? d.acces_semaine : (d.accesSemaine !== undefined ? d.accesSemaine : false),
    acces_semaine_bool: toBoolean(d.accesSemaine ?? d.acces_semaine, false),
    accesWeekend: d.accesWeekend !== undefined ? d.accesWeekend : (d.acces_weekend !== undefined ? d.acces_weekend : false),
    acces_weekend: d.acces_weekend !== undefined ? d.acces_weekend : (d.accesWeekend !== undefined ? d.accesWeekend : false),
    acces_weekend_bool: toBoolean(d.accesWeekend ?? d.acces_weekend, false),
    exterieur: d.exterieur !== undefined ? d.exterieur : false,
    exterieur_bool: toBoolean(d.exterieur, false),

    numeroAtlasante: d.numeroAtlasante || d.numero_atlasante || '',
    numero_atlasante: d.numero_atlasante || d.numeroAtlasante || '',
    versionLogiciel: d.versionLogiciel || d.version_logiciel || '',
    version_logiciel: d.version_logiciel || d.versionLogiciel || '',

    // Catégories & Suivi opérationnel
    loue: d.loue || 'Non',
    prete: d.prete || 'Non',
    stocke: d.stocke || 'Non',
    archive: d.archive || 'Non',
    sousTraitance: d.sousTraitance || d.sous_traitance || 'Non',
    sous_traitance: d.sous_traitance || d.sousTraitance || 'Non',
    fsmAutorise: d.fsmAutorise || d.fsm_autorise || d.maintenance_autorisee || d.maintenanceAutorisee || 'Oui',
    fsm_autorise: d.fsm_autorise || d.fsmAutorise || d.maintenance_autorisee || d.maintenanceAutorisee || 'Oui',
    maintenance_autorisee: d.maintenance_autorisee || d.maintenanceAutorisee || d.fsmAutorise || d.fsm_autorise || 'Oui',
    maintenanceAutorisee: d.maintenanceAutorisee || d.maintenance_autorisee || d.fsmAutorise || d.fsm_autorise || 'Oui',
    maintenance_autorisee_bool: toBoolean(d.maintenance_autorisee ?? d.maintenanceAutorisee ?? d.fsmAutorise ?? d.fsm_autorise ?? 'Oui', true),
    fsm_autorise_bool: toBoolean(d.fsmAutorise ?? d.fsm_autorise ?? d.maintenance_autorisee ?? d.maintenanceAutorisee ?? 'Oui', true),
    victimeSurvie: d.victimeSurvie || d.victime_survie || 'Non',
    victime_survie: d.victime_survie || d.victimeSurvie || 'Non',
    victimeSansSurvie: d.victimeSansSurvie || d.victime_sans_survie || 'Non',
    victime_sans_survie: d.victime_sans_survie || d.victimeSansSurvie || 'Non',
    ageVictime: d.ageVictime || d.age_victime || '',
    age_victime: d.age_victime || d.ageVictime || '',
    commentaireCampagneRappel: d.commentaireCampagneRappel || d.commentaire_campagne_rappel || '',
    commentaire_campagne_rappel: d.commentaire_campagne_rappel || d.commentaireCampagneRappel || '',
    rappelMensuelAuto: d.rappelMensuelAuto || d.rappel_mensuel_auto || 'Non',
    rappel_mensuel_auto: d.rappel_mensuel_auto || d.rappelMensuelAuto || 'Non',
    rappelHebdoAuto: d.rappelHebdoAuto || d.rappel_hebdo_auto || 'Non',
    rappel_hebdo_auto: d.rappel_hebdo_auto || d.rappelHebdoAuto || 'Non',
    rappelJournalierAuto: d.rappelJournalierAuto || d.rappel_journalier_auto || 'Non',
    rappel_journalier_auto: d.rappel_journalier_auto || d.rappelJournalierAuto || 'Non',

    clientId: d.clientId || d.client_id || '',
    client_id: d.client_id || d.clientId || '',
    clientNom: d.clientNom || d.client_nom || d.client || '',
    client_nom: d.client_nom || d.clientNom || d.client || ''
  };
}

// Fast lookup for a single defibrillator across in-memory cache, disk, and Firestore chunks with early-exit
async function findSingleDefibrillateur(
  rawSubId: string,
  tenantId: string,
  extraAliases: (string | undefined | null)[] = []
): Promise<{ defib: any; tenant: string; chunkIdx?: number } | null> {
  const unescaped = decodeURIComponent(rawSubId).trim();
  const strippedSubId = unescaped.replace(/^[:=]+/, '').replace(/^['"]|['"]$/g, '').trim();
  const cleanSubId = strippedSubId || unescaped;
  if (!cleanSubId) return null;
  const matcher = matchesDefibWith(cleanSubId);

  // 0. FASTEST PATH: Check fastDefibIndex (0.001ms O(1) lookup)
  const normKey = normalizeDefibLookupKey(cleanSubId);
  const normUnescaped = normalizeDefibLookupKey(unescaped);
  const lowerKey = cleanSubId.toLowerCase();
  const lowerClean = lowerKey.replace(/[^a-z0-9]/g, '');

  const indexed = fastDefibIndex.get(cleanSubId) || 
                  fastDefibIndex.get(lowerKey) || 
                  fastDefibIndex.get(`:${cleanSubId}`) || 
                  fastDefibIndex.get(`:${lowerKey}`) || 
                  fastDefibIndex.get(unescaped) || 
                  fastDefibIndex.get(unescaped.toLowerCase()) || 
                  (normKey ? fastDefibIndex.get(normKey) : null) ||
                  (normUnescaped ? fastDefibIndex.get(normUnescaped) : null);
  if (indexed && indexed.defib) {
    const lk = normKey || lowerClean || lowerKey;
    const tuple = defibLocationIndex.get(lk) || defibLocationIndex.get(lowerKey);
    return { ...indexed, chunkIdx: tuple ? tuple[3] : undefined };
  }

  // 1. FAST PATH: Check in-memory store for tenant candidates and all cached defibrillateur collections (0.05ms)
  const normTenant = tenantId ? tenantId.trim().toLowerCase() : 'demo';
  const numTenant = normTenant.replace(/^d/i, '');
  const candidateKeys = Array.from(new Set([
    `${normTenant}_defibrillateurs`,
    `d${numTenant}_defibrillateurs`,
    `${numTenant}_defibrillateurs`,
    'D58_defibrillateurs',
    'D27_defibrillateurs',
    'D18_defibrillateurs',
    'defibrillateurs',
    'demo_defibrillateurs',
    ...extraAliases.map(a => a ? `${String(a).trim().toLowerCase()}_defibrillateurs` : '')
  ].filter(Boolean)));

  for (const k of candidateKeys) {
    if (serverMemoryStore.has(k)) {
      const items = serverMemoryStore.get(k);
      if (Array.isArray(items)) {
        const tName = k.replace(/_defibrillateurs$/, '');
        for (const item of items) {
          indexDefibrillateur(item, tName);
        }
        const found = items.find(matcher);
        if (found) {
          return { defib: found, tenant: tName };
        }
      }
    }
  }

  // Also check all other cached memory entries ending with _defibrillateurs
  for (const [k, items] of serverMemoryStore.entries()) {
    if (k.endsWith('_defibrillateurs') && Array.isArray(items)) {
      const tName = k.replace(/_defibrillateurs$/, '');
      for (const item of items) {
        indexDefibrillateur(item, tName);
      }
      const found = items.find(matcher);
      if (found) {
        return { defib: found, tenant: tName };
      }
    }
  }

  // 2. DISK CACHE: Check local disk collections in COLLECTIONS_DIR (1ms)
  try {
    if (fs.existsSync(COLLECTIONS_DIR)) {
      const files = fs.readdirSync(COLLECTIONS_DIR).filter(f => f.includes('defibrillateurs') && f.endsWith('.json'));
      for (const f of files) {
        try {
          const filePath = path.join(COLLECTIONS_DIR, f);
          const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          if (Array.isArray(content)) {
            const tName = f.replace(/_defibrillateurs\.json$/, '');
            serverMemoryStore.set(`${tName}_defibrillateurs`, content);
            serverStoreTimestamps.set(`${tName}_defibrillateurs`, Date.now());
            for (const item of content) {
              indexDefibrillateur(item, tName);
            }
            const found = content.find(matcher);
            if (found) {
              return { defib: found, tenant: tName };
            }
          }
        } catch (_) {}
      }
    }
  } catch (_) {}

  // 3. INSTANT COMPACT INDEX LOOKUP (O(1) identifies exact chunk in < 1ms, loads only that chunk)
  loadCompactIndexSync();
  const indexLookupKeys = [
    lowerClean,
    lowerKey,
    cleanSubId,
    normKey,
    unescaped.toLowerCase(),
    normUnescaped
  ].filter(Boolean);

  for (const lk of indexLookupKeys) {
    const tuple = defibLocationIndex.get(lk);
    if (tuple) {
      const [id, identifiant, sn, chunkIdx, env] = tuple;
      let chunkItems = loadChunkFileSync(chunkIdx);
      if (!chunkItems || chunkItems.length === 0) {
        chunkItems = await fetchChunkRest(chunkIdx);
      }
      if (chunkItems && Array.isArray(chunkItems)) {
        const found = chunkItems.find(matcher);
        if (found) {
          const fastKey = normalizeDefibLookupKey(found.numeroSerie || found.identifiant || found.id);
          const cachedFast = fastDefibIndex.get(fastKey)?.defib;
          const finalDefib = cachedFast ? { ...found, ...cachedFast } : found;
          return { defib: finalDefib, tenant: env || tenantId || 'D58', chunkIdx };
        }
      }
    }
  }

  // 4. DISK CHUNK CACHE FALLBACK (Only if compact index was empty)
  if (defibLocationIndex.size === 0) {
    try {
      if (fs.existsSync(CHUNKS_DIR)) {
        const chunkFiles = fs.readdirSync(CHUNKS_DIR).filter(f => f.includes('defibrillateurs') && f.endsWith('.json'));
        for (const cf of chunkFiles) {
          try {
            const chunkPath = path.join(CHUNKS_DIR, cf);
            const arr = JSON.parse(fs.readFileSync(chunkPath, 'utf-8'));
            if (Array.isArray(arr)) {
              for (const item of arr) {
                indexDefibrillateur(item, tenantId || 'D58');
              }
              const found = arr.find(matcher);
              if (found) {
                return { defib: found, tenant: tenantId || 'D58' };
              }
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  // 5. REST TARGETED FALLBACK (Strict 2.5s timeout, never hangs)
  try {
    const docKey = (tenantId === 'demo' || tenantId === 'defibrillateurs') ? 'defibrillateurs' : `${tenantId || 'D58'}_defibrillateurs`;
    const apiKey = PROD_FIREBASE_CONFIG.apiKey;
    const url = `https://firestore.googleapis.com/v1/projects/defibeo/databases/(default)/documents/appData/${docKey}?key=${apiKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const json: any = await res.json();
      if (json.fields?.value?.arrayValue?.values) {
        const unwrap = (val: any): any => {
          if (!val || typeof val !== 'object') return val;
          if ('stringValue' in val) return val.stringValue;
          if ('integerValue' in val) return parseInt(val.integerValue, 10);
          if ('doubleValue' in val) return parseFloat(val.doubleValue);
          if ('booleanValue' in val) return val.booleanValue;
          if ('mapValue' in val) {
            const o: any = {};
            for (const [k, v] of Object.entries(val.mapValue.fields || {})) o[k] = unwrap(v);
            return o;
          }
          if ('arrayValue' in val) return (val.arrayValue.values || []).map(unwrap);
          return val;
        };
        const items = json.fields.value.arrayValue.values.map(unwrap);
        for (const it of items) indexDefibrillateur(it, tenantId || 'D58');
        const found = items.find(matcher);
        if (found) return { defib: found, tenant: tenantId || 'D58' };
      }
    }
  } catch (_) {}

  return null;
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
        if ((cleanTid === 'd58' && itemEnv === 'd27') || (cleanTid === 'd27' && itemEnv === 'd58')) return true;
        if (colName === 'defibrillateurs' || colName === 'defibs' || colName === 'devices') {
          return true;
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

  // 1. FAST PATH: Check in-memory store first (authoritative backend store)
  if (serverMemoryStore.has(canonicalKey)) {
    const memVal = serverMemoryStore.get(canonicalKey);
    if (memVal !== undefined && memVal !== null) {
      // Don't return placeholder defibrillateurs if Firestore has large chunked dataset
      if (colName === 'defibrillateurs' && Array.isArray(memVal) && memVal.length <= 1) {
        // Fall through to query Firestore
      } else {
        return sanitizeForTenant(memVal);
      }
    }
  }

  // 1b. Dedicated collection file on disk
  const colFile = path.join(COLLECTIONS_DIR, `${canonicalKey}.json`);
  if (fs.existsSync(colFile)) {
    try {
      const diskVal = JSON.parse(fs.readFileSync(colFile, 'utf-8'));
      if (diskVal !== undefined && diskVal !== null) {
        if (colName === 'defibrillateurs' && Array.isArray(diskVal) && diskVal.length <= 1) {
          // Fall through
        } else {
          serverMemoryStore.set(canonicalKey, diskVal);
          serverStoreTimestamps.set(canonicalKey, Date.now());
          return sanitizeForTenant(diskVal);
        }
      }
    } catch (_) {}
  }

  // 2. Helper to load a single candidate key from Firestore safely
  async function loadKeyFromFirestore(key: string): Promise<{ type: string; items?: any[]; data?: any; isChunked?: boolean } | null> {
    try {
      // Fast path: try REST first (strict 2000ms timeout, returns 404 in <150ms without hanging)
      let payload = await fetchFirestoreDocumentRest(key, 2000);
      if (!payload) {
        // Fallback to getDoc with 1500ms timeout
        const docRef = doc(db, 'appData', key);
        const snap = await withTimeout(getDoc(docRef), 1500, null);
        if (snap && snap.exists()) {
          payload = snap.data() || null;
        }
      }
      if (!payload) return null;

      // Handle chunked storage for large datasets (e.g. defibrillateurs)
      if (payload._chunked && typeof payload.chunksCount === 'number' && payload.chunksCount > 0) {
        const count = payload.chunksCount;
        const effectivePrefix = payload.chunkPrefix || payload.chunkKeyPrefix || key;
        const chunkResults: any[][] = new Array(count);

        // Check disk chunks first (instant, 0 network calls)
        let loadedAllFromDisk = true;
        for (let idx = 0; idx < count; idx++) {
          const diskItems = loadChunkFileSync(idx, effectivePrefix);
          if (diskItems && Array.isArray(diskItems)) {
            chunkResults[idx] = diskItems;
          } else {
            loadedAllFromDisk = false;
            break;
          }
        }

        if (loadedAllFromDisk) {
          const combined = chunkResults.filter(Boolean).flat();
          return { type: 'array', items: combined, isChunked: true };
        }

        // If not all on disk, load only first 5 chunks for fast initial response
        const chunksToLoad = Math.min(count, 5);
        for (let idx = 0; idx < chunksToLoad; idx++) {
          let items = loadChunkFileSync(idx, effectivePrefix);
          if (!items) {
            items = await fetchChunkRest(idx, effectivePrefix);
          }
          if (items && Array.isArray(items)) {
            chunkResults[idx] = items;
          }
        }
        const combined = chunkResults.filter(Boolean).flat();
        return { type: 'array', items: combined, isChunked: true };
      }

      if (Array.isArray(payload.value)) {
        return { type: 'array', items: payload.value, isChunked: false };
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
          // If this is defibrillateurs and has only 1 placeholder item (and not chunked),
          // continue checking subsequent candidates to see if the full chunked dataset exists!
          if (colName === 'defibrillateurs' && !val.isChunked && val.items.length <= 1) {
            continue;
          }
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

  // 5. Fallback: check in-memory store for candidate keys
  for (const k of allCandidateKeys) {
    if (serverMemoryStore.has(k)) {
      const val = serverMemoryStore.get(k);
      if (val !== undefined && val !== null) {
        if (Array.isArray(val)) {
          return sanitizeForTenant(val);
        } else {
          return val;
        }
      }
    }
  }

  // Auto-healing & provisioning: ONLY for brand new tenants that have never been created or accessed
  if ((colName === 'defibrillateurs' || colName === 'defibs' || colName === 'devices') && activeTenant !== 'demo') {
    // If the tenant collection was already initialized, saved, or explicitly emptied, respect it!
    if (serverMemoryStore.has(canonicalKey) || fs.existsSync(path.join(COLLECTIONS_DIR, `${canonicalKey}.json`))) {
      return [];
    }

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
  if (colName === 'defibrillateurs' && Array.isArray(items)) {
    for (const item of items) {
      indexDefibrillateur(item, activeTenant);
    }
  }
  persistServerStoreToDisk();

  for (const k of uniqueKeys) {
    try {
      const docRef = doc(db, 'appData', k);
      withTimeout(setDoc(docRef, { value: items, _chunked: false, updatedAt: new Date().toISOString() }), 8000, null).catch(() => {});
    } catch (_) {}
  }
}

async function warmupDefibrillateursStore() {
  try {
    // 1. Load the compact index immediately (1-2ms)
    loadCompactIndexSync();

    // 2. Pre-load key chunks into memory cache (e.g. chunk 0, chunk 74)
    loadChunkFileSync(74);
    loadChunkFileSync(0);

    const d58ColFile = path.join(COLLECTIONS_DIR, 'D58_defibrillateurs.json');
    const d27ColFile = path.join(COLLECTIONS_DIR, 'D27_defibrillateurs.json');
    const genericColFile = path.join(COLLECTIONS_DIR, 'defibrillateurs.json');
    
    // 3. If full collection file already exists on disk, index it
    const existingFile = [d58ColFile, d27ColFile, genericColFile].find(f => fs.existsSync(f));
    if (existingFile) {
      try {
        const content = JSON.parse(fs.readFileSync(existingFile, 'utf-8'));
        if (Array.isArray(content) && content.length > 0) {
          serverMemoryStore.set('D58_defibrillateurs', content);
          serverMemoryStore.set('D27_defibrillateurs', content);
          serverMemoryStore.set('defibrillateurs', content);
          serverStoreTimestamps.set('D58_defibrillateurs', Date.now());
          serverStoreTimestamps.set('D27_defibrillateurs', Date.now());
          serverStoreTimestamps.set('defibrillateurs', Date.now());
          for (const item of content) {
            indexDefibrillateur(item, 'D58');
          }
          console.log(`[Warmup] Pre-indexed ${content.length} defibrillateurs from disk into fastDefibIndex.`);
          return;
        }
      } catch (_) {}
    }

    // 4. Background non-blocking pre-warm of disk chunks if present
    if (fs.existsSync(CHUNKS_DIR)) {
      const chunkFiles = fs.readdirSync(CHUNKS_DIR).filter(f => f.includes('defibrillateurs') && f.endsWith('.json'));
      console.log(`[Warmup] Found ${chunkFiles.length} chunk files on disk. Pre-warming index...`);
      for (const cf of chunkFiles) {
        const match = cf.match(/_chunk_(\d+)\.json$/);
        if (match) {
          const idx = parseInt(match[1], 10);
          loadChunkFileSync(idx);
        }
      }
      console.log(`[Warmup] fastDefibIndex pre-warmed with ${fastDefibIndex.size} entries.`);
      return;
    }
  } catch (err) {
    console.warn('[Warmup] Defibrillateurs prewarm warning:', err);
  }
}

  // Real-time single defibrillator synchronization endpoint from browser client to server
  app.post("/api/sync-single-defib", async (req, res) => {
    try {
      const { tenantId, defib } = req.body;
      if (!defib || typeof defib !== 'object') {
        return res.status(400).json({ error: "defib object requis." });
      }
      const rawTenant = String(tenantId || defib.envId || defib.tenantId || 'D27').trim();
      const targetId = (defib.id || defib.identifiant || defib.numeroSerie || defib.num_serie || '').trim();
      if (!targetId) {
        return res.status(400).json({ error: "Identifiant ou numéro de série requis." });
      }

      const formatted = formatDefibrillateurOutput(defib);
      indexDefibrillateur(formatted, rawTenant);

      const locKey = normalizeDefibLookupKey(targetId);
      let tuple = defibLocationIndex.get(locKey);
      if (!tuple) {
        const idLower = targetId.toLowerCase();
        for (const [k, tup] of defibLocationIndex.entries()) {
          if (k === idLower || (idLower.length > 5 && k.includes(idLower))) {
            tuple = tup;
            break;
          }
        }
      }
      const chunkIdx = tuple && typeof tuple[3] === 'number' ? tuple[3] : undefined;

      if (typeof chunkIdx === 'number') {
        saveSingleDefibrillateurToChunk(formatted, chunkIdx, 'D27_defibrillateurs');
      }

      // Also update in memory store if collection is loaded
      const candidateKeys = [
        rawTenant === 'demo' ? 'defibrillateurs' : `${rawTenant}_defibrillateurs`,
        'D27_defibrillateurs',
        'D58_defibrillateurs'
      ];
      for (const ck of candidateKeys) {
        if (serverMemoryStore.has(ck)) {
          const arr = serverMemoryStore.get(ck);
          if (Array.isArray(arr)) {
            const idx = arr.findIndex(d => d && (d.id === defib.id || d.identifiant === defib.identifiant || d.numeroSerie === defib.numeroSerie));
            if (idx >= 0) {
              arr[idx] = { ...arr[idx], ...formatted };
            } else {
              arr.push(formatted);
            }
          }
        }
      }

      return res.json({ status: "success", defib: formatted });
    } catch (err: any) {
      console.error("Error in /api/sync-single-defib:", err);
      return res.status(500).json({ error: err.message || "Erreur de synchronisation du défibrillateur." });
    }
  });

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
      
      if (value !== undefined && value !== null) {
        const finalValueToStore = value;

        serverMemoryStore.set(collectionKey, finalValueToStore);
        serverStoreTimestamps.set(collectionKey, Date.now());
        persistSingleCollectionToDisk(collectionKey, finalValueToStore);

        // Also map normalized key if D-prefixed or numeric
        if (/^d\d+$/i.test(rawTenant) || /^\d+$/.test(rawTenant)) {
          const numOnly = rawTenant.replace(/^d/i, '');
          serverMemoryStore.set(`D${numOnly}_${collectionName}`, finalValueToStore);
          serverStoreTimestamps.set(`D${numOnly}_${collectionName}`, Date.now());
          persistSingleCollectionToDisk(`D${numOnly}_${collectionName}`, finalValueToStore);

          serverMemoryStore.set(`d${numOnly}_${collectionName}`, finalValueToStore);
          serverStoreTimestamps.set(`d${numOnly}_${collectionName}`, Date.now());
          serverMemoryStore.set(`${numOnly}_${collectionName}`, finalValueToStore);
          serverStoreTimestamps.set(`${numOnly}_${collectionName}`, Date.now());
        }
        if (Array.isArray(value) && value.length > 20) {
          persistServerStoreToDiskNow();
        } else {
          persistServerStoreToDisk();
        }
      }

      // Also attempt asynchronous Firestore save
      try {
        const jsonStr = JSON.stringify(value);
        if (Array.isArray(value) && jsonStr.length > 400000) {
          const items = value;
          const avgItemLen = Math.max(1, Math.ceil(jsonStr.length / items.length));
          const chunkSize = Math.max(50, Math.floor(450000 / avgItemLen));
          const chunksCount = Math.ceil(items.length / chunkSize);
          (async () => {
            try {
              for (let i = 0; i < chunksCount; i++) {
                const chunkItems = items.slice(i * chunkSize, (i + 1) * chunkSize);
                const chunkRef = doc(db, 'appData', `${collectionKey}_chunk_${i}`);
                await setDoc(chunkRef, { value: chunkItems });
              }
              const mainDocRef = doc(db, 'appData', collectionKey);
              await setDoc(mainDocRef, {
                _chunked: true,
                chunksCount,
                totalItems: items.length,
                updatedAt: new Date().toISOString()
              });
            } catch (err) {
              console.warn(`Server chunked Firestore sync error for ${collectionKey}:`, err);
            }
          })();
        } else {
          const docRef = doc(db, 'appData', collectionKey);
          setDoc(docRef, { value, _chunked: false }).catch(() => {});
        }
      } catch (e) {}

      return res.json({ status: "success", syncedKey: collectionKey, count: Array.isArray(value) ? value.length : 1 });
    } catch (err: any) {
      console.error("Error in /api/sync-collection:", err);
      return res.status(500).json({ error: err.message || "Erreur interne de synchronisation." });
    }
  });

  // Dedicated chunked sync endpoint for massive collections (18,000+ items)
  app.post("/api/sync-collection-chunk", (req, res) => {
    try {
      const { collectionName, tenantId, chunkIndex, totalChunks, chunkItems, totalCount } = req.body;
      if (!collectionName || !tenantId || typeof chunkIndex !== 'number' || typeof totalChunks !== 'number' || !Array.isArray(chunkItems)) {
        return res.status(400).json({ error: "Paramètres de chunk invalides." });
      }

      const rawTenant = String(tenantId).trim();
      const collectionKey = rawTenant === 'demo' ? collectionName : `${rawTenant}_${collectionName}`;
      const bufferKey = `${collectionKey}_buffer`;

      let buffer = syncChunkBuffers.get(bufferKey);
      if (!buffer || buffer.totalChunks !== totalChunks || (Date.now() - buffer.lastUpdated > 180000)) {
        buffer = {
          collectionName,
          tenantId: rawTenant,
          canonicalKey: collectionKey,
          totalChunks,
          totalCount: totalCount || 0,
          chunks: new Array(totalChunks).fill(null),
          lastUpdated: Date.now()
        };
        syncChunkBuffers.set(bufferKey, buffer);
      }

      buffer.chunks[chunkIndex] = chunkItems;
      buffer.lastUpdated = Date.now();

      // Check if all chunks have been received
      const receivedCount = buffer.chunks.filter(c => c !== null).length;
      if (receivedCount === totalChunks) {
        // Assemble all chunks
        const completeItems: any[] = [];
        for (const c of buffer.chunks) {
          if (Array.isArray(c)) {
            completeItems.push(...c);
          }
        }
        syncChunkBuffers.delete(bufferKey);

        // Store to memory and disk
        serverMemoryStore.set(collectionKey, completeItems);
        serverStoreTimestamps.set(collectionKey, Date.now());
        persistSingleCollectionToDisk(collectionKey, completeItems);

        if (/^d\d+$/i.test(rawTenant) || /^\d+$/.test(rawTenant)) {
          const numOnly = rawTenant.replace(/^d/i, '');
          serverMemoryStore.set(`D${numOnly}_${collectionName}`, completeItems);
          serverStoreTimestamps.set(`D${numOnly}_${collectionName}`, Date.now());
          persistSingleCollectionToDisk(`D${numOnly}_${collectionName}`, completeItems);

          serverMemoryStore.set(`d${numOnly}_${collectionName}`, completeItems);
          serverStoreTimestamps.set(`d${numOnly}_${collectionName}`, Date.now());
          serverMemoryStore.set(`${numOnly}_${collectionName}`, completeItems);
          serverStoreTimestamps.set(`${numOnly}_${collectionName}`, Date.now());
        }
        persistServerStoreToDiskNow();

        console.log(`[Sync Chunk Relay] Successfully assembled all ${totalChunks} chunks for ${collectionKey} (${completeItems.length} items)`);
        return res.json({ status: "success", complete: true, totalItems: completeItems.length });
      }

      return res.json({ status: "chunk_received", chunkIndex, totalChunks, receivedCount });
    } catch (err: any) {
      console.error("Error in /api/sync-collection-chunk:", err);
      return res.status(500).json({ error: err.message || "Erreur interne de chunking." });
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

  // Dedicated email dispatch proxy via Google Apps Script (handles redirections, logs, avoids browser CORS/extensions)
  app.post("/api/send-email", async (req, res) => {
    try {
      const { to, subject, body, htmlBody, replyTo, scriptUrl } = req.body || {};
      if (!to || !subject) {
        return res.status(400).json({ status: "error", message: "Missing recipient (to) or subject" });
      }

      const targetUrl = (scriptUrl && String(scriptUrl).trim()) ||
        process.env.VITE_APPS_SCRIPT_URL ||
        'https://script.google.com/macros/s/AKfycbzx6ElCSC7A5dWvE5fdBJMAQOmYbsnjVs1ttQ0g9ktrJtln7ei9Pl3Em3ine99CrI0/exec';

      const payload: any = {
        to: String(to).trim(),
        subject: String(subject).trim(),
        body: body || '',
        replyTo: replyTo || 'defibeo@gmail.com'
      };
      if (htmlBody) {
        payload.htmlBody = htmlBody;
      }

      console.log(`[API /api/send-email] Dispatching email to "${payload.to}" with subject "${payload.subject}" via Apps Script: ${targetUrl}`);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'follow'
      });

      const responseText = await response.text();
      console.log(`[API /api/send-email] Google Apps Script responded (status ${response.status}):`, responseText.slice(0, 200));

      return res.json({
        status: "success",
        serverStatus: response.status,
        result: responseText
      });
    } catch (err: any) {
      console.error("[API /api/send-email] Error:", err);
      return res.status(500).json({ status: "error", message: err?.message || String(err) });
    }
  });

  const SENSITIVE_REQUEST_ERROR = "Requête sensible, veuillez contacter le support.";

  function checkSensitiveOrNonCompliantRequest(req: express.Request, targetTenant: any, cleanPath: string): { isBlocked: boolean; reason: string } {
    // 1. Allow GET, POST, PUT, PATCH
    if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
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
    if (overrideHeader && !['GET', 'POST', 'PUT', 'PATCH'].includes(overrideHeader)) {
      return { isBlocked: true, reason: SENSITIVE_REQUEST_ERROR };
    }

    // 3. Inspect body for POST/PUT/PATCH requests
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
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
          body.method === 'DELETE'
        ) {
          return { isBlocked: true, reason: SENSITIVE_REQUEST_ERROR };
        }

        // Strict blocking of hiding/archiving payloads (masquer/archive, but not the AED kit mask 'masque')
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
      'variable',
      'crm',
      'clients',
      'client',
      'defibrillateurs',
      'defibrillateur',
      'defibs',
      'defib',
      'devices',
      'device',
      'dae',
      'materiels',
      'materiel',
      'commandes',
      'commande',
      'tournees',
      'tournee',
      'missions',
      'mission',
      'rapports',
      'rapport',
      'stocks',
      'stock',
      'formations',
      'formation'
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
        (req.headers['x-environnement'] as string) ||
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
      if (cleanPath.startsWith('clients') || cleanPath.startsWith('client')) {
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
              tenantId: tenantId,
              updatedAt: new Date().toISOString(),
              _lastSource: 'api'
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

        // Clean subId: remove leading colon ':', '=', quotes, and surrounding whitespace
        if (subId) {
          subId = decodeURIComponent(subId)
            .replace(/^[:=]+/, '')
            .replace(/^['"]|['"]$/g, '')
            .trim();
        }

        // FAST-TRACK FOR SINGLE DEFIBRILLATEUR GET:
        // Avoid loading entire collections or running multi-alias full collection fetches.
        // Uses findSingleDefibrillateur with direct tenant targeting, chunk early-exit & strict timeout.
        if (req.method === 'GET' && subId) {
          const rawSubId = subId;
          const lookupResult = await findSingleDefibrillateur(rawSubId, tenantId, tenantAliases);
          if (lookupResult && lookupResult.defib) {
            const formattedFound = formatDefibrillateurOutput(lookupResult.defib);
            return sendOptimizedJson(req, res, {
              status: "success",
              environnement: targetTenant.shortEnvId || tenantId || lookupResult.tenant,
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
          date_peremption_batterie: 'peremptionBatterie',
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
          fabrication_b: 'fabricationBatterie',
          fabrication_batterie: 'fabricationBatterie',
          date_fabrication_batterie: 'fabricationBatterie',
          fabricationBatterie: 'fabricationBatterie',
          has_batterie_secours: 'hasBatterieSecours',
          hasBatterieSecours: 'hasBatterieSecours',
          modele_secours_b: 'modeleBatterieSecoursId',
          modeleBatterieSecoursId: 'modeleBatterieSecoursId',
          modeleBatterieSecours: 'modeleBatterieSecoursId',
          lot_secours_b: 'lotBatterieSecours',
          lotBatterieSecours: 'lotBatterieSecours',
          peremption_secours_b: 'peremptionBatterieSecours',
          date_peremption_secours_b: 'peremptionBatterieSecours',
          peremptionBatterieSecours: 'peremptionBatterieSecours',

          // Electrode A (Mixte / Adulte)
          lot_a: 'lotElectrodeA',
          lot_electrode_a: 'lotElectrodeA',
          electrode_a_lot: 'lotElectrodeA',
          lotElectrodeA: 'lotElectrodeA',
          peremption_a: 'peremptionElectrodeA',
          peremption_electrode_a: 'peremptionElectrodeA',
          electrode_a_peremption: 'peremptionElectrodeA',
          date_peremption_a: 'peremptionElectrodeA',
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
          has_electrode_a_secours: 'hasElectrodeASecours',
          hasElectrodeASecours: 'hasElectrodeASecours',
          modele_secours_a: 'modeleElectrodeASecoursId',
          modeleElectrodeASecoursId: 'modeleElectrodeASecoursId',
          modeleElectrodeASecours: 'modeleElectrodeASecoursId',
          lot_secours_a: 'lotElectrodeASecours',
          lotElectrodeASecours: 'lotElectrodeASecours',
          has_padpak_a: 'hasPadpakA',
          hasPadpakA: 'hasPadpakA',
          lot_padpak_a: 'lotPadpakA',
          lotPadpakA: 'lotPadpakA',
          peremption_padpak_a: 'peremptionPadpakA',
          date_peremption_padpak_a: 'peremptionPadpakA',
          peremptionPadpakA: 'peremptionPadpakA',

          // Electrode P (Pédiatrique)
          lot_p: 'lotElectrodeP',
          lot_electrode_p: 'lotElectrodeP',
          electrode_p_lot: 'lotElectrodeP',
          lotElectrodeP: 'lotElectrodeP',
          peremption_p: 'peremptionElectrodeP',
          peremption_electrode_p: 'peremptionElectrodeP',
          electrode_p_peremption: 'peremptionElectrodeP',
          date_peremption_p: 'peremptionElectrodeP',
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
          has_electrode_p_secours: 'hasElectrodePSecours',
          hasElectrodePSecours: 'hasElectrodePSecours',
          modele_secours_p: 'modeleElectrodePSecoursId',
          modeleElectrodePSecoursId: 'modeleElectrodePSecoursId',
          modeleElectrodePSecours: 'modeleElectrodePSecoursId',
          lot_secours_p: 'lotElectrodePSecours',
          lotElectrodePSecours: 'lotElectrodePSecours',
          has_padpak_p: 'hasPadpakP',
          hasPadpakP: 'hasPadpakP',
          lot_padpak_p: 'lotPadpakP',
          lotPadpakP: 'lotPadpakP',
          peremption_padpak_p: 'peremptionPadpakP',
          date_peremption_padpak_p: 'peremptionPadpakP',
          peremptionPadpakP: 'peremptionPadpakP',

          // Coffret / Boitier
          boitier_modele: 'modeleCoffretId',
          modele_coffret: 'modeleCoffretId',
          coffret_modele: 'modeleCoffretId',
          modeleCoffret: 'modeleCoffretId',
          modeleCoffretId: 'modeleCoffretId',
          boitier_lot: 'numeroLotCoffret',
          lot_coffret: 'numeroLotCoffret',
          coffret_lot: 'numeroLotCoffret',
          numeroLotCoffret: 'numeroLotCoffret',
          commentaire_coffret: 'commentaireCoffret',
          commentaireCoffret: 'commentaireCoffret',

          // Trousse de secours (8 champs de la console web)
          ciseaux_presents: 'kitCiseauxPresents',
          ciseauxPresents: 'kitCiseauxPresents',
          ciseaux: 'kitCiseauxPresents',
          kit_ciseaux: 'kitCiseauxPresents',
          kit_ciseaux_presents: 'kitCiseauxPresents',
          kitCiseauxPresents: 'kitCiseauxPresents',

          masque_present: 'kitMasquePresent',
          masquePresent: 'kitMasquePresent',
          masque: 'kitMasquePresent',
          kit_masque: 'kitMasquePresent',
          kit_masque_present: 'kitMasquePresent',
          kitMasquePresent: 'kitMasquePresent',

          peremption_masque: 'kitPeremptionMasque',
          peremptionMasque: 'kitPeremptionMasque',
          date_peremption_masque: 'kitPeremptionMasque',
          kit_peremption_masque: 'kitPeremptionMasque',
          kitPeremptionMasque: 'kitPeremptionMasque',

          serviettes_presentes: 'kitServiettesPresentes',
          serviettesPresentes: 'kitServiettesPresentes',
          serviettes: 'kitServiettesPresentes',
          kit_serviettes: 'kitServiettesPresentes',
          kit_serviettes_presentes: 'kitServiettesPresentes',
          kitServiettesPresentes: 'kitServiettesPresentes',

          peremption_serviettes: 'kitPeremptionServiettes',
          peremptionServiettes: 'kitPeremptionServiettes',
          date_peremption_serviettes: 'kitPeremptionServiettes',
          kit_peremption_serviettes: 'kitPeremptionServiettes',
          kitPeremptionServiettes: 'kitPeremptionServiettes',

          gants_presents: 'kitGantsPresents',
          gantsPresents: 'kitGantsPresents',
          paire_gants_presents: 'kitGantsPresents',
          paireGantsPresents: 'kitGantsPresents',
          gants: 'kitGantsPresents',
          kit_gants: 'kitGantsPresents',
          kit_gants_presents: 'kitGantsPresents',
          kitGantsPresents: 'kitGantsPresents',

          rasoir_present: 'kitRasoirPresent',
          rasoirPresent: 'kitRasoirPresent',
          rasoir: 'kitRasoirPresent',
          kit_rasoir: 'kitRasoirPresent',
          kit_rasoir_present: 'kitRasoirPresent',
          kitRasoirPresent: 'kitRasoirPresent',

          peremption_trousse: 'peremptionTrousse',
          peremptionTrousse: 'peremptionTrousse',
          date_peremption_trousse: 'peremptionTrousse',
          trousse_peremption: 'peremptionTrousse',

          // Matériel DAE
          modele: 'modeleId',
          modele_dae: 'modeleId',
          model: 'modeleId',
          modeleId: 'modeleId',
          marque: 'marque',
          brand: 'marque',
          statut: 'statut',
          status: 'statut',
          statut_operationnel: 'statut',
          etat: 'statut',
          conforme: 'conforme',
          conformite: 'conforme',
          statut_voyant: 'statutVoyant',
          statutVoyant: 'statutVoyant',
          etat_housse: 'etatHousse',
          etatHousse: 'etatHousse',

          // Localisation & Site
          aide_acces: 'commentaireAdresse',
          commentaire_adresse: 'commentaireAdresse',
          commentaireAdresse: 'commentaireAdresse',
          numero_et_voie: 'numVoie',
          adresse: 'numVoie',
          rue: 'numVoie',
          adresse_voie: 'numVoie',
          numVoie: 'numVoie',
          code_postal: 'cp',
          zip: 'cp',
          postal_code: 'cp',
          cp: 'cp',
          ville: 'ville',
          city: 'ville',
          region: 'region',
          departement: 'region',
          pays: 'pays',
          country: 'pays',
          latitude: 'latitude',
          lat: 'latitude',
          longitude: 'longitude',
          lon: 'longitude',
          lng: 'longitude',
          nom_prenom: 'nomPrenomSite',
          nom_site: 'nomPrenomSite',
          nomPrenomSite: 'nomPrenomSite',
          nomSite: 'nomSite',
          categorie_etablissement: 'categorieEtablissement',
          categorieEtablissement: 'categorieEtablissement',
          telephone_site: 'telephoneSite',
          telephone_portable: 'telephoneSite',
          telephoneSite: 'telephoneSite',
          phone: 'telephoneSite',
          tel: 'telephoneSite',
          email_site: 'emailSite',
          email: 'emailSite',
          emailSite: 'emailSite',
          commentaire: 'commentaire',
          notes: 'commentaire',
          note: 'commentaire',
          commentaire_interne: 'commentaireInterne',
          commentaireInterne: 'commentaireInterne',
          horaires: 'horaires',

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
          payeur_id: 'payeurId',
          payeurId: 'payeurId',
          client_id_field: 'clientIdField',
          clientIdField: 'clientIdField',

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

          // Catégories & Suivi opérationnel
          loue: 'loue',
          prete: 'prete',
          stocke: 'stocke',
          archive: 'archive',
          sous_traitance: 'sousTraitance',
          sousTraitance: 'sousTraitance',
          maintenance_autorisee: 'fsmAutorise',
          maintenanceAutorisee: 'fsmAutorise',
          maintenance_autorise: 'fsmAutorise',
          maintenanceAutorise: 'fsmAutorise',
          fsm_autorise: 'fsmAutorise',
          fsmAutorise: 'fsmAutorise',
          victime_survie: 'victimeSurvie',
          victimeSurvie: 'victimeSurvie',
          victime_sans_survie: 'victimeSansSurvie',
          victimeSansSurvie: 'victimeSansSurvie',
          age_victime: 'ageVictime',
          ageVictime: 'ageVictime',
          commentaire_campagne_rappel: 'commentaireCampagneRappel',
          commentaireCampagneRappel: 'commentaireCampagneRappel',
          rappel_mensuel_auto: 'rappelMensuelAuto',
          rappelMensuelAuto: 'rappelMensuelAuto',
          rappel_hebdo_auto: 'rappelHebdoAuto',
          rappelHebdoAuto: 'rappelHebdoAuto',
          rappel_journalier_auto: 'rappelJournalierAuto',
          rappelJournalierAuto: 'rappelJournalierAuto',

          // Client
          client_id: 'clientId',
          clientId: 'clientId',
          client_nom: 'clientNom',
          clientNom: 'clientNom',
          client: 'clientNom',

          identifiant: 'identifiant',
          numeroSerie: 'numeroSerie',
          num_serie: 'numeroSerie',
          id: 'id'
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

        if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
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

          const singleLookup = await findSingleDefibrillateur(targetId, tenantId, tenantAliases);

          if (singleLookup && singleLookup.defib) {
            const existing = singleLookup.defib;

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
              updatedDefib.date_derniere_maintenance = dmVal;
              updatedFields.add('derniereMaintenance');
            }
            if (body.prochaineMaintenance !== undefined || body.prochaine_visite !== undefined || body.prochaine_v !== undefined) {
              const pvVal = String(body.prochaineMaintenance ?? body.prochaine_visite ?? body.prochaine_v).trim();
              updatedDefib.prochaineMaintenance = pvVal;
              updatedDefib.prochaine_visite = pvVal;
              updatedDefib.prochaine_v = pvVal;
              updatedFields.add('prochaineMaintenance');
            }
            if (body.pourcentageBatterie !== undefined || body.pourcentage_constate_b !== undefined || body.pourcentage_batterie !== undefined) {
              const pbVal = body.pourcentageBatterie ?? body.pourcentage_constate_b ?? body.pourcentage_batterie;
              updatedDefib.pourcentageBatterie = String(pbVal);
              updatedDefib.pourcentage_constate_b = typeof pbVal === 'number' ? pbVal : (parseInt(pbVal, 10) || 100);
              updatedDefib.pourcentage_batterie = updatedDefib.pourcentage_constate_b;
              updatedFields.add('pourcentageBatterie');
            }
            if (body.lotElectrodeA !== undefined || body.lot_a !== undefined || body.lot_electrode_a !== undefined) {
              const lVal = String(body.lotElectrodeA ?? body.lot_a ?? body.lot_electrode_a).trim();
              updatedDefib.lotElectrodeA = lVal;
              updatedDefib.lot_a = lVal;
              updatedDefib.lot_electrode_a = lVal;
              updatedFields.add('lotElectrodeA');
            }
            if (body.peremptionElectrodeA !== undefined || body.peremption_a !== undefined || body.peremption_electrode_a !== undefined || body.date_peremption_a !== undefined) {
              const pVal = String(body.peremptionElectrodeA ?? body.peremption_a ?? body.peremption_electrode_a ?? body.date_peremption_a).trim();
              updatedDefib.peremptionElectrodeA = pVal;
              updatedDefib.peremption_a = pVal;
              updatedDefib.peremption_electrode_a = pVal;
              updatedDefib.date_peremption_a = pVal;
              updatedFields.add('peremptionElectrodeA');
            }
            if (body.lotElectrodeP !== undefined || body.lot_p !== undefined || body.lot_electrode_p !== undefined) {
              const lVal = String(body.lotElectrodeP ?? body.lot_p ?? body.lot_electrode_p).trim();
              updatedDefib.lotElectrodeP = lVal;
              updatedDefib.lot_p = lVal;
              updatedDefib.lot_electrode_p = lVal;
              updatedFields.add('lotElectrodeP');
            }
            if (body.peremptionElectrodeP !== undefined || body.peremption_p !== undefined || body.peremption_electrode_p !== undefined || body.date_peremption_p !== undefined) {
              const pVal = String(body.peremptionElectrodeP ?? body.peremption_p ?? body.peremption_electrode_p ?? body.date_peremption_p).trim();
              updatedDefib.peremptionElectrodeP = pVal;
              updatedDefib.peremption_p = pVal;
              updatedDefib.peremption_electrode_p = pVal;
              updatedDefib.date_peremption_p = pVal;
              updatedFields.add('peremptionElectrodeP');
            }
            if (body.lotBatterie !== undefined || body.lot_b !== undefined || body.lot_batterie !== undefined) {
              const lVal = String(body.lotBatterie ?? body.lot_b ?? body.lot_batterie).trim();
              updatedDefib.lotBatterie = lVal;
              updatedDefib.lot_b = lVal;
              updatedDefib.lot_batterie = lVal;
              updatedFields.add('lotBatterie');
            }
            if (body.peremptionBatterie !== undefined || body.peremption_b !== undefined || body.peremption_batterie !== undefined || body.date_peremption_batterie !== undefined) {
              const pVal = String(body.peremptionBatterie ?? body.peremption_b ?? body.peremption_batterie ?? body.date_peremption_batterie).trim();
              updatedDefib.peremptionBatterie = pVal;
              updatedDefib.peremption_b = pVal;
              updatedDefib.peremption_batterie = pVal;
              updatedDefib.date_peremption_batterie = pVal;
              updatedFields.add('peremptionBatterie');
            }
            if (body.numeroLotCoffret !== undefined || body.boitier_lot !== undefined || body.lot_coffret !== undefined) {
              const cLot = String(body.numeroLotCoffret ?? body.boitier_lot ?? body.lot_coffret).trim();
              updatedDefib.numeroLotCoffret = cLot;
              updatedDefib.boitier_lot = cLot;
              updatedDefib.lot_coffret = cLot;
              updatedFields.add('numeroLotCoffret');
            }
            if (body.statut !== undefined || body.status !== undefined || body.statut_operationnel !== undefined || body.etat !== undefined) {
              const sVal = String(body.statut ?? body.status ?? body.statut_operationnel ?? body.etat).trim();
              updatedDefib.statut = sVal;
              updatedDefib.status = sVal;
              updatedFields.add('statut');
            }
            if (body.conforme !== undefined || body.conformite !== undefined) {
              const cVal = String(body.conforme ?? body.conformite).trim();
              updatedDefib.conforme = cVal;
              updatedFields.add('conforme');
            }
            if (body.statutVoyant !== undefined || body.statut_voyant !== undefined) {
              const vVal = String(body.statutVoyant ?? body.statut_voyant).trim();
              updatedDefib.statutVoyant = vVal;
              updatedDefib.statut_voyant = vVal;
              updatedFields.add('statutVoyant');
            }
            if (body.etatHousse !== undefined || body.etat_housse !== undefined) {
              const ehVal = String(body.etatHousse ?? body.etat_housse).trim();
              updatedDefib.etatHousse = ehVal;
              updatedDefib.etat_housse = ehVal;
              updatedFields.add('etatHousse');
            }

            // Trousse de secours (8 champs de la console web)
            if (body.peremptionTrousse !== undefined || body.peremption_trousse !== undefined || body.date_peremption_trousse !== undefined || body.trousse_peremption !== undefined) {
              const ptVal = String(body.peremptionTrousse ?? body.peremption_trousse ?? body.date_peremption_trousse ?? body.trousse_peremption).trim();
              updatedDefib.peremptionTrousse = ptVal;
              updatedDefib.peremption_trousse = ptVal;
              updatedFields.add('peremptionTrousse');
            }
            if (body.kitCiseauxPresents !== undefined || body.ciseaux_presents !== undefined || body.kit_ciseaux_presents !== undefined || body.ciseauxPresents !== undefined || body.ciseaux !== undefined || body.kit_ciseaux !== undefined) {
              const kcVal = normalizeYesNo(body.kitCiseauxPresents ?? body.ciseaux_presents ?? body.kit_ciseaux_presents ?? body.ciseauxPresents ?? body.ciseaux ?? body.kit_ciseaux, 'Oui');
              updatedDefib.kitCiseauxPresents = kcVal;
              updatedDefib.ciseaux_presents = kcVal;
              updatedDefib.kit_ciseaux_presents = kcVal;
              updatedFields.add('kitCiseauxPresents');
            }
            if (body.kitMasquePresent !== undefined || body.masque_present !== undefined || body.kit_masque_present !== undefined || body.masquePresent !== undefined || body.masque !== undefined || body.kit_masque !== undefined) {
              const kmVal = normalizeYesNo(body.kitMasquePresent ?? body.masque_present ?? body.kit_masque_present ?? body.masquePresent ?? body.masque ?? body.kit_masque, 'Oui');
              updatedDefib.kitMasquePresent = kmVal;
              updatedDefib.masque_present = kmVal;
              updatedDefib.kit_masque_present = kmVal;
              updatedFields.add('kitMasquePresent');
            }
            if (body.kitPeremptionMasque !== undefined || body.peremption_masque !== undefined || body.kit_peremption_masque !== undefined || body.peremptionMasque !== undefined || body.date_peremption_masque !== undefined) {
              const kpmVal = String(body.kitPeremptionMasque ?? body.peremption_masque ?? body.kit_peremption_masque ?? body.peremptionMasque ?? body.date_peremption_masque).trim();
              updatedDefib.kitPeremptionMasque = kpmVal;
              updatedDefib.peremption_masque = kpmVal;
              updatedDefib.kit_peremption_masque = kpmVal;
              updatedFields.add('kitPeremptionMasque');
            }
            if (body.kitServiettesPresentes !== undefined || body.serviettes_presentes !== undefined || body.kit_serviettes_presentes !== undefined || body.serviettesPresentes !== undefined || body.serviettes !== undefined || body.kit_serviettes !== undefined) {
              const ksVal = normalizeYesNo(body.kitServiettesPresentes ?? body.serviettes_presentes ?? body.kit_serviettes_presentes ?? body.serviettesPresentes ?? body.serviettes ?? body.kit_serviettes, 'Oui');
              updatedDefib.kitServiettesPresentes = ksVal;
              updatedDefib.serviettes_presentes = ksVal;
              updatedDefib.kit_serviettes_presentes = ksVal;
              updatedFields.add('kitServiettesPresentes');
            }
            if (body.kitPeremptionServiettes !== undefined || body.peremption_serviettes !== undefined || body.kit_peremption_serviettes !== undefined || body.peremptionServiettes !== undefined || body.date_peremption_serviettes !== undefined) {
              const kpsVal = String(body.kitPeremptionServiettes ?? body.peremption_serviettes ?? body.kit_peremption_serviettes ?? body.peremptionServiettes ?? body.date_peremption_serviettes).trim();
              updatedDefib.kitPeremptionServiettes = kpsVal;
              updatedDefib.peremption_serviettes = kpsVal;
              updatedDefib.kit_peremption_serviettes = kpsVal;
              updatedFields.add('kitPeremptionServiettes');
            }
            if (body.kitGantsPresents !== undefined || body.gants_presents !== undefined || body.kit_gants_presents !== undefined || body.gantsPresents !== undefined || body.paire_gants_presents !== undefined || body.paireGantsPresents !== undefined || body.gants !== undefined || body.kit_gants !== undefined) {
              const kgVal = normalizeYesNo(body.kitGantsPresents ?? body.gants_presents ?? body.kit_gants_presents ?? body.gantsPresents ?? body.paire_gants_presents ?? body.paireGantsPresents ?? body.gants ?? body.kit_gants, 'Oui');
              updatedDefib.kitGantsPresents = kgVal;
              updatedDefib.gants_presents = kgVal;
              updatedDefib.kit_gants_presents = kgVal;
              updatedDefib.paire_gants_presents = kgVal;
              updatedFields.add('kitGantsPresents');
            }
            if (body.kitRasoirPresent !== undefined || body.rasoir_present !== undefined || body.kit_rasoir_present !== undefined || body.rasoirPresent !== undefined || body.rasoir !== undefined || body.kit_rasoir !== undefined) {
              const krVal = normalizeYesNo(body.kitRasoirPresent ?? body.rasoir_present ?? body.kit_rasoir_present ?? body.rasoirPresent ?? body.rasoir ?? body.kit_rasoir, 'Oui');
              updatedDefib.kitRasoirPresent = krVal;
              updatedDefib.rasoir_present = krVal;
              updatedDefib.kit_rasoir_present = krVal;
              updatedDefib.rasoir = krVal;
              updatedFields.add('kitRasoirPresent');
            }

            // Insertion / Livraison / Secours
            if (body.insertionBatterie !== undefined || body.insertion_b !== undefined || body.insertion_batterie !== undefined) {
              const ibVal = String(body.insertionBatterie ?? body.insertion_b ?? body.insertion_batterie).trim();
              updatedDefib.insertionBatterie = ibVal;
              updatedDefib.insertion_b = ibVal;
              updatedFields.add('insertionBatterie');
            }
            if (body.livraisonBatterie !== undefined || body.livraison_b !== undefined || body.livraison_batterie !== undefined) {
              const lbVal = String(body.livraisonBatterie ?? body.livraison_b ?? body.livraison_batterie).trim();
              updatedDefib.livraisonBatterie = lbVal;
              updatedDefib.livraison_b = lbVal;
              updatedFields.add('livraisonBatterie');
            }
            if (body.insertionElectrodeA !== undefined || body.insertion_a !== undefined || body.insertion_electrode_a !== undefined) {
              const iaVal = String(body.insertionElectrodeA ?? body.insertion_a ?? body.insertion_electrode_a).trim();
              updatedDefib.insertionElectrodeA = iaVal;
              updatedDefib.insertion_a = iaVal;
              updatedFields.add('insertionElectrodeA');
            }
            if (body.livraisonElectrodeA !== undefined || body.livraison_a !== undefined || body.livraison_electrode_a !== undefined) {
              const laVal = String(body.livraisonElectrodeA ?? body.livraison_a ?? body.livraison_electrode_a).trim();
              updatedDefib.livraisonElectrodeA = laVal;
              updatedDefib.livraison_a = laVal;
              updatedFields.add('livraisonElectrodeA');
            }
            if (body.insertionElectrodeP !== undefined || body.insertion_p !== undefined || body.insertion_electrode_p !== undefined) {
              const ipVal = String(body.insertionElectrodeP ?? body.insertion_p ?? body.insertion_electrode_p).trim();
              updatedDefib.insertionElectrodeP = ipVal;
              updatedDefib.insertion_p = ipVal;
              updatedFields.add('insertionElectrodeP');
            }
            if (body.livraisonElectrodeP !== undefined || body.livraison_p !== undefined || body.livraison_electrode_p !== undefined) {
              const lpVal = String(body.livraisonElectrodeP ?? body.livraison_p ?? body.livraison_electrode_p).trim();
              updatedDefib.livraisonElectrodeP = lpVal;
              updatedDefib.livraison_p = lpVal;
              updatedFields.add('livraisonElectrodeP');
            }
            if (body.peremptionSecoursElectrodeA !== undefined || body.peremption_secours_a !== undefined) {
              const psaVal = String(body.peremptionSecoursElectrodeA ?? body.peremption_secours_a).trim();
              updatedDefib.peremptionSecoursElectrodeA = psaVal;
              updatedDefib.peremption_secours_a = psaVal;
              updatedFields.add('peremptionSecoursElectrodeA');
            }
            if (body.peremptionSecoursElectrodeP !== undefined || body.peremption_secours_p !== undefined) {
              const pspVal = String(body.peremptionSecoursElectrodeP ?? body.peremption_secours_p).trim();
              updatedDefib.peremptionSecoursElectrodeP = pspVal;
              updatedDefib.peremption_secours_p = pspVal;
              updatedFields.add('peremptionSecoursElectrodeP');
            }

            // Localisation & Site
            if (body.nomPrenomSite !== undefined || body.nom_site !== undefined || body.nom_prenom !== undefined) {
              const nsVal = String(body.nomPrenomSite ?? body.nom_site ?? body.nom_prenom).trim();
              updatedDefib.nomPrenomSite = nsVal;
              updatedDefib.nom_site = nsVal;
              updatedDefib.nom_prenom = nsVal;
              updatedFields.add('nomPrenomSite');
            }
            if (body.numVoie !== undefined || body.numero_et_voie !== undefined || body.adresse !== undefined || body.rue !== undefined) {
              const nvVal = String(body.numVoie ?? body.numero_et_voie ?? body.adresse ?? body.rue).trim();
              updatedDefib.numVoie = nvVal;
              updatedDefib.numero_et_voie = nvVal;
              updatedDefib.adresse = nvVal;
              updatedFields.add('numVoie');
            }
            if (body.cp !== undefined || body.code_postal !== undefined || body.zip !== undefined || body.postal_code !== undefined) {
              const cpVal = String(body.cp ?? body.code_postal ?? body.zip ?? body.postal_code).trim();
              updatedDefib.cp = cpVal;
              updatedDefib.code_postal = cpVal;
              updatedFields.add('cp');
            }
            if (body.ville !== undefined || body.city !== undefined) {
              const vVal = String(body.ville ?? body.city).trim();
              updatedDefib.ville = vVal;
              updatedDefib.city = vVal;
              updatedFields.add('ville');
            }
            if (body.region !== undefined || body.departement !== undefined) {
              const rVal = String(body.region ?? body.departement).trim();
              updatedDefib.region = rVal;
              updatedFields.add('region');
            }
            if (body.pays !== undefined || body.country !== undefined) {
              const pVal = String(body.pays ?? body.country).trim();
              updatedDefib.pays = pVal;
              updatedDefib.country = pVal;
              updatedFields.add('pays');
            }
            if (body.latitude !== undefined || body.lat !== undefined) {
              const latVal = String(body.latitude ?? body.lat).trim();
              updatedDefib.latitude = latVal;
              updatedDefib.lat = latVal;
              updatedFields.add('latitude');
            }
            if (body.longitude !== undefined || body.lon !== undefined || body.lng !== undefined) {
              const lonVal = String(body.longitude ?? body.lon ?? body.lng).trim();
              updatedDefib.longitude = lonVal;
              updatedDefib.lon = lonVal;
              updatedDefib.lng = lonVal;
              updatedFields.add('longitude');
            }
            if (body.telephoneSite !== undefined || body.telephone_portable !== undefined || body.telephone_site !== undefined || body.phone !== undefined || body.tel !== undefined) {
              const telVal = String(body.telephoneSite ?? body.telephone_portable ?? body.telephone_site ?? body.phone ?? body.tel).trim();
              updatedDefib.telephoneSite = telVal;
              updatedDefib.telephone_portable = telVal;
              updatedDefib.telephone_site = telVal;
              updatedFields.add('telephoneSite');
            }
            if (body.emailSite !== undefined || body.email !== undefined || body.email_site !== undefined) {
              const emVal = String(body.emailSite ?? body.email ?? body.email_site).trim();
              updatedDefib.emailSite = emVal;
              updatedDefib.email = emVal;
              updatedDefib.email_site = emVal;
              updatedFields.add('emailSite');
            }
            if (body.commentaire !== undefined || body.notes !== undefined || body.note !== undefined) {
              const comVal = String(body.commentaire ?? body.notes ?? body.note).trim();
              updatedDefib.commentaire = comVal;
              updatedDefib.notes = comVal;
              updatedFields.add('commentaire');
            }
            if (body.commentaireAdresse !== undefined || body.aide_acces !== undefined) {
              const caVal = String(body.commentaireAdresse ?? body.aide_acces).trim();
              updatedDefib.commentaireAdresse = caVal;
              updatedDefib.aide_acces = caVal;
              updatedFields.add('commentaireAdresse');
            }

            // Cycle de vie
            if (body.finGarantie !== undefined || body.fin_garantie !== undefined || body.expiration_garantie !== undefined) {
              const fgVal = String(body.finGarantie ?? body.fin_garantie ?? body.expiration_garantie).trim();
              updatedDefib.finGarantie = fgVal;
              updatedDefib.fin_garantie = fgVal;
              updatedFields.add('finGarantie');
            }
            if (body.fabrication !== undefined || body.date_fabrication !== undefined) {
              const fabVal = String(body.fabrication ?? body.date_fabrication).trim();
              updatedDefib.fabrication = fabVal;
              updatedDefib.date_fabrication = fabVal;
              updatedFields.add('fabrication');
            }
            if (body.miseEnService !== undefined || body.mise_en_service !== undefined) {
              const mesVal = String(body.miseEnService ?? body.mise_en_service).trim();
              updatedDefib.miseEnService = mesVal;
              updatedDefib.mise_en_service = mesVal;
              updatedFields.add('miseEnService');
            }
            if (body.sortieFabricant !== undefined || body.sortie_fabricant !== undefined) {
              const sfVal = String(body.sortieFabricant ?? body.sortie_fabricant).trim();
              updatedDefib.sortieFabricant = sfVal;
              updatedDefib.sortie_fabricant = sfVal;
              updatedFields.add('sortieFabricant');
            }

            // Contrat
            if (body.contrat !== undefined || body.nomContrat !== undefined || body.nom_contrat !== undefined) {
              const cVal = String(body.contrat ?? body.nomContrat ?? body.nom_contrat).trim();
              updatedDefib.contrat = cVal;
              updatedDefib.nomContrat = cVal;
              updatedDefib.nom_contrat = cVal;
              updatedFields.add('contrat');
            }
            if (body.referenceContrat !== undefined || body.reference_contrat !== undefined) {
              const rcVal = String(body.referenceContrat ?? body.reference_contrat).trim();
              updatedDefib.referenceContrat = rcVal;
              updatedDefib.reference_contrat = rcVal;
              updatedFields.add('referenceContrat');
            }
            if (body.debutContrat !== undefined || body.debut_contrat !== undefined) {
              const dcVal = String(body.debutContrat ?? body.debut_contrat).trim();
              updatedDefib.debutContrat = dcVal;
              updatedDefib.debut_contrat = dcVal;
              updatedFields.add('debutContrat');
            }
            if (body.finContrat !== undefined || body.fin_contrat !== undefined) {
              const fcVal = String(body.finContrat ?? body.fin_contrat).trim();
              updatedDefib.finContrat = fcVal;
              updatedDefib.fin_contrat = fcVal;
              updatedFields.add('finContrat');
            }

            // Accès
            if (body.acces247 !== undefined || body.acces_247 !== undefined) {
              const aVal = String(body.acces247 ?? body.acces_247).trim();
              updatedDefib.acces247 = aVal;
              updatedDefib.acces_247 = aVal;
              updatedFields.add('acces247');
            }
            if (body.accesSemaine !== undefined || body.acces_semaine !== undefined) {
              const aVal = String(body.accesSemaine ?? body.acces_semaine).trim();
              updatedDefib.accesSemaine = aVal;
              updatedDefib.acces_semaine = aVal;
              updatedFields.add('accesSemaine');
            }
            if (body.accesWeekend !== undefined || body.acces_weekend !== undefined) {
              const aVal = String(body.accesWeekend ?? body.acces_weekend).trim();
              updatedDefib.accesWeekend = aVal;
              updatedDefib.acces_weekend = aVal;
              updatedFields.add('accesWeekend');
            }
            if (body.exterieur !== undefined) {
              const extVal = String(body.exterieur).trim();
              updatedDefib.exterieur = extVal;
              updatedFields.add('exterieur');
            }

            // Atlasanté & Logiciel
            if (body.numeroAtlasante !== undefined || body.numero_atlasante !== undefined) {
              const natVal = String(body.numeroAtlasante ?? body.numero_atlasante).trim();
              updatedDefib.numeroAtlasante = natVal;
              updatedDefib.numero_atlasante = natVal;
              updatedFields.add('numeroAtlasante');
            }
            if (body.versionLogiciel !== undefined || body.version_logiciel !== undefined) {
              const vlVal = String(body.versionLogiciel ?? body.version_logiciel).trim();
              updatedDefib.versionLogiciel = vlVal;
              updatedDefib.version_logiciel = vlVal;
              updatedFields.add('versionLogiciel');
            }

            // Client association update
            if (body.clientId !== undefined || body.client_id !== undefined) {
              const cidVal = String(body.clientId ?? body.client_id).trim();
              updatedDefib.clientId = cidVal;
              updatedDefib.client_id = cidVal;
              updatedFields.add('clientId');
            } else {
              updatedDefib.clientId = existing.clientId || existing.client_id || '';
              updatedDefib.client_id = existing.client_id || existing.clientId || '';
            }
            if (body.clientNom !== undefined || body.client_nom !== undefined || body.client !== undefined) {
              const cnVal = String(body.clientNom ?? body.client_nom ?? body.client).trim();
              updatedDefib.clientNom = cnVal;
              updatedDefib.client_nom = cnVal;
              updatedFields.add('clientNom');
            } else {
              updatedDefib.client_nom = existing.client_nom || existing.client || '';
            }

            // Maintenance autorisée (Oui / Non)
            if (body.maintenance_autorisee !== undefined || body.maintenanceAutorisee !== undefined || body.maintenance_autorise !== undefined || body.maintenanceAutorise !== undefined || body.fsmAutorise !== undefined || body.fsm_autorise !== undefined) {
              const rawFsm = body.maintenance_autorisee ?? body.maintenanceAutorisee ?? body.maintenance_autorise ?? body.maintenanceAutorise ?? body.fsmAutorise ?? body.fsm_autorise;
              const fsmVal = normalizeYesNo(rawFsm, 'Oui');
              updatedDefib.fsmAutorise = fsmVal;
              updatedDefib.fsm_autorise = fsmVal;
              updatedDefib.maintenance_autorisee = fsmVal;
              updatedDefib.maintenanceAutorisee = fsmVal;
              updatedFields.add('maintenance_autorisee');
            } else {
              updatedDefib.fsmAutorise = existing.fsmAutorise || existing.fsm_autorise || existing.maintenance_autorisee || 'Oui';
            }

            // Catégories additionnelles
            if (body.loue !== undefined) {
              const lVal = normalizeYesNo(body.loue, 'Non');
              updatedDefib.loue = lVal;
              updatedFields.add('loue');
            }
            if (body.prete !== undefined) {
              const pVal = normalizeYesNo(body.prete, 'Non');
              updatedDefib.prete = pVal;
              updatedFields.add('prete');
            }
            if (body.stocke !== undefined) {
              const sVal = normalizeYesNo(body.stocke, 'Non');
              updatedDefib.stocke = sVal;
              updatedFields.add('stocke');
            }
            if (body.sousTraitance !== undefined || body.sous_traitance !== undefined) {
              const stVal = normalizeYesNo(body.sousTraitance ?? body.sous_traitance, 'Non');
              updatedDefib.sousTraitance = stVal;
              updatedDefib.sous_traitance = stVal;
              updatedFields.add('sousTraitance');
            }

            // Strictly lock structural tenant & identity routing keys
            updatedDefib.id = existing.id;
            updatedDefib.identifiant = existing.identifiant;
            updatedDefib.numeroSerie = existing.numeroSerie;
            updatedDefib.num_serie = existing.num_serie || existing.numeroSerie;
            updatedDefib.id_record = existing.id_record || `record_${(targetTenant.shortEnvId || tenantId).toLowerCase()}_${existing.id}`;
            updatedDefib.envId = existing.envId || targetTenant.shortEnvId || tenantId;
            updatedDefib.tenantId = existing.tenantId || tenantId;
            updatedDefib.archive = body.archive !== undefined ? normalizeYesNo(body.archive, 'Non') : (existing.archive || 'Non');

            // Timestamp and API provenance to prevent stale browser caches from reverting values
            updatedDefib.updatedAt = new Date().toISOString();
            updatedDefib._lastSource = 'api';

            const formatted = formatDefibrillateurOutput(updatedDefib);

            const locKey = normalizeDefibLookupKey(targetId);
            const tuple = defibLocationIndex.get(locKey);
            const chunkIdx = (tuple && typeof tuple[3] === 'number') ? tuple[3] : singleLookup.chunkIdx;
            if (typeof chunkIdx === 'number') {
              saveSingleDefibrillateurToChunk(formatted, chunkIdx);
            } else {
              let defibs = await fetchServerCollection('defibrillateurs', tenantId, tenantAliases);
              const idx = defibs.findIndex(matchesDefibWith(targetId));
              if (idx >= 0) defibs[idx] = formatted; else defibs.push(formatted);
              await saveServerCollection('defibrillateurs', tenantId, defibs, tenantAliases);
            }

            return res.status(200).json({
              status: "success",
              message: "Défibrillateur mis à jour avec succès",
              environnement: targetTenant.shortEnvId || tenantId || singleLookup.tenant,
              id: existing.identifiant || existing.id,
              updated_fields: Array.from(updatedFields),
              ...(warnings.length > 0 ? { warnings } : {}),
              defibrillateur: formatted,
              data: formatted
            });
          } else if (req.method === 'PUT' || req.method === 'PATCH') {
            return res.status(404).json({
              status: "error",
              error: `Défibrillateur '${targetId}' non trouvé pour la mise à jour dans l'environnement ${targetTenant.shortEnvId || tenantId}`,
              code: "DEFIBRILLATEUR_NOT_FOUND"
            });
          } else {
            // Creation of a new defibrillator (POST)
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
              archive: body.archive !== undefined ? normalizeYesNo(body.archive, 'Non') : "Non",
              fsmAutorise: normalizeYesNo(body.maintenance_autorisee ?? body.maintenanceAutorisee ?? body.maintenance_autorise ?? body.maintenanceAutorise ?? body.fsmAutorise ?? body.fsm_autorise, 'Oui'),
              maintenance_autorisee: normalizeYesNo(body.maintenance_autorisee ?? body.maintenanceAutorisee ?? body.maintenance_autorise ?? body.maintenanceAutorise ?? body.fsmAutorise ?? body.fsm_autorise, 'Oui'),
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
            let defibs = await fetchServerCollection('defibrillateurs', tenantId, tenantAliases);
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
          const rawSubId = decodeURIComponent(subId)
            .replace(/^[:=]+/, '')
            .replace(/^['"]|['"]$/g, '')
            .trim();
          const lookupResult = await findSingleDefibrillateur(rawSubId, tenantId, tenantAliases);

          if (lookupResult && lookupResult.defib) {
            const formattedFound = formatDefibrillateurOutput(lookupResult.defib);
            return sendOptimizedJson(req, res, { 
              status: "success", 
              environnement: targetTenant.shortEnvId || tenantId || lookupResult.tenant, 
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

        const rawQ = String(req.query.search || req.query.q || req.query.numeroSerie || req.query.num_serie || req.query.serial || req.query.identifiant || req.query.id || '').trim();
        const cleanQ = rawQ.replace(/^[:=]+/, '').replace(/^['"]|['"]$/g, '').trim();

        // If a specific defibrillator search is requested (e.g. ?q=50SA005121900008), use instant O(1) single lookup
        if (cleanQ) {
          const directMatch = await findSingleDefibrillateur(cleanQ, tenantId, tenantAliases);
          if (directMatch && directMatch.defib) {
            const formatted = formatDefibrillateurOutput(directMatch.defib);
            res.setHeader('X-Total-Count', '1');
            res.setHeader('X-Page', '1');
            res.setHeader('X-Per-Page', '1');
            res.setHeader('X-Total-Pages', '1');
            return sendOptimizedJson(req, res, {
              status: "success",
              environnement: targetTenant.shortEnvId || tenantId || directMatch.tenant,
              total: 1,
              count: 1,
              page: 1,
              limit: 1,
              total_pages: 1,
              defibrillateurs: [formatted],
              data: [formatted]
            });
          }
        }

        let defibs = await fetchServerCollection('defibrillateurs', tenantId, tenantAliases);

        const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
        const limitParam = req.query.limit || req.query.per_page || req.query.max || req.query.count;
        const DEFAULT_LIMIT = 50;
        const MAX_SAFE_LIMIT = 250;
        const isExplicitlyAll = limitParam === 'all';
        const limit = isExplicitlyAll 
          ? MAX_SAFE_LIMIT 
          : Math.min(MAX_SAFE_LIMIT, Math.max(1, parseInt(limitParam as string, 10) || DEFAULT_LIMIT));

        let filteredDefibs = defibs;
        const q = cleanQ.toLowerCase();
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
        const startIndex = (page - 1) * limit;
        const returnedDefibs = filteredDefibs.slice(startIndex, startIndex + limit);
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
          page,
          limit,
          total_pages: totalPages,
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

      // 8. Rapports & Interventions Endpoints (Supports Real-Time Digital Report Uploads & Fast Lookups)
      if (cleanPath.startsWith('rapport') || cleanPath.startsWith('intervention')) {
        const pathSegments = cleanPath.split('/').map(s => s.trim()).filter(Boolean);
        let subId = pathSegments[1] || (req.query.id as string) || (req.query.identifiant as string) || (req.query.numeroSerie as string) || '';
        if (subId) {
          subId = decodeURIComponent(subId).replace(/^[:=]+/, '').replace(/^['"]|['"]$/g, '').trim();
        }

        // Real-Time Digital Report Remontée (POST /v1/rapports, POST /v1/interventions, POST /v1/rapports/:id)
        if (req.method === 'POST' || req.method === 'PUT') {
          const body = req.body || {};
          const targetDeviceKey = (subId || body.equipement || body.identifiant || body.id || body.numeroSerie || body.num_serie || body.serial || body.defibrillateurId || body.defibrillateur_id || '').trim();

          let targetDefib: any = null;
          let targetEnv = targetTenant.shortEnvId || tenantId;

          if (targetDeviceKey) {
            const lookup = await findSingleDefibrillateur(targetDeviceKey, tenantId, tenantAliases);
            if (lookup && lookup.defib) {
              targetDefib = lookup.defib;
              targetEnv = lookup.tenant || targetEnv;
            }
          }

          const reportId = body.id || body.reportId || `RAPPORT-${Date.now().toString().slice(-8)}`;
          const maintDate = body.dateMaintenance || body.derniereMaintenance || body.date || body.date_intervention || new Date().toISOString().split('T')[0];
          const techNom = body.technicien || body.intervenant || body.agent || "Technicien DEFIBEO";
          const statutVal = body.statut || body.status || (body.conforme === false || body.conforme === 'Non' ? 'Non conforme' : 'Opérationnel');
          const conformeVal = normalizeYesNo(body.conforme ?? (statutVal.toLowerCase().includes('non') ? 'Non' : 'Oui'), 'Oui');
          const pdfUrl = body.rapportUrl || body.rapport_url || body.pdf_url || body.url || body.rapportPdf || body.rapport || '';

          const savedReport = {
            id: reportId,
            reportId,
            defibrillateurId: targetDefib?.id || targetDeviceKey,
            equipement: targetDefib?.identifiant || targetDeviceKey,
            identifiant: targetDefib?.identifiant || targetDeviceKey,
            numeroSerie: targetDefib?.numeroSerie || body.numeroSerie || body.num_serie || '',
            date: maintDate,
            dateMaintenance: maintDate,
            derniereMaintenance: maintDate,
            technicien: techNom,
            typeIntervention: body.typeIntervention || body.type || "Maintenance préventive",
            statut: statutVal,
            conforme: conformeVal,
            remarques: body.remarques || body.observations || body.commentaire || "",
            rapportUrl: pdfUrl,
            envId: targetEnv,
            tenantId: targetEnv,
            timestamp: new Date().toISOString(),
            createdAt: new Date().toISOString()
          };

          // If defibrillator was found, update its live state and persist
          if (targetDefib) {
            targetDefib.derniereMaintenance = maintDate;
            targetDefib.derniere_maintenance = maintDate;
            targetDefib.statut = statutVal;
            targetDefib.conforme = conformeVal;
            if (pdfUrl) {
              targetDefib.rapportUrl = pdfUrl;
              targetDefib.rapport_pdf = pdfUrl;
            }
            if (body.peremptionElectrodeA || body.peremption_a) {
              targetDefib.peremptionElectrodeA = body.peremptionElectrodeA || body.peremption_a;
              targetDefib.peremption_a = targetDefib.peremptionElectrodeA;
            }
            if (body.lotElectrodeA || body.lot_a) {
              targetDefib.lotElectrodeA = body.lotElectrodeA || body.lot_a;
              targetDefib.lot_a = targetDefib.lotElectrodeA;
            }
            if (body.peremptionBatterie || body.peremption_b) {
              targetDefib.peremptionBatterie = body.peremptionBatterie || body.peremption_b;
              targetDefib.peremption_b = targetDefib.peremptionBatterie;
            }
            if (body.lotBatterie || body.lot_b) {
              targetDefib.lotBatterie = body.lotBatterie || body.lot_b;
              targetDefib.lot_b = targetDefib.lotBatterie;
            }
            if (body.pourcentageBatterie !== undefined || body.pourcentage_b !== undefined || body.pourcentage_constate_b !== undefined) {
              const pb = body.pourcentageBatterie ?? body.pourcentage_b ?? body.pourcentage_constate_b;
              targetDefib.pourcentageBatterie = String(pb);
              targetDefib.pourcentage_constate_b = Number(pb) || targetDefib.pourcentage_constate_b;
            }
            targetDefib.updatedAt = new Date().toISOString();

            // Re-index into in-memory index & save directly to chunk
            indexDefibrillateur(targetDefib, targetEnv);
            const locKey = normalizeDefibLookupKey(targetDeviceKey);
            const tuple = defibLocationIndex.get(locKey);
            if (tuple && typeof tuple[3] === 'number') {
              saveSingleDefibrillateurToChunk(targetDefib, tuple[3]);
            }
          }

          // Save report to generated_reports
          let existingReports = await fetchServerCollection('generated_reports', tenantId, tenantAliases);
          if (!Array.isArray(existingReports)) existingReports = [];
          existingReports = [savedReport, ...existingReports.filter((r: any) => r && r.id !== reportId)];
          await saveServerCollection('generated_reports', tenantId, existingReports, tenantAliases);

          return res.status(201).json({
            status: "success",
            message: "Rapport digital enregistré avec succès en temps réel",
            environnement: targetEnv,
            id: reportId,
            rapport: savedReport,
            defibrillateur: targetDefib ? formatDefibrillateurOutput(targetDefib) : null
          });
        }

        // Fast GET for reports (O(1) lookup via findSingleDefibrillateur)
        if (subId) {
          const single = await findSingleDefibrillateur(subId, tenantId, tenantAliases);
          if (single && single.defib) {
            const defib = single.defib;
            return res.json({
              status: "success",
              environnement: single.tenant || targetTenant.shortEnvId || tenantId,
              rapport: {
                equipement: defib.identifiant || defib.id,
                numeroSerie: defib.numeroSerie,
                derniereMaintenance: defib.derniereMaintenance || defib.derniere_maintenance,
                statut: defib.statut || defib.conforme,
                conforme: defib.conforme || (defib.statut === 'Conforme' ? 'Oui' : 'Non'),
                electrodes: defib.peremptionElectrodeA || defib.peremption_a,
                batterie: defib.peremptionBatterie || defib.peremption_b,
                pourcentageBatterie: defib.pourcentageBatterie || defib.pourcentage_constate_b,
                rapportUrl: defib.rapportUrl || defib.rapport_pdf || ""
              }
            });
          }
          return res.status(404).json({
            status: "error",
            error: `Aucun rapport disponible pour '${subId}' dans l'environnement ${targetTenant.shortEnvId || tenantId}`,
            code: "RAPPORT_NOT_FOUND"
          });
        }

        // List generated reports
        const reportsList = await fetchServerCollection('generated_reports', tenantId, tenantAliases);
        return res.json({
          status: "success",
          environnement: targetTenant.shortEnvId || tenantId,
          count: Array.isArray(reportsList) ? reportsList.length : 0,
          rapports: reportsList
        });
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
    // Non-blocking background warmup for defibrillateurs dataset
    setTimeout(() => {
      warmupDefibrillateursStore().catch(e => console.warn("[Warmup] Background init error:", e));
    }, 100);
  });
}

startServer();
