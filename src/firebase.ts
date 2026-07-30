import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, setDoc, persistentLocalCache, persistentMultipleTabManager, getDocFromServer, getFirestore, getDocFromCache } from 'firebase/firestore';
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

const isProductionDomain = typeof window !== 'undefined' && 
  window.location.hostname && 
  !window.location.hostname.includes('run.app') && 
  !window.location.hostname.includes('localhost') && 
  !window.location.hostname.includes('127.0.0.1');

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
  apiKey: (import.meta as any).env.VITE_FIREBASE_API_KEY || (isProductionDomain ? PROD_FIREBASE_CONFIG.apiKey : firebaseConfig.apiKey),
  authDomain: (import.meta as any).env.VITE_FIREBASE_AUTH_DOMAIN || (isProductionDomain ? PROD_FIREBASE_CONFIG.authDomain : firebaseConfig.authDomain),
  projectId: (import.meta as any).env.VITE_FIREBASE_PROJECT_ID || (isProductionDomain ? PROD_FIREBASE_CONFIG.projectId : firebaseConfig.projectId),
  storageBucket: (import.meta as any).env.VITE_FIREBASE_STORAGE_BUCKET || (isProductionDomain ? PROD_FIREBASE_CONFIG.storageBucket : firebaseConfig.storageBucket),
  messagingSenderId: (import.meta as any).env.VITE_FIREBASE_MESSAGING_SENDER_ID || (isProductionDomain ? PROD_FIREBASE_CONFIG.messagingSenderId : firebaseConfig.messagingSenderId),
  appId: (import.meta as any).env.VITE_FIREBASE_APP_ID || (isProductionDomain ? PROD_FIREBASE_CONFIG.appId : firebaseConfig.appId),
  measurementId: (import.meta as any).env.VITE_FIREBASE_MEASUREMENT_ID || (isProductionDomain ? PROD_FIREBASE_CONFIG.measurementId : firebaseConfig.measurementId)
};

const app = initializeApp(firebaseConfigOverride);

let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
    experimentalForceLongPolling: true,
  });
} catch (err) {
  console.warn("Failed to initialize Firestore with persistent local cache and multi-tab manager:", err);
  try {
    firestoreInstance = initializeFirestore(app, {
      experimentalForceLongPolling: true,
    });
  } catch (err2) {
    console.warn("Failed to initialize Firestore with experimentalForceLongPolling, falling back to basic getFirestore:", err2);
    firestoreInstance = getFirestore(app);
  }
}

export const db = firestoreInstance;
export const auth = getAuth();

/**
 * Optimistic document loader:
 * 1. Tries to get document from Firestore's persistent local cache (instant, 0ms, works fully offline).
 * 2. If it's in the cache, it returns it instantly, and schedules a background refresh from the server to keep cache updated.
 * 3. If it's not in the cache, it fetches it from the server with a short timeout.
 * 4. Falls back to normal getDoc if both fail.
 */
async function getDocOptimistic(docRef: any, key?: string, timeoutMs: number = 4000): Promise<any> {
  try {
    const cachedSnap = await getDocFromCache(docRef);
    if (cachedSnap.exists()) {
      // Trigger background update silently to refresh cache/localStorage for the next visit
      getDocFromServer(docRef).then((serverSnap) => {
        if (serverSnap.exists() && key) {
          const data = serverSnap.data() as any;
          const val = data?.value;
          if (val !== undefined) {
            saveToLocalCache(key, val);
          }
        }
      }).catch(() => {
        // Silently ignore background fetch errors (e.g., if client is offline)
      });
      return cachedSnap;
    }
  } catch (cacheErr) {
    // Document is not in local Firestore cache yet, proceed to fetch
  }

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Firestore server fetch timed out')), timeoutMs)
  );
  try {
    return await Promise.race([
      getDocFromServer(docRef),
      timeoutPromise
    ]);
  } catch (err) {
    console.log(`[Firestore Cache-First] getDocFromServer failed or timed out for ${docRef.id}, using fallback/cache.`);
    throw err;
  }
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

export function getCollectionKey(collectionName: string, tenantId: string = currentTenantId): string {
  if (tenantId === 'demo' || !tenantId) {
    return collectionName;
  }
  return `${tenantId}_${collectionName}`;
}

export function saveToLocalCache(key: string, value: any): void {
  try {
    localStorage.setItem(`fs_cache_${key}`, JSON.stringify(value));
  } catch (err) {
    console.warn(`Failed to write to local cache for key ${key}:`, err);
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
 * Fetches a collection (stored as a single document with a 'list' array or object data) 
 * from Firestore. Returns null if the document does not exist yet.
 */
export async function fetchCollectionFromFirestore<T>(collectionName: string, tenantId?: string): Promise<T | null> {
  const key = getCollectionKey(collectionName, tenantId || getTenantId());
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return getFromLocalCache<T>(key);
  }
  try {
    const docRef = doc(db, 'appData', key);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Fetch timed out')), 5000)
    );
    const serverSnap = await Promise.race([
      getDocFromServer(docRef),
      timeoutPromise
    ]);
    if (serverSnap.exists()) {
      const payload = serverSnap.data();
      const val = payload.value as T;
      saveToLocalCache(key, val);
      return val;
    }
  } catch (error) {
    console.log(`[Firestore Server-First] Failed to fetch collection ${collectionName} from server, falling back to cache:`, error);
  }
  return getFromLocalCache<T>(key);
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
 * Saves a collection array or object to Firestore.
 */
export async function saveCollectionToFirestore<T>(collectionName: string, value: T): Promise<void> {
  const tenantId = getTenantId();
  const key = getCollectionKey(collectionName, tenantId);
  
  // Auto-inject envId and tenantId if items are objects inside an array
  let sanitizedValue = value;
  if (Array.isArray(value)) {
    sanitizedValue = value.map(item => {
      if (item && typeof item === 'object') {
        return {
          ...item,
          envId: tenantId,
          tenantId: tenantId
        };
      }
      return item;
    }) as unknown as T;
  } else if (value && typeof value === 'object') {
    sanitizedValue = {
      ...value,
      envId: tenantId,
      tenantId: tenantId
    } as unknown as T;
  }

  const finalCleanValue = sanitizeUndefined(sanitizedValue);
  
  // Save to cache immediately so UI reads it instantly
  saveToLocalCache(key, finalCleanValue);

  try {
    const docRef = doc(db, 'appData', key);
    await setDoc(docRef, { value: finalCleanValue });
    console.log(`Successfully synced ${key} to Firestore with hidden environment fields.`);
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
    const snap = bypassCache
      ? await getDocFromServer(docRef)
      : await getDocOptimistic(docRef, 'registered_tenants', 4000);
    if (snap.exists()) {
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
        await setDoc(docRef, { value: updatedTenants });
        console.log('Successfully migrated missing shortEnvId for some tenants:', updatedTenants);
      }

      saveToLocalCache('registered_tenants', updatedTenants);
      return updatedTenants;
    }
    const cached = getFromLocalCache<Tenant[]>('registered_tenants') || [];
    return addDemoIfNeeded(cached);
  } catch (err) {
    console.log('[Firestore Cache-First] Fallback to cache for registered_tenants (offline or timed out).');
    const cached = getFromLocalCache<Tenant[]>('registered_tenants') || [];
    return addDemoIfNeeded(cached);
  }
}

/**
 * Fetches a raw collection key from Firestore bypassing the default prefix.
 */
export async function fetchRawCollectionFromFirestore<T>(rawKey: string, timeoutMs: number = 15000): Promise<T | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return getFromLocalCache<T>(rawKey);
  }
  try {
    const docRef = doc(db, 'appData', rawKey);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Fetch timed out')), 5000)
    );
    const serverSnap = await Promise.race([
      getDocFromServer(docRef),
      timeoutPromise
    ]);
    if (serverSnap.exists()) {
      const payload = serverSnap.data();
      const val = payload.value as T;
      saveToLocalCache(rawKey, val);
      return val;
    }
  } catch (error) {
    console.log(`[Firestore Server-First] Failed to fetch raw key ${rawKey} from server, falling back to cache:`, error);
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
  const tenant = tenants.find(t => t.id === tenantId);
  const adminEmail = tenant ? tenant.adminEmail : 'roesch.ronan@gmail.com';
  const adminName = tenant ? tenant.adminName : 'Ronan Roesch';

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


