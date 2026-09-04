import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, setDoc, memoryLocalCache, getDocFromServer, getFirestore, getDocFromCache } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  INITIAL_VARIABLES,
  INITIAL_CLIENTS,
  INITIAL_DEFIBRILLATEURS,
  INITIAL_OTHER_EQUIPMENTS,
  INITIAL_TICKETS,
  INITIAL_COMMERCIAL_DOCS,
  INITIAL_GED_DOCS,
  INITIAL_STOCKS,
  INITIAL_DISTRIBUTED_STOCKS,
  INITIAL_REVIEWS,
  INITIAL_EXPENSES,
  INITIAL_VEILLES,
  INITIAL_REPORTS,
  INITIAL_TOURS,
  INITIAL_MEMBERS
} from './utils';
import { Member, Client, Defibrillateur } from './types';

// Clean up any stale Firestore SDK storage keys that cause QuotaExceededError
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const staleKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('firestore_targets_') || k.startsWith('firestore_mutations_') || k.startsWith('firestore_clients_') || k.startsWith('firestore_local_queries_'))) {
        staleKeys.push(k);
      }
    }
    for (const k of staleKeys) {
      localStorage.removeItem(k);
    }
  }
} catch (_) {}

const PROD_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBsfSHoSrPXwnwLcWtIGLPUwUd7ZYWVCvA",
  authDomain: "defibeo.firebaseapp.com",
  projectId: "defibeo",
  storageBucket: "defibeo.appspot.com",
  messagingSenderId: "627487981610",
  appId: "1:627487981610:web:e4f496748c4ee0d1710353",
  measurementId: ""
};

const firebaseConfigOverride = {
  apiKey: (import.meta as any).env?.VITE_FIREBASE_API_KEY || PROD_FIREBASE_CONFIG.apiKey,
  authDomain: (import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN || PROD_FIREBASE_CONFIG.authDomain,
  projectId: (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID || PROD_FIREBASE_CONFIG.projectId,
  storageBucket: (import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET || PROD_FIREBASE_CONFIG.storageBucket,
  messagingSenderId: (import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID || PROD_FIREBASE_CONFIG.messagingSenderId,
  appId: (import.meta as any).env?.VITE_FIREBASE_APP_ID || PROD_FIREBASE_CONFIG.appId,
  measurementId: (import.meta as any).env?.VITE_FIREBASE_MEASUREMENT_ID || PROD_FIREBASE_CONFIG.measurementId
};

const app = initializeApp(firebaseConfigOverride);

let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: memoryLocalCache(),
    experimentalForceLongPolling: true,
  });
} catch (err) {
  console.warn("Failed to initialize Firestore with memory local cache:", err);
  try {
    firestoreInstance = getFirestore(app);
  } catch (err2) {
    console.warn("Failed to initialize basic getFirestore:", err2);
    firestoreInstance = initializeFirestore(app, {});
  }
}

export const db = firestoreInstance;
export const auth = getAuth();

/**
 * Optimistic document loader:
 * 1. Tries to get document from server or standard Firestore with a safe timeout.
 * 2. If it fails or times out, falls back to application-level local cache.
 */
async function getDocOptimistic(docRef: any, key?: string, timeoutMs: number = 5000): Promise<any> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Firestore fetch timed out')), timeoutMs)
    );
    const serverSnap = await Promise.race([
      getDoc(docRef),
      timeoutPromise
    ]);
    if (serverSnap && serverSnap.exists()) {
      if (key) {
        const data = serverSnap.data() as any;
        const val = data?.value !== undefined ? data.value : data;
        saveToLocalCache(key, val);
      }
      return serverSnap;
    }
  } catch (err) {
    console.log(`[Firestore Cache-First] getDoc failed or timed out for ${docRef.id}, using fallback/cache:`, err);
  }

  // Fallback to cache
  try {
    const cachedSnap = await getDocFromCache(docRef);
    if (cachedSnap && cachedSnap.exists()) {
      return cachedSnap;
    }
  } catch (_) {}

  // Last resort: basic getDoc without timeout race
  return await getDoc(docRef).catch(() => ({ exists: () => false, data: () => null }));
}

export interface Tenant {
  id: string;
  companyName: string;
  companyEmail: string;
  companyPhone: string;
  adminName: string;
  adminEmail: string;
  adminPasswordHexOrPlain: string;
  lang: string;
  createdAt: string;
  shortEnvId?: string;
  nomLogiciel?: string;
  disabled?: boolean;
  blockedForPrez?: boolean;
  subscriptionActive?: boolean;
  paymentUrl?: string;
}

let currentTenantId: string = localStorage.getItem('defib_tenant_id') || 'demo';

export function setTenantId(tenantId: string) {
  currentTenantId = tenantId;
  localStorage.setItem('defib_tenant_id', tenantId);
}

export function getTenantId(): string {
  return currentTenantId;
}

export function getCollectionNameAliases(collectionName: string): string[] {
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
  } else if (collectionName === 'ctt_model_settings' || collectionName === 'cttModelSettings' || collectionName === 'ctt_settings') {
    aliases.push('ctt_model_settings', 'cttModelSettings', 'ctt_settings');
  }
  return Array.from(new Set(aliases));
}

export function getCollectionKey(collectionName: string, tenantId: string = currentTenantId): string {
  const activeTenant = (tenantId || 'demo').trim();
  if (activeTenant === 'demo' || !activeTenant) {
    return collectionName;
  }
  return `${activeTenant}_${collectionName}`;
}

export function getCollectionKeyCandidates(collectionName: string, tenantId: string = currentTenantId): string[] {
  const colAliases = getCollectionNameAliases(collectionName);
  const activeTenant = (tenantId || 'demo').trim();
  if (activeTenant === 'demo' || !activeTenant) {
    const list: string[] = [];
    for (const c of colAliases) {
      list.push(c);
      list.push(`demo_${c}`);
    }
    return Array.from(new Set(list));
  }

  const tenantPrefixes = new Set<string>();
  tenantPrefixes.add(activeTenant);

  const isDNum = /^d\d+$/i.test(activeTenant);
  const isNum = /^\d+$/.test(activeTenant);
  const numOnly = isDNum || isNum ? activeTenant.replace(/^d/i, '') : '';

  if (numOnly) {
    tenantPrefixes.add(`D${numOnly}`);
    tenantPrefixes.add(`d${numOnly}`);
    tenantPrefixes.add(`${numOnly}`);
  }

  // Also check if this tenant has an alias in registered_tenants cache
  try {
    const regTenants = getFromLocalCache<Tenant[]>('registered_tenants');
    if (Array.isArray(regTenants)) {
      const match = regTenants.find(t => 
        t.id?.toLowerCase() === activeTenant.toLowerCase() ||
        t.shortEnvId?.toLowerCase() === activeTenant.toLowerCase() ||
        (numOnly && (t.id?.replace(/^d/i, '') === numOnly || t.shortEnvId?.replace(/^d/i, '') === numOnly))
      );
      if (match) {
        if (match.id) {
          tenantPrefixes.add(match.id);
          const mNum = match.id.replace(/^d/i, '');
          if (mNum) {
            tenantPrefixes.add(`D${mNum}`);
            tenantPrefixes.add(`d${mNum}`);
            tenantPrefixes.add(mNum);
          }
        }
        if (match.shortEnvId) {
          tenantPrefixes.add(match.shortEnvId);
          const sNum = match.shortEnvId.replace(/^d/i, '');
          if (sNum) {
            tenantPrefixes.add(`D${sNum}`);
            tenantPrefixes.add(`d${sNum}`);
            tenantPrefixes.add(sNum);
          }
        }
      }
    }
  } catch (_) {}

  const candidates: string[] = [];
  for (const prefix of tenantPrefixes) {
    for (const c of colAliases) {
      candidates.push(`${prefix}_${c}`);
    }
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

export function mergeCollectionItems<T>(collectionName: string, items: any[]): any[] {
  if (!Array.isArray(items) || items.length === 0) return items;

  const map = new Map<string, any>();
  const isClient = collectionName === 'clients' || collectionName === 'clientList' || collectionName === 'client_list' || collectionName === 'customerList' || collectionName === 'customers';
  const isDefib = collectionName === 'defibrillateurs' || collectionName === 'defibs' || collectionName === 'devices' || collectionName === 'defibrillateur' || collectionName === 'dae';
  const isVariable = collectionName === 'variables' || collectionName === 'variableList' || collectionName === 'vars';
  const isMember = collectionName === 'members' || collectionName === 'users' || collectionName === 'team' || collectionName === 'staff';

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

export function saveToLocalCache(key: string, value: any): void {
  try {
    localStorage.setItem(`fs_cache_${key}`, JSON.stringify(value));
  } catch (err) {
    try {
      // Free storage by removing older fs_cache_ keys if quota exceeded
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('fs_cache_') && k !== 'fs_cache_registered_tenants') {
          keysToRemove.push(k);
        }
      }
      for (const k of keysToRemove.slice(0, 10)) {
        localStorage.removeItem(k);
      }
      localStorage.setItem(`fs_cache_${key}`, JSON.stringify(value));
    } catch (_) {
      // Non-blocking
    }
  }
}

export function getFromLocalCache<T>(key: string): T | null {
  try {
    const val = localStorage.getItem(`fs_cache_${key}`);
    return val ? JSON.parse(val) as T : null;
  } catch (err) {
    console.warn(`Failed to read from local cache for key ${key}:`, err);
    return null;
  }
}

/**
 * Clears temporary session items and dismissal flags when switching environments.
 * Strictly preserves persistent tenant offline databases (defib_* and fs_cache_*)
 * so switching between customer tenants is instant and zero-data-loss.
 */
export function purgeAllLocalEnvironmentCaches(targetTenantId?: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;

      // Clear ONLY temporary UI flags and volatile markers, never persistent tenant datasets
      if (
        k.startsWith('help_dismissed') ||
        k.startsWith('defib_temp_')
      ) {
        keysToRemove.push(k);
      }
    }

    for (const k of keysToRemove) {
      localStorage.removeItem(k);
    }

    // Also clear session storage
    if (window.sessionStorage) {
      sessionStorage.clear();
    }
  } catch (e) {
    console.warn('[Cache] Error purging environment cache:', e);
  }
}

/**
 * Strictly filters a collection array to guarantee 100% tenant isolation without cross-contamination.
 */
export function filterCollectionForTenant<T>(data: T, collectionName: string, activeTenantId: string): T {
  if (!data) return data;
  if (!Array.isArray(data)) return data;
  
  const isDemo = !activeTenantId || activeTenantId === 'demo';
  const cleanTid = (activeTenantId || 'demo').trim().toLowerCase();
  const isDNum = /^d\d+$/i.test(cleanTid);
  const isNum = /^\d+$/.test(cleanTid);
  const numTid = isDNum || isNum ? cleanTid.replace(/^d/i, '') : '';

  return (data as any[]).filter((item: any) => {
    if (!item || typeof item !== 'object') return true;
    const itemEnv = (item.envId || item.tenantId || '').trim().toLowerCase();
    const isItemDNum = /^d\d+$/i.test(itemEnv);
    const isItemNum = /^\d+$/.test(itemEnv);
    const numItemEnv = isItemDNum || isItemNum ? itemEnv.replace(/^d/i, '') : '';

    if (isDemo) {
      // In demo mode: discard items explicitly created for specific customer tenants
      if (itemEnv && itemEnv !== 'demo') {
        return false;
      }
      return true;
    }

    // In customer tenant mode (e.g. D1, D2, D19, D58, D67, etc.):
    // If the item has an explicit envId/tenantId, it MUST match this tenant
    if (itemEnv) {
      if (itemEnv === 'demo') return false;
      if (itemEnv === cleanTid) return true;
      if (numTid && numItemEnv && numTid === numItemEnv) return true;
      return false; // Rejects items belonging to another tenant!
    }

    // Never leak demo-specific mock items into customer environments
    if (collectionName === 'defibrillateurs' || collectionName === 'defibs' || collectionName === 'devices') {
      if (!itemEnv && (item.id === 'df_1' || item.identifiant === 'SPO-D26-DAE' || item.numeroSerie === 'SN-G5-998124')) {
        return false;
      }
    } else if (collectionName === 'tickets' || collectionName === 'support_tickets') {
      if (!itemEnv) {
        return false;
      }
      if (item.id === '#482910' || item.id === '#719203' || item.identifiant === 'DEF-75001' || item.identifiant === 'DEF-69002') {
        return false;
      }
    } else if (collectionName === 'commercialDocs' || collectionName === 'commercial_docs') {
      if (!itemEnv && item.clientDenomination && (item.clientDenomination.includes('Medical360') || item.clientDenomination.includes('SecoursProOuest'))) {
        return false;
      }
    } else if (collectionName === 'fsmTours' || collectionName === 'fsm_tours' || collectionName === 'tours') {
      if (item.id === 'fsm-tour-demo' || item.techName === 'Jakub Démo') {
        return false;
      }
    } else if (collectionName === 'clients') {
      if (!itemEnv && (item.id === 'c1' || item.id === 'c2' || item.id === 'c3') && item.denomination === 'Secours Pro Ouest') {
        return false;
      }
    } else if (collectionName === 'notifications' || collectionName === 'app_notifications') {
      if (item.id === 'conn-2' || item.id === 'conn-3' || (item.title && item.title.includes('admin@defibeo.com vient s’est connecté'))) {
        return false;
      }
      if (!itemEnv) {
        if (item.id?.startsWith('demo') || item.title?.includes('Démo') || item.title?.includes('demo')) {
          return false;
        }
      }
    } else if (collectionName === 'members') {
      if (!itemEnv && (item.email === 'techniciendemo1@demo.com' || item.name === 'Jakub Démo')) {
        return false;
      }
    }

    return true;
  }) as unknown as T;
}

/**
 * Fetches a collection (stored as a single document or chunked documents) 
 * from Firestore. Returns null if the document does not exist yet.
 * Includes resilience against chunk timeouts, local cache, and backend server proxy fallback.
 */
export async function fetchCollectionFromFirestore<T>(collectionName: string, tenantId?: string): Promise<T | null> {
  const activeTenantId = tenantId || getTenantId();
  const candidateKeys = getCollectionKeyCandidates(collectionName, activeTenantId);

  // If completely offline in browser, immediately check cached versions (aggregate arrays)
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const offlineItems: any[] = [];
    let foundObject: any = null;
    for (const ck of candidateKeys) {
      const cachedVal = getFromLocalCache<any>(ck);
      if (cachedVal !== null) {
        if (Array.isArray(cachedVal)) {
          offlineItems.push(...cachedVal);
        } else if (typeof cachedVal === 'object' && !foundObject) {
          foundObject = cachedVal;
        }
      }
    }
    if (offlineItems.length > 0) {
      const merged = mergeCollectionItems(collectionName, offlineItems);
      return filterCollectionForTenant(merged as unknown as T, collectionName, activeTenantId);
    }
    if (foundObject) {
      return filterCollectionForTenant(foundObject as T, collectionName, activeTenantId);
    }
    return null;
  }

  // 1. Primary Strategy: Try direct Firestore query aggregating ALL candidate keys concurrently
  try {
    const fetchPromises = candidateKeys.map(async (key) => {
      try {
        const docRef = doc(db, 'appData', key);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Firestore fetch timeout')), 10000)
        );
        const serverSnap = await Promise.race([
          getDoc(docRef),
          timeoutPromise
        ]);

        if (serverSnap && serverSnap.exists()) {
          const payload = serverSnap.data();
          let isChunked = payload._chunked && typeof payload.chunksCount === 'number';
          let chunksCount = payload.chunksCount || 0;

          if (!isChunked) {
            try {
              const c0Ref = doc(db, 'appData', `${key}_chunk_0`);
              const c0Snap = await Promise.race([
                getDoc(c0Ref),
                new Promise<any>((resolve) => setTimeout(() => resolve(null), 3000))
              ]);
              if (c0Snap && c0Snap.exists()) {
                isChunked = true;
                chunksCount = 30;
              }
            } catch (_) {}
          }

          if (isChunked) {
            const chunkPromises = [];
            for (let i = 0; i < (chunksCount || 30); i++) {
              const chunkRef = doc(db, 'appData', `${key}_chunk_${i}`);
              chunkPromises.push(
                Promise.race([
                  getDoc(chunkRef),
                  new Promise<any>((resolve) => setTimeout(() => resolve(null), 10000))
                ])
              );
            }
            const chunkSnaps = await Promise.all(chunkPromises);
            let combined: any[] = [];
            for (let idx = 0; idx < chunkSnaps.length; idx++) {
              const snap = chunkSnaps[idx];
              if (snap && snap.exists && snap.exists()) {
                const data = snap.data();
                if (Array.isArray(data.value)) {
                  combined.push(...data.value);
                }
              }
            }
            return { type: 'array', items: combined, key };
          } else if (payload.value !== undefined) {
            if (Array.isArray(payload.value)) {
              return { type: 'array', items: payload.value, key };
            } else if (payload.value !== null && typeof payload.value === 'object') {
              return { type: 'object', data: payload.value, key };
            } else {
              return { type: 'primitive', data: payload.value, key };
            }
          }
        }
      } catch (keyErr) {
        console.log(`[Firestore Server-First] Direct fetch for ${key} notice:`, keyErr);
      }
      return null;
    });

    const results = await Promise.allSettled(fetchPromises);
    const aggregatedItems: any[] = [];
    let mergedObject: Record<string, any> | null = null;
    let primitiveResult: any = null;
    let foundAnyValidKey = false;

    for (const res of results) {
      if (res.status === 'fulfilled' && res.value) {
        foundAnyValidKey = true;
        const val = res.value;
        if (val.type === 'array' && Array.isArray(val.items)) {
          aggregatedItems.push(...val.items);
        } else if (val.type === 'object' && val.data) {
          mergedObject = mergedObject ? { ...val.data, ...mergedObject } : { ...val.data };
        } else if (val.type === 'primitive' && primitiveResult === null) {
          primitiveResult = val.data;
        }
      }
    }

    if (aggregatedItems.length > 0) {
      const merged = mergeCollectionItems(collectionName, aggregatedItems);
      const sanitizedVal = filterCollectionForTenant(merged as unknown as T, collectionName, activeTenantId);
      for (const ck of candidateKeys) {
        saveToLocalCache(ck, sanitizedVal);
      }
      return sanitizedVal;
    } else if (mergedObject) {
      const sanitizedVal = filterCollectionForTenant(mergedObject as unknown as T, collectionName, activeTenantId);
      for (const ck of candidateKeys) {
        saveToLocalCache(ck, sanitizedVal);
      }
      return sanitizedVal;
    } else if (primitiveResult !== null) {
      for (const ck of candidateKeys) {
        saveToLocalCache(ck, primitiveResult);
      }
      return primitiveResult;
    } else if (foundAnyValidKey) {
      // Empty array explicitly initialized
      const emptyArr: any[] = [];
      for (const ck of candidateKeys) {
        saveToLocalCache(ck, emptyArr);
      }
      return emptyArr as unknown as T;
    }
  } catch (error) {
    console.log(`[Firestore Server-First] Direct Firestore aggregate had issue:`, error);
  }

  // 2. Secondary Strategy: High-availability backend server relay (/api/sync-collection)
  if (typeof fetch !== 'undefined') {
    try {
      const resp = await fetch(`/api/sync-collection?collectionName=${encodeURIComponent(collectionName)}&tenantId=${encodeURIComponent(activeTenantId)}`, {
        signal: AbortSignal.timeout(20000)
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json && json.value !== undefined) {
          const val = filterCollectionForTenant(json.value as T, collectionName, activeTenantId);
          for (const ck of candidateKeys) {
            saveToLocalCache(ck, val);
          }
          return val;
        }
      }
    } catch (apiErr) {
      console.warn(`[Sync Server Relay] Error fetching ${collectionName} via /api/sync-collection:`, apiErr);
    }
  }

  // 3. Tertiary Strategy: Local storage cache across candidate keys (aggregate arrays)
  const localItems: any[] = [];
  let localObj: any = null;
  for (const ck of candidateKeys) {
    const localVal = getFromLocalCache<any>(ck);
    if (localVal !== null) {
      if (Array.isArray(localVal)) {
        localItems.push(...localVal);
      } else if (typeof localVal === 'object' && !localObj) {
        localObj = localVal;
      }
    }
  }
  if (localItems.length > 0) {
    const merged = mergeCollectionItems(collectionName, localItems);
    return filterCollectionForTenant(merged as unknown as T, collectionName, activeTenantId);
  }
  if (localObj) {
    return filterCollectionForTenant(localObj as T, collectionName, activeTenantId);
  }

  return null;
}

/**
 * Recursively cleans and removes undefined keys from an object or array to make it Firestore-safe.
 */
export function sanitizeUndefined(obj: any): any {
  if (obj === undefined) {
    return null;
  }
  if (obj === null) {
    return null;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeUndefined(item));
  }
  if (typeof obj === 'object') {
    if (obj instanceof Date) {
      return obj.toISOString();
    }
    try {
      const serialized = JSON.stringify(obj, (key, value) => {
        if (value === undefined) return null;
        if (typeof value === 'function') return null;
        return value;
      });
      return JSON.parse(serialized);
    } catch (e) {
      const res: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const val = obj[key];
          if (val !== undefined && typeof val !== 'function') {
            res[key] = sanitizeUndefined(val);
          }
        }
      }
      return res;
    }
  }
  return obj;
}

/**
 * Saves a collection array or object to Firestore (auto-chunking if needed).
 */
export async function saveCollectionToFirestore<T>(collectionName: string, value: T, tenantIdOverride?: string): Promise<void> {
  const activeTenantId = tenantIdOverride || getTenantId();
  const key = getCollectionKey(collectionName, activeTenantId);
  const candidateKeys = getCollectionKeyCandidates(collectionName, activeTenantId);

  // CRITICAL PROTECTION: Never overwrite a populated collection with an empty array []
  // on startup, network lag, or environment transition!
  if (Array.isArray(value) && value.length === 0 && activeTenantId && activeTenantId !== 'demo') {
    for (const ck of candidateKeys) {
      const cached = getFromLocalCache<any[]>(ck);
      if (Array.isArray(cached) && cached.length > 0) {
        console.warn(`[Protection] Blocked attempt to overwrite populated collection ${ck} (${cached.length} items) with empty array [].`);
        return;
      }
    }
  }

  // Guard against accidental blank placeholder overwrite of companyInfo
  if ((collectionName === 'companyInfo' || collectionName === 'company_info') && value && typeof value === 'object' && !Array.isArray(value)) {
    const incoming = value as any;
    for (const ck of candidateKeys) {
      const cached = getFromLocalCache<any>(ck);
      if (cached && typeof cached === 'object' && !Array.isArray(cached)) {
        // If cached has hiddenTabs or custom info, preserve them if incoming lacks them
        if (Array.isArray(cached.hiddenTabs) && cached.hiddenTabs.length > 0 && (!incoming.hiddenTabs || incoming.hiddenTabs.length === 0)) {
          if (incoming.name === 'Mon Cabinet' && cached.name && cached.name !== 'Mon Cabinet') {
            console.warn(`[Protection] Refusing to overwrite populated companyInfo ${ck} with default empty placeholder.`);
            return;
          }
        }
      }
    }
  }

  // Auto-inject envId and tenantId if items are objects inside an array
  let sanitizedValue = value;
  if (Array.isArray(value)) {
    sanitizedValue = value.map(item => {
      if (item && typeof item === 'object') {
        return {
          ...item,
          envId: activeTenantId,
          tenantId: activeTenantId
        };
      }
      return item;
    }) as unknown as T;
  } else if (value && typeof value === 'object') {
    sanitizedValue = {
      ...value,
      envId: activeTenantId,
      tenantId: activeTenantId
    } as unknown as T;
  }

  const finalCleanValue = sanitizeUndefined(sanitizedValue);
  
  // Save to cache immediately across candidate keys so UI reads it instantly
  for (const ck of candidateKeys) {
    saveToLocalCache(ck, finalCleanValue);
  }

  // Background sync to server so REST API /v1 has instant access
  try {
    if (typeof fetch !== 'undefined') {
      fetch('/api/sync-collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionName,
          tenantId: activeTenantId,
          value: finalCleanValue
        })
      }).catch(() => {});
    }
  } catch (syncErr) {
    // Non-blocking
  }

  try {
    const jsonStr = JSON.stringify(finalCleanValue);
    // Firestore single doc limit is 1MB. If array and payload > 400 KB, chunk it!
    if (Array.isArray(finalCleanValue) && jsonStr.length > 400000) {
      const items = finalCleanValue;
      const avgItemLen = Math.max(1, Math.ceil(jsonStr.length / items.length));
      const chunkSize = Math.max(1, Math.floor(250000 / avgItemLen));
      const chunksCount = Math.ceil(items.length / chunkSize);

      for (let i = 0; i < chunksCount; i++) {
        const chunkItems = items.slice(i * chunkSize, (i + 1) * chunkSize);
        for (const ck of candidateKeys) {
          const chunkRef = doc(db, 'appData', `${ck}_chunk_${i}`);
          await setDoc(chunkRef, { value: chunkItems });
        }
      }

      for (const ck of candidateKeys) {
        const mainDocRef = doc(db, 'appData', ck);
        await setDoc(mainDocRef, { 
          _chunked: true, 
          chunksCount, 
          totalItems: items.length,
          updatedAt: new Date().toISOString() 
        });
      }
      console.log(`Successfully synced chunked collection ${key} (${chunksCount} chunks, ${items.length} items) to Firestore across candidate keys.`);
    } else {
      for (const ck of candidateKeys) {
        const docRef = doc(db, 'appData', ck);
        await setDoc(docRef, { value: finalCleanValue, _chunked: false });
      }
      console.log(`Successfully synced ${key} to Firestore with hidden environment fields.`);
    }
  } catch (error) {
    console.warn(`Error saving collection ${collectionName} to Firestore (kept in cache):`, error);
  }
}

export function generateUniqueShortEnvId(existingCodes: string[]): string {
  let attempts = 0;
  while (attempts < 1000) {
    const num = Math.floor(Math.random() * 90) + 10; // 10 to 99
    const candidate = `D${num}`;
    if (!existingCodes.includes(candidate) && candidate !== 'D18') {
      return candidate;
    }
    attempts++;
  }
  for (let num = 10; num <= 99; num++) {
    const candidate = `D${num}`;
    if (!existingCodes.includes(candidate) && candidate !== 'D18') {
      return candidate;
    }
  }
  return 'D99';
}

/**
 * Fetches the master list of registered tenants. 
 */
export async function getRegisteredTenants(bypassCache: boolean = false): Promise<Tenant[]> {
  const demoTenant: Tenant = {
    id: 'demo',
    companyName: 'Défibeo Solutions',
    companyEmail: 'contact@defibeo-solutions.com',
    companyPhone: '+33 1 47 20 00 01',
    adminName: 'Admin Démo',
    adminEmail: 'account@demo.com',
    adminPasswordHexOrPlain: '123456',
    lang: 'Français',
    createdAt: '2026-06-15',
    shortEnvId: 'D10'
  };

  const addDemoIfNeeded = (list: Tenant[]) => {
    if (!list.some(t => t.id === 'demo')) {
      return [demoTenant, ...list];
    }
    return list;
  };

  if (!bypassCache && typeof navigator !== 'undefined' && !navigator.onLine) {
    const cached = getFromLocalCache<Tenant[]>('registered_tenants') || [];
    return addDemoIfNeeded(cached);
  }
  try {
    const docRef = doc(db, 'appData', 'registered_tenants');
    const snap = await getDocOptimistic(docRef, 'registered_tenants', 6000);
    if (snap && snap.exists()) {
      let tenants = (snap.data().value || []) as Tenant[];
      tenants = addDemoIfNeeded(tenants);
      let needsUpdate = false;
      const existingShortCodes = tenants
        .map(t => t.shortEnvId)
        .filter((code): code is string => !!code);

      const updatedTenants = tenants.map(t => {
        if (!t.shortEnvId) {
          const newCode = generateUniqueShortEnvId(existingShortCodes);
          existingShortCodes.push(newCode);
          needsUpdate = true;
          return { ...t, shortEnvId: newCode };
        }
        return t;
      });

      if (needsUpdate) {
        setDoc(docRef, { value: updatedTenants }).catch(console.warn);
      }

      saveToLocalCache('registered_tenants', updatedTenants);
      return updatedTenants;
    }
  } catch (err) {
    console.log('[Firestore Cache-First] Fallback to cache for registered_tenants:', err);
  }

  const cached = getFromLocalCache<Tenant[]>('registered_tenants') || [];
  return addDemoIfNeeded(cached);
}

/**
 * Fetches a raw collection key from Firestore bypassing the default prefix.
 */
export async function fetchRawCollectionFromFirestore<T>(rawKey: string, timeoutMs: number = 8000): Promise<T | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return getFromLocalCache<T>(rawKey);
  }
  try {
    const docRef = doc(db, 'appData', rawKey);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Fetch timed out')), timeoutMs)
    );
    const serverSnap = await Promise.race([
      getDoc(docRef),
      timeoutPromise
    ]);
    if (serverSnap && serverSnap.exists()) {
      const payload = serverSnap.data();
      const val = (payload?.value !== undefined ? payload.value : payload) as T;
      if (val !== undefined) {
        saveToLocalCache(rawKey, val);
        return val;
      }
    }
  } catch (error) {
    console.log(`[fetchRawCollectionFromFirestore] Failed to fetch raw key ${rawKey} from server, falling back to cache:`, error);
  }
  return getFromLocalCache<T>(rawKey);
}

/**
 * Verifies if an email exists anywhere in the entire database (cross-environments, cross-roles).
 */
export async function checkIfEmailExistsAnywhere(
  email: string,
  excludeCurrentTenant?: {
    tenantId: string;
    excludeOption: 'member' | 'client' | 'none';
    uniqueId?: string; // member email or client ID
  }
): Promise<{ exists: boolean; message: string }> {
  const checkEmail = email.trim().toLowerCase();
  if (!checkEmail) {
    return { exists: false, message: '' };
  }

  if (checkEmail === 'account@demo.com') {
    return { exists: true, message: 'Cette adresse email est réservée pour le compte de démonstration.' };
  }

  // 1. Check registered tenants main data
  const tenants = await getRegisteredTenants(true);
  for (const t of tenants) {
    if (excludeCurrentTenant?.tenantId === t.id && excludeCurrentTenant?.excludeOption === 'none') {
      continue;
    }
    if (t.adminEmail.trim().toLowerCase() === checkEmail) {
      return { exists: true, message: 'Erreur: un utilisateur avec cet email est déjà existant.' };
    }
    if (t.companyEmail.trim().toLowerCase() === checkEmail) {
      return { exists: true, message: 'Erreur: un utilisateur avec cet email est déjà existant.' };
    }
  }

  // 2. Only check the current tenant's members and clients to avoid cross-role collision in the same tenant.
  // This prevents cross-tenant performance bottlenecks, timeouts, and privacy/permission issues.
  const activeTenant = excludeCurrentTenant?.tenantId || getTenantId() || 'demo';
  const tenantIds = [activeTenant];

  // If we are completely offline, don't attempt to load each tenant sequentially.
  // Although fetchRawCollectionFromFirestore handles offline states, checking in parallel with short timeout is extremely fast.
  const checkPromises = tenantIds.map(async (tid) => {
    try {
      // Check members
      const mKey = tid === 'demo' ? 'members' : `${tid}_members`;
      const membersList = await fetchRawCollectionFromFirestore<Member[]>(mKey, 3000) || [];
      if (Array.isArray(membersList)) {
        for (const m of membersList) {
          if (
            excludeCurrentTenant?.tenantId === tid &&
            excludeCurrentTenant?.excludeOption === 'member' &&
            excludeCurrentTenant?.uniqueId?.trim().toLowerCase() === m.email.trim().toLowerCase() &&
            m.email.trim().toLowerCase() === checkEmail
          ) {
            continue;
          }
          if (m.email && m.email.trim().toLowerCase() === checkEmail) {
            return { exists: true, message: 'Erreur: un utilisateur avec cet email est déjà existant.' };
          }
        }
      }

      // Check clients
      const cKey = tid === 'demo' ? 'clients' : `${tid}_clients`;
      const clientsList = await fetchRawCollectionFromFirestore<Client[]>(cKey, 3000) || [];
      if (Array.isArray(clientsList)) {
        for (const c of clientsList) {
          if (
            excludeCurrentTenant?.tenantId === tid &&
            excludeCurrentTenant?.excludeOption === 'client' &&
            excludeCurrentTenant?.uniqueId === c.id
          ) {
            continue;
          }
          if (
            (c.email && c.email.trim().toLowerCase() === checkEmail) ||
            (c.emailSite && c.emailSite.trim().toLowerCase() === checkEmail)
          ) {
            return { exists: true, message: 'Erreur: un utilisateur avec cet email est déjà existant.' };
          }
        }
      }
    } catch (err) {
      console.warn(`Error scanning email in tenant list for ${tid}:`, err);
    }
    return null;
  });

  const results = await Promise.all(checkPromises);
  for (const res of results) {
    if (res && res.exists) {
      return res;
    }
  }

  return { exists: false, message: '' };
}

/**
 * Registers a new environment (new tenant instance) in Firestore.
 * Initializes all client/defibrillator database partitions.
 */
export async function registerNewTenant(tenantData: Omit<Tenant, 'id' | 'createdAt'> & { customTenantId?: string }): Promise<string> {
  const adminEmailLower = tenantData.adminEmail.trim().toLowerCase();
  const companyEmailLower = tenantData.companyEmail.trim().toLowerCase();

  // Also check demo hardcoded credential to prevent collisions
  if (adminEmailLower === 'account@demo.com') {
    throw new Error('Cette adresse email est réservée pour le compte de démonstration.');
  }

  // Perform whole-db cross validation
  const checkAdmin = await checkIfEmailExistsAnywhere(adminEmailLower);
  if (checkAdmin.exists) {
    throw new Error(checkAdmin.message);
  }

  const checkCompany = await checkIfEmailExistsAnywhere(companyEmailLower);
  if (checkCompany.exists) {
    throw new Error(checkCompany.message);
  }

  const tenants = await getRegisteredTenants(true);
  const cleanTenantId = tenantData.customTenantId ? tenantData.customTenantId.trim() : '';
  if (cleanTenantId) {
    const existingTenantId = tenants.find(t => t.id.trim().toLowerCase() === cleanTenantId.toLowerCase());
    if (existingTenantId || cleanTenantId.toLowerCase() === 'demo') {
      throw new Error("Cet identifiant d'environnement (Identifiant Logiciel) est déjà utilisé. Veuillez en choisir un autre.");
    }
  }

  // Create unique tenant ID (following D1, D2, D3... sequential pattern)
  let tenantId = cleanTenantId;
  if (!tenantId) {
    const dPrefixTenants = tenants.filter(t => /^D\d+$/i.test(t.id));
    if (dPrefixTenants.length > 0) {
      const numbers = dPrefixTenants.map(t => {
        const match = t.id.match(/^D(\d+)$/i);
        return match ? parseInt(match[1], 10) : 0;
      });
      const maxNum = Math.max(...numbers);
      tenantId = `D${maxNum + 1}`;
    } else {
      tenantId = 'D1';
    }
  }
  
  const { customTenantId, ...restTenantData } = tenantData;

  const existingShortCodes = tenants
    .map(t => t.shortEnvId)
    .filter((code): code is string => !!code);
  const assignedShortEnvId = generateUniqueShortEnvId(existingShortCodes);

  const newTenant: Tenant = {
    ...restTenantData,
    id: tenantId,
    shortEnvId: assignedShortEnvId,
    createdAt: new Date().toISOString(),
    blockedForPrez: true
  };

  // 1. Save new tenant entry back to list
  tenants.push(newTenant);
  const docRef = doc(db, 'appData', 'registered_tenants');
  await setDoc(docRef, { value: tenants });

  // 2. Initialize the tenant's individual database partitions
  console.log(`Initializing collections partition for tenant: ${tenantId}`);
  
  const customCompanyInfo = {
    name: tenantData.companyName,
    logo: "",
    website: `${tenantData.companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.defibeo.com`,
    email: tenantData.companyEmail,
    phone: tenantData.companyPhone,
    nomLogiciel: tenantData.nomLogiciel || tenantData.companyName || "Défibeo Suite",
    customLocationNames: {}
  };

  const customMembers = [
    {
      id: 'member-admin-' + tenantId,
      name: tenantData.adminName,
      role: 'Propriétaire / Admin',
      email: tenantData.adminEmail,
      status: 'Actif',
      lastActive: 'En ligne',
      pin: '1234',
      envId: tenantId,
      tenantId: tenantId
    }
  ];

  // Store seeded partitions with clean, non-overwritten companyInfo and members
  await setDoc(doc(db, 'appData', getCollectionKey('companyInfo', tenantId)), { value: customCompanyInfo });
  await setDoc(doc(db, 'appData', getCollectionKey('members', tenantId)), { value: customMembers });

  // Custom function to attach envId and tenantId to records for security rules
  const addEnvFields = <T>(list: T[]): T[] => {
    return list.map(item => ({
      ...item,
      envId: tenantId,
      tenantId: tenantId
    }));
  };

  // Seed dynamic variables with initial default variables
  await setDoc(doc(db, 'appData', getCollectionKey('variables', tenantId)), { value: addEnvFields(INITIAL_VARIABLES) });

  // Initialize all dynamic tables to completely empty arrays
  const cleanPartitions = [
    'clients',
    'defibrillateurs',
    'otherEquipments',
    'tickets',
    'commercialDocs',
    'gedDocs',
    'stocks',
    'distributed_stocks',
    'customerReviews',
    'expenses',
    'veilles',
    'generatedReports',
    'fsmTours',
    'pointages',
    'pointagesAutoVigilance',
    'memos',
    'achats_fournisseurs'
  ];

  await Promise.all(
    cleanPartitions.map(tableName =>
      setDoc(doc(db, 'appData', getCollectionKey(tableName, tenantId)), { value: [] })
    )
  );

  // Initialize notifications with the clean welcome message
  const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const welcomeNotification = {
    id: 'notif-' + Date.now(),
    category: 'Système',
    title: 'Votre nouvel environnement Défibeo a été créé avec succès.',
    timestamp: nowStr,
    situation: 'Terminé',
    envId: tenantId,
    tenantId: tenantId
  };
  await setDoc(doc(db, 'appData', getCollectionKey('notifications', tenantId)), { value: [welcomeNotification] });

  // Pre-populate client-side local storage with clean, empty data and the custom company/member profiles for this new environment
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(`defib_${tenantId}_company_info`, JSON.stringify(customCompanyInfo));
      window.localStorage.setItem(`defib_${tenantId}_members`, JSON.stringify(customMembers));
      window.localStorage.setItem(`defib_${tenantId}_clients`, JSON.stringify([]));
      window.localStorage.setItem(`defib_${tenantId}_variables`, JSON.stringify(INITIAL_VARIABLES));
      window.localStorage.setItem(`defib_${tenantId}_defibrillateurs`, JSON.stringify([]));
      window.localStorage.setItem(`defib_${tenantId}_support_tickets`, JSON.stringify([]));
      window.localStorage.setItem(`defib_${tenantId}_memos`, JSON.stringify([]));
      window.localStorage.setItem(`defib_${tenantId}_commercial_docs`, JSON.stringify([]));
      window.localStorage.setItem(`defib_${tenantId}_ged_docs`, JSON.stringify([]));
      window.localStorage.setItem(`defib_${tenantId}_stocks`, JSON.stringify([]));
      window.localStorage.setItem(`defib_${tenantId}_distributed_stocks`, JSON.stringify([]));
      window.localStorage.setItem(`defib_${tenantId}_customer_reviews`, JSON.stringify([]));
      window.localStorage.setItem(`defib_${tenantId}_generated_reports`, JSON.stringify([]));
      window.localStorage.setItem(`defib_${tenantId}_fsm_tours`, JSON.stringify([]));
      window.localStorage.setItem(`defib_${tenantId}_expenses`, JSON.stringify([]));
      window.localStorage.setItem(`defib_${tenantId}_other_equipments`, JSON.stringify([]));
      window.localStorage.setItem(`defib_${tenantId}_pointages_history`, JSON.stringify([]));
      window.localStorage.setItem(`defib_${tenantId}_pointages_auto_vigilance`, JSON.stringify([]));
      window.localStorage.setItem(`defib_${tenantId}_achats_fournisseurs`, JSON.stringify([]));
      window.localStorage.setItem(`defib_${tenantId}_veilles`, JSON.stringify([]));
      window.localStorage.setItem(`defib_${tenantId}_notifications`, JSON.stringify([welcomeNotification]));
      window.localStorage.setItem(`defib_${tenantId}_custom_location_names`, JSON.stringify({}));
      window.localStorage.setItem(`defib_${tenantId}_enable_other_equipments`, 'Non');
    }
  } catch (e) {
    console.warn("Failed to seed new tenant's client-side local storage cache:", e);
  }

  return tenantId;
}

/**
 * Seeds or resets an environment with full specified demo/dummy data.
 */
export async function seedTenantDemoData(tenantId: string): Promise<void> {
  const tenants = await getRegisteredTenants();
  const rawTid = tenantId.trim().toLowerCase();
  const numTid = rawTid.replace(/^d/i, '');
  const tenant = tenants.find(t => 
    (t.id && t.id.toLowerCase() === rawTid) ||
    (t.shortEnvId && t.shortEnvId.toLowerCase() === rawTid) ||
    (t.id && t.id.toLowerCase().replace(/^d/i, '') === numTid) ||
    (t.shortEnvId && t.shortEnvId.toLowerCase().replace(/^d/i, '') === numTid)
  );
  const adminEmail = tenant ? tenant.adminEmail : `admin.${tenantId.toLowerCase()}@defibeo.com`;
  const adminName = tenant ? tenant.adminName : (tenant ? tenant.companyName : `Administrateur ${tenantId}`);

  const getSuffix = (tid: string): string => {
    const match = tid.match(/\d+/);
    return match ? match[0] : "1";
  };
  const suffix = getSuffix(tenantId);
  const clientEmail = `demo${suffix}@demo.com`;
  const techEmail = `techniciendemo${suffix}@demo.com`;

  // Custom function to attach envId and tenantId to records for security rules
  const addEnvFields = <T>(list: T[]): T[] => {
    return list.map(item => ({
      ...item,
      envId: tenantId,
      tenantId: tenantId
    }));
  };

  // Reset/seed Company Info for this tenant
  const customCompanyInfo = {
    name: tenant ? tenant.companyName : "Défibeo Solutions",
    logo: "",
    website: tenant ? `${tenant.companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.defibeo.com` : "demo.defibeo-solutions.com",
    email: tenant ? tenant.companyEmail : "contact@defibeo-solutions.com",
    phone: tenant ? tenant.companyPhone : "+33 1 47 20 00 01",
    nomLogiciel: tenant ? (tenant.nomLogiciel || tenant.companyName) : "Défibeo Suite"
  };
  await setDoc(doc(db, 'appData', getCollectionKey('companyInfo', tenantId)), { value: customCompanyInfo });

  // Create brand-new, clean, completely customized client records specific to this tenant environment
  const seededClients: Client[] = [
    {
      id: 'c1',
      denomination: `Medical360 - SPO (Demo ${suffix})`,
      siret: '12345678901234',
      email: clientEmail,
      phone: '+33 6 12 34 56 78',
      accessKey: tenantId === 'demo' ? 'DEMO123' : 'ACCESS1' + suffix,
      signaturePin: '1234',
      nomPrenomSite: 'Jean-Marc DUPONT',
      telephoneSite: '+33 6 12 34 56 78',
      emailSite: clientEmail,
      contrat: 'Oui',
      nomContrat: 'Abonnement Maintenance Premium',
      referenceContrat: 'REF-2026-SPO',
      debutContrat: '2026-01-01',
      finContrat: '2029-12-31'
    },
    {
      id: 'c2',
      denomination: `Clinique de l'Erdre (Demo ${suffix})`,
      siret: '98765432100021',
      email: clientEmail,
      phone: '+33 7 98 76 54 32',
      accessKey: 'ACCESS2' + suffix,
      signaturePin: '5678',
      nomPrenomSite: 'Pierre Martin',
      telephoneSite: '+33 7 98 76 54 32',
      emailSite: clientEmail,
      contrat: 'Oui',
      nomContrat: 'Contrat Sécurité Incendie',
      referenceContrat: 'CTR-INC-1220',
      debutContrat: '2025-06-15',
      finContrat: '2027-06-14'
    },
    {
      id: 'c3',
      denomination: `Mairie de Bordeaux (Demo ${suffix})`,
      siret: '55210928300012',
      email: clientEmail,
      phone: '+33 5 56 10 20 31',
      accessKey: 'ACCESS3' + suffix,
      signaturePin: '9012',
      nomPrenomSite: 'Robert PASCAL',
      telephoneSite: '+33 5 56 10 20 31',
      emailSite: clientEmail,
      contrat: 'Non',
      nomContrat: 'Aucun contrat',
      referenceContrat: '-',
      debutContrat: '',
      finContrat: ''
    }
  ];

  const seededDefibrillateurs: Defibrillateur[] = [
    {
      id: 'df_demo_' + tenantId,
      identifiant: 'SPO-D26-DAE',
      numeroSerie: 'SN-G5-' + suffix + '001',
      commentaire: 'Défibrillateur de démonstration Cardiac Science Powerheart G5.',
      modeleId: 'CSPG5', // Auto-selected to the created variable (Cardiac Science Powerheart G5)
      clientId: 'c1', // Linked to Medical360 - SPO
      nomPrenomSite: 'Jean-Marc DUPONT',
      telephoneSite: '+33 6 12 34 56 78',
      emailSite: clientEmail,
      contrat: 'Oui',
      nomContrat: 'Abonnement Maintenance Premium',
      referenceContrat: 'REF-2026-SPO',
      debutContrat: '2026-01-01',
      finContrat: '2029-12-31',
      modeleCoffretId: '',
      numeroLotCoffret: '',
      commentaireCoffret: '',
      numVoie: '12 Rue de la Paix',
      ville: 'Paris',
      cp: '75001',
      region: 'Île-de-France',
      pays: 'France',
      latitude: '48.869',
      longitude: '2.332',
      commentaireAdresse: 'En intérieur, panneau mural visible depuis l\'entrée principale.',
      acces247: false,
      accesSemaine: true,
      accesWeekend: false,
      exterieur: false,
      finGarantie: '2029-06-30',
      fabrication: '2025-10-15',
      miseEnService: '2026-01-15',
      derniereMaintenance: '2026-05-15',
      sortieFabricant: '2025-11-01',
      modeleElectrodeAId: '',
      lotElectrodeA: 'LOTA-99824',
      insertionElectrodeA: '2026-01-15',
      peremptionElectrodeA: '2028-06-01',
      livraisonElectrodeA: '2025-11-01',
      situationElectrodeA: 'Vert',
      commentaireElectrodeA: 'Neuves',
      peremptionSecoursElectrodeA: '',
      hasPadpakA: 'Oui',
      lotPadpakA: 'PADPAK-A-123',
      peremptionPadpakA: '2028-06-01',
      modeleElectrodePId: '',
      lotElectrodeP: '',
      insertionElectrodeP: '',
      peremptionElectrodeP: '',
      livraisonElectrodeP: '',
      situationElectrodeP: 'Vert',
      commentaireElectrodeP: '',
      peremptionSecoursElectrodeP: '',
      hasPadpakP: 'Oui',
      lotPadpakP: '',
      peremptionPadpakP: '',
      modeleBatterieId: '',
      lotBatterie: 'LOTB-00912',
      insertionBatterie: '2026-01-15',
      peremptionBatterie: '2030-01-15',
      peremptionTrousse: '',
      livraisonBatterie: '2025-11-01',
      situationBatterie: 'Vert',
      pourcentageBatterie: '100',
      commentaireBatterie: 'Tension normale',
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
      commentaireCampagneRappel: ''
    }
  ];

  const seededTours = [
    {
      id: `tour-demo-${tenantId}`,
      title: `Tournée Centre (Demo ${suffix})`,
      techName: 'Jakub Démo',
      startDate: new Date().toISOString().substring(0, 10),
      status: 'À faire',
      missions: [
        {
          id: `m-demo-${tenantId}-1`,
          clientName: `Medical360 - SPO (Demo ${suffix})`,
          defibIdentifiant: 'SPO-D26-DAE',
          reason: 'Maintenance préventive',
          requiredParts: ['Électrodes Adultes', 'Batterie'],
          status: 'À faire',
          priority: 'Normale',
          time: '14:00'
        }
      ]
    }
  ];

  const seededMembers = [
    {
      id: 'member-admin-' + tenantId,
      name: adminName,
      email: adminEmail,
      role: 'Propriétaire / Admin',
      pin: '1234',
      status: 'Actif',
      lastActive: 'En ligne'
    },
    {
      id: 'member-tech-demo',
      name: 'Jakub Démo',
      email: techEmail,
      role: 'Technicien',
      pin: '1034',
      startAddress: 'Véhicule A',
      status: 'Actif',
      lastActive: 'En ligne'
    }
  ];

  // 2. Notifications: add exactly the initial system notification
  const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const dummyNotification = {
    id: 'notif-demo-' + Date.now(),
    category: 'Système' as const,
    title: 'Le super-admin vient de créer l’environnement.',
    timestamp: nowStr,
    situation: 'Terminé' as const,
    envId: tenantId,
    tenantId: tenantId
  };

  // 3. Seed every partition with the custom, clean datasets using the exact collection keys from getCollectionKey
  await setDoc(doc(db, 'appData', getCollectionKey('clients', tenantId)), { value: addEnvFields(seededClients) });
  await setDoc(doc(db, 'appData', getCollectionKey('variables', tenantId)), { value: addEnvFields(INITIAL_VARIABLES) });
  await setDoc(doc(db, 'appData', getCollectionKey('defibrillateurs', tenantId)), { value: addEnvFields(seededDefibrillateurs) });
  await setDoc(doc(db, 'appData', getCollectionKey('otherEquipments', tenantId)), { value: addEnvFields(INITIAL_OTHER_EQUIPMENTS) });
  await setDoc(doc(db, 'appData', getCollectionKey('tickets', tenantId)), { value: addEnvFields(INITIAL_TICKETS) });
  await setDoc(doc(db, 'appData', getCollectionKey('commercialDocs', tenantId)), { value: addEnvFields(INITIAL_COMMERCIAL_DOCS) });
  await setDoc(doc(db, 'appData', getCollectionKey('gedDocs', tenantId)), { value: addEnvFields(INITIAL_GED_DOCS) });
  await setDoc(doc(db, 'appData', getCollectionKey('stocks', tenantId)), { value: addEnvFields(INITIAL_STOCKS) });
  await setDoc(doc(db, 'appData', getCollectionKey('distributed_stocks', tenantId)), { value: addEnvFields(INITIAL_DISTRIBUTED_STOCKS) });
  await setDoc(doc(db, 'appData', getCollectionKey('customerReviews', tenantId)), { value: addEnvFields(INITIAL_REVIEWS) });
  await setDoc(doc(db, 'appData', getCollectionKey('expenses', tenantId)), { value: addEnvFields(INITIAL_EXPENSES) });
  await setDoc(doc(db, 'appData', getCollectionKey('veilles', tenantId)), { value: addEnvFields(INITIAL_VEILLES) });
  await setDoc(doc(db, 'appData', getCollectionKey('generatedReports', tenantId)), { value: addEnvFields(INITIAL_REPORTS) });
  await setDoc(doc(db, 'appData', getCollectionKey('fsmTours', tenantId)), { value: addEnvFields(seededTours) });
  await setDoc(doc(db, 'appData', getCollectionKey('members', tenantId)), { value: addEnvFields(seededMembers) });
  await setDoc(doc(db, 'appData', getCollectionKey('notifications', tenantId)), { value: [dummyNotification] });

  // Clear independent dynamic tables to complete reset
  const emptyTables = [
    'pointages',
    'pointagesAutoVigilance',
    'memos',
    'achats_fournisseurs'
  ];

  await Promise.all(
    emptyTables.map(tableName => 
      setDoc(doc(db, 'appData', getCollectionKey(tableName, tenantId)), { value: [] })
    )
  );

  // Clear local storage cache keys for this tenant in the current browser
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key.includes(tenantId) || key.includes('registered_tenants'))) {
        localStorage.removeItem(key);
      }
    }
  } catch (e) {
    console.warn('Failed to clear local storage in seedTenantDemoData:', e);
  }

  console.log(`Demo data successfully seeded for tenant ${tenantId}`);
}

/**
 * Searches for admin credentials in dynamic tenant partitions.
 */
export async function loginTenantAdmin(email: string, passwordPlain: string): Promise<Tenant | null> {
  const tenants = await getRegisteredTenants(true);
  const searchEmail = email.trim().toLowerCase();
  const searchPass = passwordPlain.trim();
  
  // Match demo first
  if (searchEmail === 'account@demo.com' && searchPass === '123456') {
    return {
      id: 'demo',
      companyName: 'Défibeo Solutions',
      companyEmail: 'contact@defibeo-solutions.com',
      companyPhone: '+33 1 47 20 00 01',
      adminName: 'Admin Démo',
      adminEmail: 'account@demo.com',
      adminPasswordHexOrPlain: '123456',
      lang: 'Français',
      createdAt: '2026-06-15'
    };
  }

  const found = tenants.find(t => t.adminEmail.trim().toLowerCase() === searchEmail && t.adminPasswordHexOrPlain.trim() === searchPass);
  return found || null;
}

/**
 * Verifies if a defibrillator identifiant exists anywhere in the entire database (cross-environments/tenants).
 */
export async function checkIfDefibIdentifiantExistsAnywhere(
  identifiant: string,
  excludeDefibId?: string
): Promise<{ exists: boolean; tenantName?: string }> {
  const checkIdent = identifiant.trim().toUpperCase();
  if (!checkIdent) {
    return { exists: false };
  }

  try {
    const tenants = await getRegisteredTenants();
    const tenantIds = ['demo', ...tenants.map(t => t.id)];

    const results = await Promise.all(
      tenantIds.map(async (tid) => {
        try {
          const key = tid === 'demo' ? 'defibrillateurs' : `${tid}_defibrillateurs`;
          const defibList = await fetchRawCollectionFromFirestore<any[]>(key, 3000) || [];
          if (Array.isArray(defibList)) {
            for (const df of defibList) {
              if (excludeDefibId && df.id === excludeDefibId) {
                continue;
              }
              if (df.identifiant && df.identifiant.trim().toUpperCase() === checkIdent) {
                let tenantLabel = 'Démonstration';
                if (tid !== 'demo') {
                  const matchingTenant = tenants.find(t => t.id === tid);
                  tenantLabel = matchingTenant ? matchingTenant.companyName : tid;
                }
                return { exists: true, tenantName: tenantLabel };
              }
            }
          }
        } catch (err) {
          console.warn(`Error scanning defib in tenant list for ${tid}:`, err);
        }
        return null;
      })
    );

    const found = results.find(r => r !== null);
    if (found) {
      return found;
    }
  } catch (error) {
    console.warn('Error checking global defibrillator uniqueness:', error);
  }

  return { exists: false };
}

/**
 * Finds the tenant information owning a specified defibrillator identifiant.
 */
export async function findTenantAndDefibGlobally(identifiant: string): Promise<{ tenantId: string; companyName: string; companyEmail: string; exists: boolean } | null> {
  const checkIdent = identifiant.trim().toUpperCase();
  if (!checkIdent) return null;
  try {
    const tenants = await getRegisteredTenants();
    const tenantIds = ['demo', ...tenants.map(t => t.id)];

    const results = await Promise.all(
      tenantIds.map(async (tid) => {
        try {
          const key = tid === 'demo' ? 'defibrillateurs' : `${tid}_defibrillateurs`;
          const defibList = await fetchRawCollectionFromFirestore<any[]>(key, 3000) || [];
          if (Array.isArray(defibList)) {
            const hasMatch = defibList.some(df => 
              (df.identifiant && df.identifiant.trim().toUpperCase() === checkIdent) ||
              (df.id && df.id.trim().toUpperCase() === checkIdent)
            );
            if (hasMatch) {
              if (tid === 'demo') {
                return {
                  tenantId: 'demo',
                  companyName: 'Défibeo Solutions',
                  companyEmail: 'contact@defibeo-solutions.com',
                  exists: true
                };
              } else {
                const tenantObj = tenants.find(t => t.id === tid);
                return {
                  tenantId: tid,
                  companyName: tenantObj ? tenantObj.companyName : tid,
                  companyEmail: tenantObj ? tenantObj.companyEmail : 'support@defibeo.com',
                  exists: true
                };
              }
            }
          }
        } catch (err) {
          console.warn(`Error finding tenant and defib globally for ${tid}:`, err);
        }
        return null;
      })
    );

    const found = results.find(r => r !== null);
    if (found) {
      return found;
    }
  } catch (error) {
    console.warn('Error finding tenant and defib globally:', error);
  }
  return null;
}

/**
 * Updates the language of a specific tenant in the master registry.
 */
export async function updateTenantLanguage(tenantId: string, lang: string): Promise<void> {
  if (tenantId === 'demo' || !tenantId) return;
  try {
    const tenants = await getRegisteredTenants();
    const updated = tenants.map(t => {
      if (t.id === tenantId) {
        return { ...t, lang };
      }
      return t;
    });
    const docRef = doc(db, 'appData', 'registered_tenants');
    await setDoc(docRef, { value: updated });
    saveToLocalCache('registered_tenants', updated);
    console.log(`Updated tenant ${tenantId} language to ${lang} in Firestore`);
  } catch (err) {
    console.warn(`Error updating language for tenant ${tenantId}:`, err);
  }
}

/**
 * Synchronizes the super-admin email and name in the master registered_tenants registry.
 */
export async function updateTenantAdminProfile(tenantId: string, adminEmail: string, adminName?: string): Promise<void> {
  if (!tenantId || tenantId === 'demo') return;
  try {
    const tenants = await getRegisteredTenants(true);
    let changed = false;
    const updated = tenants.map(t => {
      if (t.id === tenantId) {
        changed = true;
        return {
          ...t,
          adminEmail: adminEmail.trim(),
          adminName: adminName ? adminName.trim() : t.adminName
        };
      }
      return t;
    });
    if (changed) {
      const docRef = doc(db, 'appData', 'registered_tenants');
      await setDoc(docRef, { value: updated });
      saveToLocalCache('registered_tenants', updated);
      console.log(`Successfully updated tenant ${tenantId} super-admin email to ${adminEmail} in registered_tenants.`);
    }
  } catch (err) {
    console.warn(`Error updating tenant ${tenantId} super-admin profile in registered_tenants:`, err);
  }
}


