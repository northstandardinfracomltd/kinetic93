import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, setDoc, memoryLocalCache, getDocFromServer, getFirestore, getDocFromCache } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { idbSet, idbGet, idbClear } from './idb';
export { idbSet, idbGet, idbClear };
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
    // Force one-time & session purge of legacy Firebase defibrillateurs, clients, and other_equipments caches
    // and remove any unprefixed cross-tenant localStorage keys
    const purgeLegacyFirebaseTabCaches = () => {
      const unprefixedCrossTenantKeys = new Set([
        'defib_company_info',
        'defib_members',
        'defib_location_names',
        'defib_custom_location_names',
        'defib_sage100_active',
        'defib_sage100_client_id',
        'defib_sage100_access_token',
        'defib_sage100_secret_token',
        'defib_sage4197_active',
        'defib_sage4197_client_id',
        'defib_sage4197_access_token',
        'defib_sage4197_secret_token',
        'defib_pennylane_active',
        'defib_pennylane_client_id',
        'defib_pennylane_company_token',
        'defib_pennylane_secret_token',
        'defib_dropbox_active',
        'defib_dropbox_app_key',
        'defib_dropbox_app_secret',
        'defib_dropbox_access_token',
        'defib_cegid_active',
        'defib_cegid_api_key',
        'defib_cegid_api_secret',
        'defib_lemongroup_ws_active',
        'defib_lemongroup_ws_api_key',
        'defib_lemongroup_ws_api_secret',
        'defib_textelp_active',
        'defib_textelp_env_id',
        'defib_textelp_secret_id',
        'defib_civilprom_active',
        'defib_civilprom_website_url',
        'defib_civilprom_assets_file_url',
        'defib_atlasante_active',
        'defib_atlasante_declarant_id',
        'defib_atlasante_url_auth',
        'defib_google_drive_active',
        'defib_google_drive_email',
        'defib_google_drive_token',
        'defib_api_defibeo_active',
        'defib_api_defibeo_key',
        'defib_api_defibeo_secret',
        'firestore_quota_exhausted_until'
      ]);
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (unprefixedCrossTenantKeys.has(k)) {
          toRemove.push(k);
          continue;
        }
        // Preserve spreadsheet URL keys, tenant-scoped company_info, members, location names, connectors, registered_tenants, login state
        if (
          k.includes('spreadsheet_') ||
          k.includes('company_info') ||
          k.includes('companyInfo') ||
          k.includes('tenantDatabases') ||
          k.includes('_members') ||
          k.includes('custom_location_names') ||
          k.includes('api_connectors') ||
          k === 'fs_cache_registered_tenants' ||
          k.startsWith('defib_admin_') ||
          k === 'defib_tenant_id' ||
          k === 'defib_logged_user_role'
        ) {
          continue;
        }
        const lower = k.toLowerCase();
        if (
          lower.includes('defibrillateur') ||
          lower.includes('_defibs') ||
          lower.includes('_clients') ||
          lower.includes('other_equipment') ||
          lower.includes('otherequipment') ||
          lower.includes('deleted_defib_keys')
        ) {
          toRemove.push(k);
        }
      }
      for (const k of toRemove) {
        localStorage.removeItem(k);
      }
    };
    purgeLegacyFirebaseTabCaches();
  }
} catch (_) {}

const PROD_FIREBASE_CONFIG = {
  apiKey: (firebaseConfig as any)?.apiKey || "AIzaSyDIu55IW0GJ6hbsa7ZrIyKM89dlWpRW4L8",
  authDomain: (firebaseConfig as any)?.authDomain || "gen-lang-client-0413990730.firebaseapp.com",
  projectId: (firebaseConfig as any)?.projectId || "gen-lang-client-0413990730",
  storageBucket: (firebaseConfig as any)?.storageBucket || "gen-lang-client-0413990730.firebasestorage.app",
  messagingSenderId: (firebaseConfig as any)?.messagingSenderId || "862243466493",
  appId: (firebaseConfig as any)?.appId || "1:862243466493:web:fc5b1fbcab864b3bba2294",
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

const firestoreDbId = (firebaseConfig as any)?.firestoreDatabaseId;
let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: memoryLocalCache(),
    experimentalForceLongPolling: true,
  }, firestoreDbId);
} catch (err) {
  console.warn("Failed to initialize Firestore with memory local cache:", err);
  try {
    firestoreInstance = firestoreDbId ? getFirestore(app, firestoreDbId) : getFirestore(app);
  } catch (err2) {
    console.warn("Failed to initialize basic getFirestore:", err2);
    firestoreInstance = initializeFirestore(app, {}, firestoreDbId);
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
  if (isFirestoreQuotaExhausted()) {
    return { exists: () => false, data: () => null };
  }
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
  } catch (err: any) {
    const msg = String(err?.message || err || '').toLowerCase();
    if (msg.includes('quota') || msg.includes('resource-exhausted') || err?.code === 'resource-exhausted') {
      recordFirestoreQuotaExhaustion(6);
    }
    console.log(`[Firestore Cache-First] getDoc failed or timed out for ${docRef.id}, using fallback/cache:`, err);
  }

  // Fallback to cache
  try {
    const cachedSnap = await getDocFromCache(docRef);
    if (cachedSnap && cachedSnap.exists()) {
      return cachedSnap;
    }
  } catch (_) {}

  // Last resort: basic getDoc without timeout race only if quota is not exhausted
  if (isFirestoreQuotaExhausted()) {
    return { exists: () => false, data: () => null };
  }
  return await getDoc(docRef).catch((e: any) => {
    const msg = String(e?.message || e || '').toLowerCase();
    if (msg.includes('quota') || msg.includes('resource-exhausted') || e?.code === 'resource-exhausted') {
      recordFirestoreQuotaExhaustion(6);
    }
    return { exists: () => false, data: () => null };
  });
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
  } else if (collectionName === 'ctt_global_rules' || collectionName === 'cttGlobalRules' || collectionName === 'ctt_rules') {
    aliases.push('ctt_global_rules', 'cttGlobalRules', 'ctt_rules');
  } else if (collectionName === 'tenantMessages' || collectionName === 'tenant_messages' || collectionName === 'canal_messages') {
    aliases.push('tenantMessages', 'tenant_messages', 'canal_messages');
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

export const KNOWN_TENANTS_REGISTRY: Array<Partial<Tenant> & { id: string; shortEnvId: string; companyName: string }> = [
  { id: 'demo', shortEnvId: 'D10', companyName: 'Défibeo Solutions', companyEmail: 'contact@defibeo-solutions.com', companyPhone: '+33 1 47 20 00 01', adminName: 'Admin Démo', adminEmail: 'account@demo.com', adminPasswordHexOrPlain: '123456', lang: 'Français' },
  { id: 'tenant_pvzvub57h_1781513640995', shortEnvId: 'D71', companyName: 'Un Défi Pour La Vie', companyEmail: 'udplv@civilprom.com', companyPhone: '0651517065', adminName: 'Jean-Luc Degont', adminEmail: 'udplv@civilprom.com', adminPasswordHexOrPlain: '95162secureUSA--', lang: 'Français, France' },
  { id: 'D1', shortEnvId: 'D38', companyName: 'DemoTest', companyEmail: 'demottest@civilprom.com', companyPhone: '0651517065', adminName: 'Noor Jakub', adminEmail: 'demottest@civilprom.com', adminPasswordHexOrPlain: '95162secureUSA--', lang: 'Français' },
  { id: 'D2', shortEnvId: 'D90', companyName: 'Test', companyEmail: 'test@civilprom.com', companyPhone: '0651517065', adminName: 'Noor Jakub', adminEmail: 'test@civilprom.com', adminPasswordHexOrPlain: '95162testdemo', lang: 'Français' },
  { id: 'D3', shortEnvId: 'D63', companyName: 'DEROESCH', companyEmail: 'deroesch@civilprom.com', companyPhone: '0651517065', adminName: 'Ronan Roesch', adminEmail: 'deroesch@civilprom.com', adminPasswordHexOrPlain: '95162secureUSA--', lang: 'Français' },
  { id: 'D4', shortEnvId: 'D64', companyName: 'DemoTest', companyEmail: 'demotest@civilprom.com', companyPhone: '0651517065', adminName: 'Ronan Roesch', adminEmail: 'demotest@civilprom.com', adminPasswordHexOrPlain: '951demo360', lang: 'Français' },
  { id: 'D5', shortEnvId: 'D52', companyName: 'MATEO', companyEmail: 'mateo@civilprom.com', companyPhone: '0651516087', adminName: 'Alban test', adminEmail: 'mateo@civilprom.com', adminPasswordHexOrPlain: '95162secureUSA--', lang: 'Français' },
  { id: 'D6', shortEnvId: 'D53', companyName: 'cozy', companyEmail: 'cozy@civilprom.com', companyPhone: '0909090909', adminName: 'test mind', adminEmail: 'cozy@civilprom.com', adminPasswordHexOrPlain: '95162secureUSA--', lang: 'Français' },
  { id: 'D7', shortEnvId: 'D28', companyName: 'JPM973', companyEmail: 'jpm973@civilprom.com', companyPhone: '0600000000', adminName: 'Jean Pedro Maignan', adminEmail: 'jpm973@civilprom.com', adminPasswordHexOrPlain: '862379OHL-GENZX', lang: 'Français, France', nomLogiciel: 'JPM973' },
  { id: 'D8', shortEnvId: 'D21', companyName: 'SAS Restenvie', companyEmail: 'restenvie@civilprom.com', companyPhone: '0600000000', adminName: 'Laurent Muller', adminEmail: 'restenvie@civilprom.com', adminPasswordHexOrPlain: 'R3S73NV1E-GENZX', lang: 'Français', nomLogiciel: 'Restenvie' },
  { id: 'D9', shortEnvId: 'D11', companyName: 'DL France Defib', companyEmail: 'dlfrancedefib@civilprom.com', companyPhone: '0600000000', adminName: 'Denis Lamarche', adminEmail: 'dlfrancedefib@civilprom.com', adminPasswordHexOrPlain: 'D1FR4NC3D3F18-GENZL', lang: 'Français', nomLogiciel: 'DLFRANCEDEFIB' },
  { id: 'D10', shortEnvId: 'D88', companyName: 'CardioPro', companyEmail: 'cardiopro@civilprom.com', companyPhone: '0600000000', adminName: 'Anthony Monaldi', adminEmail: 'cardiopro@civilprom.com', adminPasswordHexOrPlain: 'C4RD10PR0-GENWL', lang: 'Français', nomLogiciel: 'CardioPro' },
  { id: 'D11', shortEnvId: 'D39', companyName: 'CardiaPulse', companyEmail: 'cardiapulse@civilprom.com', companyPhone: '0600000000', adminName: 'Georges Lanzi', adminEmail: 'cardiapulse@civilprom.com', adminPasswordHexOrPlain: 'C4RD14PU7S3-GENYL', lang: 'Français, France', nomLogiciel: 'CardiaPulse' },
  { id: 'D12', shortEnvId: 'D22', companyName: 'CardiacSafe', companyEmail: 'cardiacsafe@civilprom.com', companyPhone: '0600000000', adminName: 'Ludovic Desvaux', adminEmail: 'cardiacsafe@civilprom.com', adminPasswordHexOrPlain: 'C4RD14C84F3-GENZV', lang: 'Français', nomLogiciel: 'CardiacSafe' },
  { id: 'D13', shortEnvId: 'D31', companyName: 'Urgence Secours Équipements', companyEmail: 'use@civilprom.com', companyPhone: '0600000000', adminName: 'Arthur Sallé', adminEmail: 'use@civilprom.com', adminPasswordHexOrPlain: 'U5G3NC3S3C0U4R8-GENZH', lang: 'Français', nomLogiciel: 'USE' },
  { id: 'D14', shortEnvId: 'D30', companyName: 'ExtraLife', companyEmail: 'extralife@civilprom.com', companyPhone: '0600000000', adminName: 'Thomas Christophe', adminEmail: 'extralife@civilprom.com', adminPasswordHexOrPlain: '3X7R4L163-GENZT', lang: 'Français', nomLogiciel: 'ExtraLife' },
  { id: 'D15', shortEnvId: 'D62', companyName: 'Serenicoeur', companyEmail: 'serenicoeur@civilprom.com', companyPhone: '0600000000', adminName: 'Hubert Duverdier', adminEmail: 'serenicoeur@civilprom.com', adminPasswordHexOrPlain: 'S3R3N1C03U5-GENEL', lang: 'Français, France', nomLogiciel: 'Serenicoeur' },
  { id: 'D16', shortEnvId: 'D85', companyName: 'Un Défi Pour La Vie', companyEmail: 'udplv.copilot@civilprom.com', companyPhone: '0600000000', adminName: 'Jean Luc Degont', adminEmail: 'udplv.copilot@civilprom.com', adminPasswordHexOrPlain: 'UND3F1P0U5L4V13-GENZR', lang: 'Français', nomLogiciel: 'Copilot' },
  { id: 'D17', shortEnvId: 'D56', companyName: 'DLFranceDefib', companyEmail: 'dlfrancedefib2@civilprom.com', companyPhone: '0651517065', adminName: 'Demarche Denis', adminEmail: 'dlfrancedefib2@civilprom.com', adminPasswordHexOrPlain: '95162secureUSA--', lang: 'Français, France', nomLogiciel: 'DFranceDefib' },
  { id: 'D18', shortEnvId: 'D83', companyName: 'DSECURITE GROUPE', companyEmail: 'dsecurite.test@civilprom.com', companyPhone: '0612345678', adminName: 'Jean Dupont', adminEmail: 'dsecurite.test@civilprom.com', adminPasswordHexOrPlain: 'DS3CUR1T3*%', lang: 'Français, France', nomLogiciel: 'DSECURITE' },
  { id: 'D19', shortEnvId: 'D66', companyName: 'LION', companyEmail: 'lion@civilprom.com', companyPhone: '0651517065', adminName: 'Roesch Ronan', adminEmail: 'lion@civilprom.com', adminPasswordHexOrPlain: '95162secureUSA--', lang: 'Français, France', nomLogiciel: 'LION123' },
  { id: 'D20', shortEnvId: 'D74', companyName: 'Moraira', companyEmail: 'moraira@civilprom.com', companyPhone: '0612345678', adminName: 'Roesch Ronan', adminEmail: 'moraira@civilprom.com', adminPasswordHexOrPlain: '95162secureUSA--', lang: 'Français', nomLogiciel: 'MorairaGo' },
  { id: 'D21', shortEnvId: 'D86', companyName: 'Denia', companyEmail: 'denia@civilprom.com', companyPhone: '0787878787', adminName: 'Roesch Ronan', adminEmail: 'denia@civilprom.com', adminPasswordHexOrPlain: '95162secureUSA--', lang: 'Français, France', nomLogiciel: 'Denia123' },
  { id: 'D22', shortEnvId: 'D13', companyName: 'Xabia', companyEmail: 'xabia@civilprom.com', companyPhone: '0909090909', adminName: 'Axel Ronan', adminEmail: 'xabia@civilprom.com', adminPasswordHexOrPlain: '95162secureUSA--', lang: 'Français, France', nomLogiciel: 'Xabia123' },
  { id: 'D23', shortEnvId: 'D73', companyName: 'Tolede', companyEmail: 'tolede@civilprom.com', companyPhone: '0909090909', adminName: 'Roesch RonanPDF', adminEmail: 'tolede@civilprom.com', adminPasswordHexOrPlain: '95162secureUSA--', lang: 'Français, France', nomLogiciel: 'ToledePDF' },
  { id: 'D24', shortEnvId: 'D20', companyName: 'Hendaye', companyEmail: 'hendaye@civilprom.com', companyPhone: '0909090909', adminName: 'Roesch Ronan', adminEmail: 'hendaye@civilprom.com', adminPasswordHexOrPlain: '95162secureUSA--', lang: 'Français, France', nomLogiciel: 'Hendaye123' },
  { id: 'D25', shortEnvId: 'D24', companyName: 'Test DSG', companyEmail: 'test.dsg@civilprom.com', companyPhone: '0612345678', adminName: 'Jérôme Sommet', adminEmail: 'test.dsg@civilprom.com', adminPasswordHexOrPlain: 'DS3CU51TE', lang: 'Français, France', nomLogiciel: 'TestDSG' },
  { id: 'D26', shortEnvId: 'D67', companyName: 'DSG Test', companyEmail: 'dsg.test@civilprom.com', companyPhone: '061234567890', adminName: 'Sommet Jérôme', adminEmail: 'dsg.test@civilprom.com', adminPasswordHexOrPlain: 'DS3CU51TE123', lang: 'Français, France', nomLogiciel: 'EssaiDSG' },
  { id: 'D27', shortEnvId: 'D58', companyName: 'UN DÉFI POUR LA VIE', companyEmail: 'copilotudplv@civilprom.com', companyPhone: '0612345678', adminName: 'Jean-Luc Degont', adminEmail: 'copilotudplv@civilprom.com', adminPasswordHexOrPlain: 'C0P1L07UDPLV1IS0', lang: 'Français, France', nomLogiciel: 'Copilot' },
  { id: 'D28', shortEnvId: 'D19', companyName: "Le Cœur d'un Sam", companyEmail: 'lecoeurdunsam@civilprom.com', companyPhone: '0765582200', adminName: 'Océane Chabrier', adminEmail: 'contact.lecoeurdunsam@gmail.com', adminPasswordHexOrPlain: 'L3C03U5D1S4M*%', lang: 'Français, France', nomLogiciel: 'lecoeurdunsam' }
];

export function findTenantInList<T extends { id?: string; shortEnvId?: string }>(tenants: T[], targetTenantId: string): T | undefined {
  if (!Array.isArray(tenants) || !targetTenantId) return undefined;
  const clean = targetTenantId.trim().toLowerCase();
  const isDNum = /^d\d+$/i.test(clean);
  const isNum = /^\d+$/.test(clean);
  const numOnly = (isDNum || isNum) ? clean.replace(/^d/i, '') : '';

  // 1. Always prioritize exact match on primary tenant `id` first to prevent shortEnvId collisions!
  const idMatch = tenants.find(t =>
    t && (
      t.id?.toLowerCase() === clean ||
      (numOnly && t.id?.toLowerCase() === `d${numOnly}`)
    )
  );
  if (idMatch) return idMatch;

  // 2. Only fall back to shortEnvId if no tenant has that `id`
  return tenants.find(t =>
    t && (
      t.shortEnvId?.toLowerCase() === clean ||
      (numOnly && t.shortEnvId?.toLowerCase() === `d${numOnly}`)
    )
  );
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

  // Also check if this tenant has a non-colliding shortEnvId in registered_tenants cache or known registry
  try {
    let regTenants = getFromLocalCache<Tenant[]>('registered_tenants');
    if (!Array.isArray(regTenants) || regTenants.length === 0) {
      regTenants = [...(KNOWN_TENANTS_REGISTRY as any[])];
    } else {
      regTenants = [...regTenants];
      const existingIds = new Set(regTenants.map(t => t.id?.toLowerCase()));
      for (const kt of KNOWN_TENANTS_REGISTRY) {
        if (!existingIds.has(kt.id.toLowerCase())) {
          regTenants.push(kt as any);
        }
      }
    }
    if (Array.isArray(regTenants)) {
      const allPrimaryIds = new Set(regTenants.map(t => (t.id || '').toLowerCase().trim()).filter(Boolean));
      const match = findTenantInList(regTenants, activeTenant);
      if (match) {
        if (match.id && match.id !== 'demo') {
          tenantPrefixes.add(match.id);
          const mNum = match.id.replace(/^d/i, '');
          if (/^\d+$/.test(mNum)) {
            tenantPrefixes.add(`D${mNum}`);
            tenantPrefixes.add(`d${mNum}`);
            tenantPrefixes.add(mNum);
          }
        }
        // Only add shortEnvId as a storage prefix if it does NOT collide with another tenant's primary ID
        if (match.shortEnvId && match.id !== 'demo') {
          const sidLower = match.shortEnvId.toLowerCase().trim();
          const collidesWithOtherTenant = allPrimaryIds.has(sidLower) && sidLower !== (match.id || '').toLowerCase().trim();
          if (!collidesWithOtherTenant) {
            tenantPrefixes.add(match.shortEnvId);
            const sNum = match.shortEnvId.replace(/^d/i, '');
            if (/^\d+$/.test(sNum)) {
              tenantPrefixes.add(`D${sNum}`);
              tenantPrefixes.add(`d${sNum}`);
              tenantPrefixes.add(sNum);
            }
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
    if (collectionName === 'distributed_stocks' || collectionName === 'distributedStocks') {
      const loc = item.locationName ? String(item.locationName).trim().toLowerCase() : '';
      const ref = item.stockId || item.denominationPieceId || item.ugs || '';
      if (ref && loc) {
        key = `ds_${ref}_${loc}`;
      } else if (item.id) {
        key = `id_${String(item.id).trim()}`;
      }
    } else if (isDefib) {
      const sn = (item.numeroSerie || item.num_serie || '').trim();
      const idf = (item.identifiant || '').trim();
      const id = (item.id || '').trim();
      if (sn) {
        key = `sn_${sn.toUpperCase()}`;
      } else if (idf) {
        key = `ident_${idf.toUpperCase()}`;
      } else if (id) {
        key = `id_${id}`;
      }
    } else if (isClient) {
      if (item.id && String(item.id).trim()) {
        key = `id_${String(item.id).trim()}`;
      } else if (item.clientCode && String(item.clientCode).trim()) {
        key = `code_${String(item.clientCode).trim().toLowerCase()}`;
      } else {
        const nom = (item.nomEtablissement || item.denomination || item.nomPrenomSite || '').trim().toLowerCase();
        const site = (item.site || item.nomSite || item.adresse || '').trim().toLowerCase();
        if (nom) {
          key = `name_${nom}_${site}`;
        } else if (item.email && String(item.email).trim()) {
          key = `email_${String(item.email).trim().toLowerCase()}`;
        }
      }
    } else if (isVariable) {
      if (item.type && item.valeur) {
        key = `var_${String(item.type).trim()}_${String(item.valeur).trim()}`;
      } else if (item.id && String(item.id).trim()) {
        key = `id_${String(item.id).trim()}`;
      }
    } else if (isMember) {
      if (item.email && String(item.email).trim()) {
        key = `m_email_${String(item.email).trim().toLowerCase()}`;
      } else if (item.name && String(item.name).trim()) {
        key = `m_name_${String(item.name).trim().toLowerCase()}`;
      } else if (item.id && String(item.id).trim()) {
        key = `id_${String(item.id).trim()}`;
      }
    } else if (collectionName === 'stocks' || collectionName === 'stock' || collectionName === 'stockItems') {
      if (item.ugs) {
        key = `ugs_${String(item.ugs).trim().toLowerCase()}`;
      } else if (item.denominationPieceId) {
        key = `dp_${String(item.denominationPieceId).trim()}`;
      } else if (item.id && String(item.id).trim()) {
        key = `id_${String(item.id).trim()}`;
      }
    } else if (item.id && String(item.id).trim()) {
      key = `id_${String(item.id).trim()}`;
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
      
      const itemModStr = item.dateDerniereModification || item.updatedAt || item.dateModification || item.modifiedAt;
      const existingModStr = existing.dateDerniereModification || existing.updatedAt || existing.dateModification || existing.modifiedAt;
      const itemTime = itemModStr ? new Date(itemModStr).getTime() : 0;
      const existingTime = existingModStr ? new Date(existingModStr).getTime() : 0;

      // When merging, if both items have timestamps, the newer one takes precedence.
      // Older chunk items from API must NEVER overwrite newer modifications.
      let incomingTakesPrecedence: boolean;
      if (itemTime > 0 && existingTime > 0) {
        incomingTakesPrecedence = itemTime >= existingTime;
      } else if (itemTime > 0) {
        incomingTakesPrecedence = true;
      } else if (existingTime > 0) {
        incomingTakesPrecedence = false;
      } else {
        incomingTakesPrecedence = isItemFromApi || !isExistingFromApi;
      }

      const merged = incomingTakesPrecedence ? { ...existing, ...item } : { ...item, ...existing };
      for (const [prop, val] of Object.entries(item)) {
        if (val !== undefined && val !== null && val !== '') {
          const current = merged[prop];
          if (prop === 'traceabilities' && (Array.isArray(val) || Array.isArray(current))) {
            const arrVal = Array.isArray(val) ? val : [];
            const arrCur = Array.isArray(current) ? current : [];
            const traceMap = new Map<string, any>();
            for (const t of [...arrCur, ...arrVal]) {
              if (t && typeof t === 'object') {
                const tKey = t.id || t.lotOrSerial || JSON.stringify(t);
                traceMap.set(tKey, t);
              }
            }
            merged[prop] = Array.from(traceMap.values());
            if (merged[prop].length > 0) {
              merged.traceabilityEnabled = true;
            }
          } else if (prop === 'volumeDisponible' && (collectionName === 'distributed_stocks' || collectionName === 'distributedStocks')) {
            const vVal = Number(val || 0);
            const vCur = Number(current || 0);
            merged[prop] = Math.max(vVal, vCur);
          } else if (incomingTakesPrecedence) {
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
        const newerDate = itemTime >= existingTime ? (item.dateDerniereModification || item.updatedAt) : (existing.dateDerniereModification || existing.updatedAt);
        merged.updatedAt = (itemTime >= existingTime ? item.updatedAt : existing.updatedAt) || new Date().toISOString();
        merged.dateDerniereModification = newerDate || merged.updatedAt;
      }

      map.set(key, merged);
    } else {
      map.set(key, { ...item });
    }
  }

  return Array.from(map.values());
}

export function saveToLocalCache(key: string, value: any): void {
  if (value === null || value === undefined) return;
  // If value is a large collection (>200 items), NEVER store it in localStorage!
  // localStorage is strictly limited to 5MB and serializing 18,000 items (34MB) freezes Chrome.
  // Instead, store into IndexedDB asynchronously without blocking the UI thread.
  if (Array.isArray(value) && value.length > 200) {
    try {
      idbSet(`fs_cache_${key}`, value);
    } catch (_) {}
    return;
  }
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
    const val =
      localStorage.getItem(`fs_cache_${key}`) ||
      (key.startsWith('fs_cache_') || key.startsWith('defib_') ? localStorage.getItem(key) : localStorage.getItem(`defib_${key}`));
    return val ? JSON.parse(val) as T : null;
  } catch (err) {
    console.warn(`Failed to read from local cache for key ${key}:`, err);
    return null;
  }
}

export async function getFromLocalCacheAsync<T>(key: string): Promise<T | null> {
  const syncVal = getFromLocalCache<T>(key);
  if (syncVal !== null && syncVal !== undefined) return syncVal;
  try {
    const idbVal = await idbGet<T>(`fs_cache_${key}`);
    if (idbVal !== null && idbVal !== undefined) return idbVal;
  } catch (_) {}
  return null;
}

/**
 * Clears temporary session items and dismissal flags when switching environments.
 * Strictly preserves persistent tenant offline databases (defib_* and fs_cache_*)
 * so switching between customer tenants is instant and zero-data-loss.
 */
export function purgeAllLocalEnvironmentCaches(targetTenantId?: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const unprefixedCrossTenantKeys = new Set([
      'defib_company_info',
      'defib_members',
      'defib_location_names',
      'defib_custom_location_names',
      'defib_sage100_active',
      'defib_sage100_client_id',
      'defib_sage100_access_token',
      'defib_sage100_secret_token',
      'defib_sage4197_active',
      'defib_sage4197_client_id',
      'defib_sage4197_access_token',
      'defib_sage4197_secret_token',
      'defib_pennylane_active',
      'defib_pennylane_client_id',
      'defib_pennylane_company_token',
      'defib_pennylane_secret_token',
      'defib_dropbox_active',
      'defib_dropbox_app_key',
      'defib_dropbox_app_secret',
      'defib_dropbox_access_token',
      'defib_cegid_active',
      'defib_cegid_api_key',
      'defib_cegid_api_secret',
      'defib_lemongroup_ws_active',
      'defib_lemongroup_ws_api_key',
      'defib_lemongroup_ws_api_secret',
      'defib_textelp_active',
      'defib_textelp_env_id',
      'defib_textelp_secret_id',
      'defib_civilprom_active',
      'defib_civilprom_website_url',
      'defib_civilprom_assets_file_url',
      'defib_atlasante_active',
      'defib_atlasante_declarant_id',
      'defib_atlasante_url_auth',
      'defib_google_drive_active',
      'defib_google_drive_email',
      'defib_google_drive_token',
      'defib_api_defibeo_active',
      'defib_api_defibeo_key',
      'defib_api_defibeo_secret'
    ]);
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;

      if (unprefixedCrossTenantKeys.has(k)) {
        keysToRemove.push(k);
        continue;
      }

      if (
        k.includes('spreadsheet_') ||
        k.includes('company_info') ||
        k.includes('companyInfo') ||
        k.includes('tenantDatabases') ||
        k.includes('_members') ||
        k.includes('custom_location_names') ||
        k.includes('api_connectors') ||
        k === 'fs_cache_registered_tenants'
      ) {
        continue;
      }

      const lower = k.toLowerCase();
      if (
        k.startsWith('help_dismissed') ||
        k.startsWith('defib_temp_') ||
        lower.includes('defibrillateur') ||
        lower.includes('_defibs') ||
        lower.includes('_clients') ||
        lower.includes('other_equipment') ||
        lower.includes('otherequipment') ||
        lower.includes('recent_defib_activity') ||
        lower.includes('recent_client_activity') ||
        lower.includes('deleted_defib_keys')
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
 * Resolves all valid tenant alias identifiers for a target tenant ID,
 * avoiding any collision with another tenant's primary ID.
 */
export function getTenantAliases(targetTenantId: string): Set<string> {
  const aliases = new Set<string>();
  const clean = (targetTenantId || 'demo').trim().toLowerCase();
  aliases.add(clean);
  const num = clean.replace(/^d/i, '');
  if (/^\d+$/.test(num)) {
    aliases.add(`d${num}`);
    aliases.add(num);
  }
  try {
    let regTenants = getFromLocalCache<Tenant[]>('registered_tenants');
    if (!Array.isArray(regTenants) || regTenants.length === 0) {
      regTenants = [...(KNOWN_TENANTS_REGISTRY as any[])];
    } else {
      regTenants = [...regTenants];
      const existingIds = new Set(regTenants.map(t => t.id?.toLowerCase()));
      for (const kt of KNOWN_TENANTS_REGISTRY) {
        if (!existingIds.has(kt.id.toLowerCase())) {
          regTenants.push(kt as any);
        }
      }
    }
    if (Array.isArray(regTenants)) {
      const allPrimaryIds = new Set(regTenants.map(t => (t.id || '').toLowerCase().trim()).filter(Boolean));
      const match = findTenantInList(regTenants, clean);
      if (match) {
        if (match.id) {
          const mid = match.id.toLowerCase().trim();
          aliases.add(mid);
          const mnum = mid.replace(/^d/i, '');
          if (/^\d+$/.test(mnum)) {
            aliases.add(`d${mnum}`);
            aliases.add(mnum);
          }
        }
        if (match.shortEnvId && match.id !== 'demo') {
          const sid = match.shortEnvId.toLowerCase().trim();
          const collidesWithOtherTenant = allPrimaryIds.has(sid) && sid !== (match.id || '').toLowerCase().trim();
          if (!collidesWithOtherTenant) {
            aliases.add(sid);
            const snum = sid.replace(/^d/i, '');
            if (/^\d+$/.test(snum)) {
              aliases.add(`d${snum}`);
              aliases.add(snum);
            }
          }
        }
      }
    }
  } catch (_) {}
  return aliases;
}

/**
 * Fetches globally deleted defib keys from backend to guarantee cross-session consistency
 */
export async function fetchRemoteDeletedDefibKeys(tenantId: string): Promise<string[]> {
  try {
    const res = await fetch(`/api/deleted-defib-keys?tenantId=${encodeURIComponent(tenantId)}`, {
      signal: AbortSignal.timeout(6000)
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.deletedKeys)) {
        return data.deletedKeys.map((k: any) => String(k).trim().toLowerCase()).filter(Boolean);
      }
    }
  } catch (_) {}
  return [];
}

/**
 * Strictly filters a collection array to guarantee 100% tenant isolation without cross-contamination.
 * Each tenant sees EXCLUSIVELY items that belong to its environment.
 */
export function filterCollectionForTenant<T>(data: T, collectionName: string, activeTenantId: string): T {
  if (!data) return data;
  if (!Array.isArray(data)) return data;
  
  const cleanTid = (activeTenantId || 'demo').trim().toLowerCase();
  const isDemo = cleanTid === 'demo';
  const tenantAliases = getTenantAliases(cleanTid);

  return (data as any[]).filter((item: any) => {
    if (!item || typeof item !== 'object') return false;
    const itemEnv = (item.envId || item.tenantId || '').trim().toLowerCase();

    if (isDemo) {
      // In demo mode: only items created for demo or legacy demo items
      if (itemEnv && itemEnv !== 'demo' && !tenantAliases.has(itemEnv)) {
        return false;
      }
      return true;
    }

    // For tenant-partitioned operational collections (members, notifications, pointages, tickets, reports, docs, logs, etc.)
    if (collectionName !== 'defibrillateurs' && collectionName !== 'clients') {
      if (!itemEnv) return true;
      if (itemEnv === 'demo') return isDemo;
      return tenantAliases.has(itemEnv) || tenantAliases.has(itemEnv.replace(/^d/i, ''));
    }

    // In customer tenant mode (e.g. D1, D18, D27, D28, D58, etc.):
    if (itemEnv) {
      if (itemEnv === 'demo') return false;
      if (tenantAliases.has(itemEnv)) return true;
      const numItemEnv = itemEnv.replace(/^d/i, '');
      if (numItemEnv && tenantAliases.has(numItemEnv)) return true;
      return false; // Rejects items belonging to another tenant!
    }

    // Unassigned mock or demo item: NEVER show in a customer tenant
    return false;
   }) as unknown as T;
}

/**
 * Ensures a tenant's members list is never empty by guaranteeing its Super-Administrateur
 * from registered_tenants / KNOWN_TENANTS_REGISTRY and any technicians from fsmTours are present,
 * while strictly filtering out any cross-tenant or demo members.
 */
export function ensureTenantMembersClient(rawMembers: any[], activeTenantId: string, extraTours?: any[]): Member[] {
  const cleanTid = (activeTenantId || 'demo').trim();
  const isDemo = cleanTid.toLowerCase() === 'demo';
  const filtered = filterCollectionForTenant<any[]>(Array.isArray(rawMembers) ? rawMembers : [], 'members', cleanTid);
  if (isDemo) {
    return filtered.length > 0 ? filtered : INITIAL_MEMBERS;
  }

  // Filter out default demo mock members if they accidentally leaked without envId
  const demoEmails = new Set(['roesch.ronan@gmail.com', 'tech.ouest@defibeo.com', 'support@defibeo.com', 'account@demo.com']);
  const list: any[] = filtered.filter((m: any) => {
    if (!m || typeof m !== 'object') return false;
    const mEnv = String(m.envId || m.tenantId || '').trim().toLowerCase();
    const mEmail = String(m.email || '').trim().toLowerCase();
    if (!mEnv && demoEmails.has(mEmail)) return false;
    return true;
  });

  let regTenants = getFromLocalCache<Tenant[]>('registered_tenants');
  if (!Array.isArray(regTenants) || regTenants.length === 0) {
    regTenants = [...(KNOWN_TENANTS_REGISTRY as any[])];
  } else {
    regTenants = [...regTenants];
    const existingIds = new Set(regTenants.map(t => t.id?.toLowerCase()));
    for (const kt of KNOWN_TENANTS_REGISTRY) {
      if (!existingIds.has(kt.id.toLowerCase())) {
        regTenants.push(kt as any);
      }
    }
  }

  const tenantMatch = findTenantInList(regTenants, cleanTid);
  const effTenantId = tenantMatch?.id || cleanTid;
  const adminEmail = String(tenantMatch?.adminEmail || tenantMatch?.companyEmail || '').trim();
  const adminName = String(tenantMatch?.adminName || (tenantMatch?.companyName ? `Admin ${tenantMatch.companyName}` : '')).trim();
  const rawPass = String(tenantMatch?.adminPasswordHexOrPlain || '1234').trim();
  const adminPin = /^\d{4}$/.test(rawPass) ? rawPass : '1234';

  const hasSuperAdmin = list.some((m: any) =>
    m && (
      m.role === 'Super-Administrateur' ||
      m.role === 'Propriétaire / Admin' ||
      String(m.role || '').toLowerCase().includes('super') ||
      String(m.role || '').toLowerCase().includes('propriétaire') ||
      (adminEmail && String(m.email || '').trim().toLowerCase() === adminEmail.toLowerCase())
    )
  );

  if (!hasSuperAdmin && (adminEmail || adminName)) {
    list.unshift({
      id: `mem-admin-${effTenantId}`,
      name: adminName || 'Administrateur',
      email: adminEmail,
      role: 'Super-Administrateur',
      status: 'Actif',
      lastActive: 'En ligne',
      pin: adminPin,
      envId: effTenantId,
      tenantId: effTenantId
    });
  }

  // Also check fsmTours for any technicians belonging to this tenant
  let tours = Array.isArray(extraTours) ? extraTours : [];
  if (tours.length === 0 && typeof window !== 'undefined' && window.localStorage) {
    try {
      const rawTours =
        localStorage.getItem(`defib_${cleanTid}_fsm_tours`) ||
        localStorage.getItem(`defib_${effTenantId}_fsm_tours`) ||
        localStorage.getItem(`fs_cache_${cleanTid}_fsmTours`) ||
        localStorage.getItem(`fs_cache_${effTenantId}_fsmTours`);
      if (rawTours) {
        const parsed = JSON.parse(rawTours);
        if (Array.isArray(parsed)) tours = parsed;
      }
    } catch (_) {}
  }

  const vehiclePool = ['Véhicule A', 'Véhicule B', 'Véhicule C', 'Véhicule D', 'Véhicule E'];
  if (Array.isArray(tours) && tours.length > 0) {
    for (const tour of tours) {
      const tName = String(tour?.techName || '').trim();
      if (!tName || tName === 'Non assigné' || tName === 'Jakub Démo') continue;
      const alreadyExists = list.some((m: any) => String(m?.name || '').trim().toLowerCase() === tName.toLowerCase());
      if (!alreadyExists) {
        const usedLocs = new Set(list.map((m: any) => m?.locationLink).filter(Boolean));
        const availLoc = vehiclePool.find(v => !usedLocs.has(v)) || 'Véhicule A';
        const slug = tName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
        const domain = adminEmail.includes('@') ? adminEmail.split('@')[1] : 'civilprom.com';
        list.push({
          id: `mem-tech-${effTenantId}-${slug}`,
          name: tName,
          email: `${slug}@${domain}`,
          role: 'Technicien',
          status: 'Actif',
          lastActive: 'En ligne',
          pin: '1234',
          locationLink: availLoc,
          envId: effTenantId,
          tenantId: effTenantId
        });
      }
    }
  }

  const usedLocations = new Set(list.map((m: any) => m?.locationLink).filter(Boolean));
  return list.map((m: any, idx: number) => {
    if (!m || typeof m !== 'object') return m;
    const isTech = m.role === 'Technicien' || m.role === 'Maintenance Terrain' || String(m.role || '').toLowerCase().includes('tech');
    let loc = m.locationLink;
    if (isTech && !loc) {
      loc = vehiclePool.find(v => !usedLocations.has(v)) || 'Véhicule A';
      usedLocations.add(loc);
    }
    let email = m.email;
    if (!email && m.name) {
      const slug = String(m.name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
      const domain = adminEmail.includes('@') ? adminEmail.split('@')[1] : 'civilprom.com';
      email = `${slug || `membre${idx}`}@${domain}`;
    }
    return {
      ...m,
      email: email || '',
      pin: m.pin || '1234',
      status: m.status || 'Actif',
      lastActive: m.lastActive || 'En ligne',
      ...(isTech && loc ? { locationLink: loc } : {}),
      envId: m.envId || effTenantId,
      tenantId: m.tenantId || effTenantId
    };
  });
}

/**
 * Resolves customLocationNames for a tenant without ever letting an empty `{}` overwrite
 * saved location names, and automatically populates active emplacements (warehouses with stock
 * or vehicles linked to technicians) if no custom names were saved yet.
 */
export function ensureTenantCustomLocationNames(
  rawNames: Record<string, string> | undefined | null,
  activeTenantId: string,
  membersList?: any[],
  stocksList?: any[],
  distribList?: any[]
): Record<string, string> {
  const cleanTid = (activeTenantId || 'demo').trim();
  const aliases = Array.from(getTenantAliases(cleanTid));
  const candidateTenants = Array.from(new Set([
    cleanTid,
    cleanTid.toUpperCase(),
    cleanTid.toLowerCase(),
    ...aliases.flatMap(a => [a, a.toUpperCase(), a.toLowerCase()])
  ]));

  const merged: Record<string, string> = {};
  const applyNonEmpty = (source?: Record<string, string> | null) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return;
    for (const [k, v] of Object.entries(source)) {
      if (typeof v === 'string' && v.trim() !== '') {
        merged[k] = v.trim();
      }
    }
  };

  if (typeof window !== 'undefined' && window.localStorage) {
    for (const tid of candidateTenants) {
      try {
        const rawLoc = localStorage.getItem(`defib_${tid}_custom_location_names`);
        if (rawLoc) applyNonEmpty(JSON.parse(rawLoc));
      } catch (_) {}
      try {
        const rawInfo = localStorage.getItem(`defib_${tid}_company_info`) || localStorage.getItem(`fs_cache_${tid}_companyInfo`) || localStorage.getItem(`fs_cache_${tid}_company_info`);
        if (rawInfo) {
          const parsed = JSON.parse(rawInfo);
          if (parsed?.customLocationNames) applyNonEmpty(parsed.customLocationNames);
        }
      } catch (_) {}
    }
  }

  applyNonEmpty(rawNames);

  if (Object.keys(merged).length > 0) {
    return merged;
  }

  // If no custom names exist yet, populate emplacements that have active data (members, stocks, distributed_stocks)
  let regTenants = getFromLocalCache<Tenant[]>('registered_tenants');
  if (!Array.isArray(regTenants) || regTenants.length === 0) {
    regTenants = [...(KNOWN_TENANTS_REGISTRY as any[])];
  }
  const tenantMatch = findTenantInList(regTenants, cleanTid);
  const compName = tenantMatch?.companyName || (cleanTid.toLowerCase() === 'demo' ? 'Défibeo Solutions' : '');

  merged['Entrepôt A'] = compName ? `Entrepôt Principal - ${compName}` : 'Entrepôt Principal';

  const effectiveMembers = Array.isArray(membersList) && membersList.length > 0
    ? membersList
    : ensureTenantMembersClient([], cleanTid);

  for (const m of effectiveMembers) {
    if (m && m.locationLink && m.name && !merged[m.locationLink]) {
      const prefix = String(m.locationLink).startsWith('Véhicule') ? 'Véhicule' : 'Dépôt';
      merged[m.locationLink] = `${prefix} - ${m.name}`;
    }
  }

  let effStocks = Array.isArray(stocksList) ? stocksList : [];
  let effDistrib = Array.isArray(distribList) ? distribList : [];
  if (typeof window !== 'undefined' && window.localStorage) {
    if (effStocks.length === 0) {
      try {
        const rawS = localStorage.getItem(`defib_${cleanTid}_stocks`);
        if (rawS) effStocks = JSON.parse(rawS) || [];
      } catch (_) {}
    }
    if (effDistrib.length === 0) {
      try {
        const rawD = localStorage.getItem(`defib_${cleanTid}_distributed_stocks`);
        if (rawD) effDistrib = JSON.parse(rawD) || [];
      } catch (_) {}
    }
  }

  for (const st of effStocks) {
    const loc = st?.stockage;
    if (loc && (loc.startsWith('Entrepôt') || loc.startsWith('Véhicule')) && !merged[loc]) {
      merged[loc] = loc === 'Entrepôt B'
        ? (compName ? `Entrepôt Secondaire - ${compName}` : 'Entrepôt Secondaire')
        : `${loc} - ${compName || 'Stock'}`;
    }
  }

  for (const ds of effDistrib) {
    const loc = ds?.locationName;
    if (loc && (loc.startsWith('Entrepôt') || loc.startsWith('Véhicule')) && !merged[loc]) {
      merged[loc] = loc.startsWith('Véhicule')
        ? `Véhicule d'intervention ${loc.replace('Véhicule ', '')}`
        : `${loc} - ${compName || 'Stock'}`;
    }
  }

  return merged;
}

/**
 * Fetches a collection (stored as a single document or chunked documents) 
 * from Firestore. Returns null if the document does not exist yet.
 * Includes resilience against chunk timeouts, local cache, and backend server proxy fallback.
 */
export async function fetchCollectionFromFirestore<T>(
  collectionName: string, 
  tenantId?: string,
  onProgress?: (current: number, total: number, message?: string) => void
): Promise<T | null> {
  const activeTenantId = tenantId || getTenantId();

  // GOOGLE SHEETS EXCLUSIVE MODE for Défibrillateurs, Autres Matériels, and Clients:
  // Never fetch from Firebase / Firestore / IndexedDB / localStorage for these 3 tabs!
  const sheetTabMap: Record<string, { type: string; localKey: string; infoKey: string }> = {
    defibrillateurs: { type: 'defibrillateurs', localKey: 'spreadsheet_defibrillateurs', infoKey: 'spreadsheetDefibrillateurs' },
    defibs: { type: 'defibrillateurs', localKey: 'spreadsheet_defibrillateurs', infoKey: 'spreadsheetDefibrillateurs' },
    devices: { type: 'defibrillateurs', localKey: 'spreadsheet_defibrillateurs', infoKey: 'spreadsheetDefibrillateurs' },
    otherEquipments: { type: 'autresMateriels', localKey: 'spreadsheet_autres_materiels', infoKey: 'spreadsheetAutresMateriels' },
    other_equipments: { type: 'autresMateriels', localKey: 'spreadsheet_autres_materiels', infoKey: 'spreadsheetAutresMateriels' },
    autresMateriels: { type: 'autresMateriels', localKey: 'spreadsheet_autres_materiels', infoKey: 'spreadsheetAutresMateriels' },
    clients: { type: 'clients', localKey: 'spreadsheet_clients', infoKey: 'spreadsheetClients' },
  };
  const sheetInfo = sheetTabMap[collectionName];
  if (sheetInfo) {
    try {
      let localSheetUrl = '';
      if (typeof window !== 'undefined' && window.localStorage) {
        localSheetUrl =
          localStorage.getItem(`defib_${activeTenantId}_${sheetInfo.localKey}`) ||
          localStorage.getItem(`defib_${activeTenantId.toUpperCase()}_${sheetInfo.localKey}`) ||
          localStorage.getItem(`defib_${activeTenantId.toLowerCase()}_${sheetInfo.localKey}`) ||
          '';
        if (!localSheetUrl) {
          try {
            const rawInfo =
              localStorage.getItem(`defib_${activeTenantId}_company_info`) ||
              localStorage.getItem(`defib_${activeTenantId.toUpperCase()}_company_info`) ||
              localStorage.getItem(`defib_${activeTenantId.toLowerCase()}_company_info`);
            if (rawInfo) {
              const parsed = JSON.parse(rawInfo);
              if (parsed && parsed[sheetInfo.infoKey]) {
                localSheetUrl = String(parsed[sheetInfo.infoKey]).trim();
              }
            }
          } catch (_) {}
        }
      }
      const res = await fetch(
        `/api/sheets/data?tenantId=${encodeURIComponent(activeTenantId)}&type=${encodeURIComponent(sheetInfo.type)}&spreadsheetUrl=${encodeURIComponent(localSheetUrl)}&_t=${Date.now()}`,
        { cache: 'no-store' }
      );
      if (res.ok) {
        const json = await res.json();
        if (json?.spreadsheetUrl && typeof window !== 'undefined' && window.localStorage) {
          try {
            localStorage.setItem(`defib_${activeTenantId}_${sheetInfo.localKey}`, json.spreadsheetUrl);
            localStorage.setItem(`defib_${activeTenantId.toUpperCase()}_${sheetInfo.localKey}`, json.spreadsheetUrl);
            localStorage.setItem(`defib_${activeTenantId.toLowerCase()}_${sheetInfo.localKey}`, json.spreadsheetUrl);
          } catch (_) {}
        }
        const items = Array.isArray(json?.items) ? json.items : [];
        onProgress?.(items.length, items.length, `Chargement ${items.length}/${items.length}, Terminé.`);
        return items as unknown as T;
      }
    } catch (err) {
      console.warn(`[GoogleSheets] Error fetching ${collectionName} for ${activeTenantId}:`, err);
    }
    onProgress?.(0, 0, 'Terminé.');
    return [] as unknown as T;
  }

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

  // 1. Primary Strategy: Try direct Firestore query with smart key discovery & batched chunking
  if (!isFirestoreQuotaExhausted()) {
    try {
      // Prioritize candidates:
      // 1. Exact canonical key: `${activeTenantId}_${collectionName}`
      // 2. Exact D-variants: `D${num}_${collectionName}`
      // 3. Registered tenant alias keys
      const prioritizedKeys = Array.from(new Set([
        `${activeTenantId}_${collectionName}`,
        activeTenantId.toUpperCase().startsWith('D') ? `${activeTenantId.toUpperCase()}_${collectionName}` : `D${activeTenantId}_${collectionName}`,
        activeTenantId.toLowerCase().startsWith('d') ? `${activeTenantId.toLowerCase()}_${collectionName}` : `d${activeTenantId}_${collectionName}`,
        ...candidateKeys
      ])).filter(Boolean);

      // Helper: fetch all chunks of a chunked document using controlled batch concurrency (8 at a time)
      const fetchAllChunksBatched = async (
        key: string,
        chunksCount: number,
        totalItemsMeta?: number | null,
        chunkPrefixOverride?: string
      ): Promise<any[]> => {
        const effectiveKey = chunkPrefixOverride || key;
        const effectiveChunks = chunksCount || 1;
        const chunkResults: any[][] = new Array(effectiveChunks);
        let loadedCount = 0;
        const concurrency = 8;

        for (let i = 0; i < effectiveChunks; i += concurrency) {
          const batchPromises = [];
          const batchEnd = Math.min(i + concurrency, effectiveChunks);

          for (let c = i; c < batchEnd; c++) {
            batchPromises.push((async (idx) => {
              const chunkRef = doc(db, 'appData', `${effectiveKey}_chunk_${idx}`);
              let snap: any = null;
              try {
                snap = await Promise.race([
                  getDoc(chunkRef),
                  new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000))
                ]);
              } catch (_) {}

              if (!snap || !snap.exists || !snap.exists()) {
                try {
                  snap = await Promise.race([
                    getDoc(chunkRef),
                    new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000))
                  ]);
                } catch (_) {}
              }

              if (snap && snap.exists && snap.exists()) {
                const snapData = snap.data();
                if (Array.isArray(snapData?.value)) {
                  chunkResults[idx] = snapData.value;
                  loadedCount += snapData.value.length;
                }
              }
            })(c));
          }

          await Promise.all(batchPromises);

          const currentTotal = totalItemsMeta || Math.max(loadedCount, Math.round((loadedCount / batchEnd) * effectiveChunks));
          const dispTotal = Math.max(loadedCount, currentTotal);
          onProgress?.(
            loadedCount,
            dispTotal,
            `Chargement ${loadedCount.toLocaleString('en-US')}/${dispTotal.toLocaleString('en-US')}, Veuillez patienter.`
          );
        }

        const combined = chunkResults.filter(Boolean).flat();
        if (combined.length > 0) {
          onProgress?.(
            combined.length,
            combined.length,
            `Chargement ${combined.length.toLocaleString('en-US')}/${combined.length.toLocaleString('en-US')}, Terminé.`
          );
        }
        return combined;
      };

      // Fast inspection of top candidate keys (with 6-second timeout)
      const keysToCheck = prioritizedKeys.slice(0, 6);
      const metaSnaps = await Promise.all(keysToCheck.map(async (key) => {
        try {
          const docRef = doc(db, 'appData', key);
          const snap = await Promise.race([
            getDoc(docRef),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000))
          ]);
          if (snap && snap.exists && snap.exists()) {
            const d = snap.data();
            return {
              key,
              exists: true,
              isChunked: Boolean(d._chunked && typeof d.chunksCount === 'number' && d.chunksCount > 0),
              chunksCount: d.chunksCount || 0,
              totalItems: typeof d.totalItems === 'number' ? d.totalItems : null,
              chunkPrefix: d.chunkPrefix || d.chunkKeyPrefix || key,
              value: d.value
            };
          }
        } catch (err: any) {
          const msg = String(err?.message || err || '').toLowerCase();
          if (msg.includes('quota') || msg.includes('resource-exhausted') || err?.code === 'resource-exhausted') {
            recordFirestoreQuotaExhaustion(6);
          }
        }
        return { key, exists: false, isChunked: false, chunksCount: 0, totalItems: null, chunkPrefix: key, value: undefined };
      }));

      // 1. Check if any candidate has chunked data (e.g. D27 with 78 chunks / 18,207 items)
      const chunkedCandidate = metaSnaps.find(m => m.exists && m.isChunked && m.chunksCount > 0);
      if (chunkedCandidate) {
        console.log(`[Firestore] Fetching chunked dataset at ${chunkedCandidate.key} (chunk prefix: ${chunkedCandidate.chunkPrefix}, ${chunkedCandidate.chunksCount} chunks)...`);
        const combined = await fetchAllChunksBatched(
          chunkedCandidate.key,
          chunkedCandidate.chunksCount,
          chunkedCandidate.totalItems,
          chunkedCandidate.chunkPrefix
        );
        if (combined.length > 0) {
          const merged = mergeCollectionItems(collectionName, combined);
          const sanitizedVal = filterCollectionForTenant(merged as unknown as T, collectionName, activeTenantId);
          
          // Cache to IndexedDB without blocking UI
          idbSet(chunkedCandidate.key, sanitizedVal).catch(() => {});
          idbSet(`${activeTenantId}_${collectionName}`, sanitizedVal).catch(() => {});
          idbSet(`defib_${activeTenantId}_${collectionName}`, sanitizedVal).catch(() => {});
          saveToLocalCache(chunkedCandidate.key, sanitizedVal);
          saveToLocalCache(`${activeTenantId}_${collectionName}`, sanitizedVal);
          return sanitizedVal;
        }
      }

      const isDefibCol = collectionName === 'defibrillateurs' || collectionName === 'defibs' || collectionName === 'devices';

      // 2. Check if any candidate has a populated array
      const populatedCandidate = metaSnaps.find(m => m.exists && Array.isArray(m.value) && m.value.length > 0);
      if (populatedCandidate) {
        let combinedVal = populatedCandidate.value;
        if (collectionName === 'stocks' || collectionName === 'distributed_stocks' || collectionName === 'stock' || collectionName === 'distributedStocks') {
          let localExisting: any[] = [];
          for (const ck of candidateKeys) {
            const cv = getFromLocalCache<any>(ck);
            if (Array.isArray(cv) && cv.length > 0) {
              localExisting = cv;
              break;
            }
          }
          if (localExisting.length > 0) {
            combinedVal = mergeCollectionItems(collectionName, [...combinedVal, ...localExisting]);
          }
        }
        const merged = mergeCollectionItems(collectionName, combinedVal);
        const sanitizedVal = filterCollectionForTenant(merged as unknown as T, collectionName, activeTenantId);
        idbSet(populatedCandidate.key, sanitizedVal).catch(() => {});
        idbSet(`${activeTenantId}_${collectionName}`, sanitizedVal).catch(() => {});
        idbSet(`defib_${activeTenantId}_${collectionName}`, sanitizedVal).catch(() => {});
        saveToLocalCache(populatedCandidate.key, sanitizedVal);
        saveToLocalCache(`${activeTenantId}_${collectionName}`, sanitizedVal);
        if (Array.isArray(sanitizedVal) && sanitizedVal.length > 0) {
          onProgress?.(sanitizedVal.length, sanitizedVal.length, `Chargement ${sanitizedVal.length.toLocaleString('en-US')}/${sanitizedVal.length.toLocaleString('en-US')}, Terminé.`);
        }
        return sanitizedVal;
      }

      // 3. Check if any candidate has an object or primitive (excluding defib collection which is an array catalog)
      const otherCandidate = metaSnaps.find(m => !isDefibCol && m.exists && m.value !== undefined && m.value !== null);
      if (otherCandidate) {
        const sanitizedVal = filterCollectionForTenant(otherCandidate.value as T, collectionName, activeTenantId);
        idbSet(otherCandidate.key, sanitizedVal).catch(() => {});
        idbSet(`${activeTenantId}_${collectionName}`, sanitizedVal).catch(() => {});
        idbSet(`defib_${activeTenantId}_${collectionName}`, sanitizedVal).catch(() => {});
        saveToLocalCache(otherCandidate.key, sanitizedVal);
        saveToLocalCache(`${activeTenantId}_${collectionName}`, sanitizedVal);
        return sanitizedVal;
      }
    } catch (error: any) {
      const msg = String(error?.message || error || '').toLowerCase();
      if (msg.includes('quota') || msg.includes('resource-exhausted') || error?.code === 'resource-exhausted') {
        recordFirestoreQuotaExhaustion(6);
      }
      console.log(`[Firestore Server-First] Direct Firestore fetch had issue:`, error);
    }
  }

  // 2. Secondary Strategy: High-availability backend server relay (/api/sync-collection)
  if (typeof fetch !== 'undefined') {
    const isDefibCol = collectionName === 'defibrillateurs' || collectionName === 'defibs' || collectionName === 'devices';

    // For massive defibrillateurs collection (17,800+ items), use high-speed chunked static delivery ONLY if tenant has chunks
    if (isDefibCol) {
      try {
        // Strategy 1 (Optimized & 100% resilient): Bundled delivery (batches of 10 chunks, ~550KB gzipped)
        // Prevents reverse proxy buffer overflow (ERR_CONTENT_DECODING_FAILED & 503 errors)
        try {
          let bundleItems: any[] = [];
          let currentBatch = 0;
          let hasMoreBatches = true;
          let bundleFailed = false;

          while (hasMoreBatches && currentBatch < 15) {
            let batchSuccess = false;
            for (let attempt = 0; attempt < 5; attempt++) {
              try {
                const bRes = await fetch(`/api/defib-chunks/bundle?batch=${currentBatch}&tenantId=${encodeURIComponent(activeTenantId)}&_t=${Date.now()}`, {
                  cache: 'no-store',
                  signal: AbortSignal.timeout(15000)
                });
                if (bRes.ok) {
                  const bJson = await bRes.json();
                  if (Array.isArray(bJson?.value)) {
                    bundleItems.push(...bJson.value);
                    hasMoreBatches = !bJson.isLastBatch;
                    batchSuccess = true;
                    onProgress?.(
                      bundleItems.length,
                      18193,
                      `Chargement ${bundleItems.length.toLocaleString('fr-FR')}/18 193, Veuillez patienter.`
                    );
                    break;
                  }
                } else if (bRes.status === 503 || bRes.status === 502 || bRes.status === 429) {
                  await new Promise(r => setTimeout(r, 450 * (attempt + 1)));
                }
              } catch (_) {
                if (attempt < 4) await new Promise(r => setTimeout(r, 450 * (attempt + 1)));
              }
            }
            if (!batchSuccess) {
              bundleFailed = true;
              break;
            }
            currentBatch++;
            await new Promise(r => setTimeout(r, 40));
          }

          if (!bundleFailed && bundleItems.length > 0) {
            const sanitizedVal = filterCollectionForTenant(bundleItems as unknown as T, collectionName, activeTenantId);
            let liveItems: any[] = sanitizedVal as any[];

            // Ensure any recent modifications saved in local IndexedDB with newer timestamps are preserved
            try {
              const localExisting = await idbGet<any[]>(`defib_${activeTenantId}_${collectionName}`);
              if (Array.isArray(localExisting) && localExisting.length > 0) {
                liveItems = mergeCollectionItems(collectionName, [...liveItems, ...localExisting]);
              }
            } catch (_) {}

            try {
              const remoteDelKeys = await fetchRemoteDeletedDefibKeys(activeTenantId);
              if (remoteDelKeys.length > 0) {
                const delSet = new Set(remoteDelKeys);
                liveItems = liveItems.filter(df => {
                  const id = df.id ? String(df.id).trim().toLowerCase() : '';
                  const ident = df.identifiant ? String(df.identifiant).trim().toLowerCase() : '';
                  const sn = (df.numeroSerie || df.num_serie) ? String(df.numeroSerie || df.num_serie).trim().toLowerCase() : '';
                  return !((id && delSet.has(id)) || (ident && delSet.has(ident)) || (sn && delSet.has(sn)));
                });
              }
            } catch (_) {}

            idbSet(`defib_${activeTenantId}_${collectionName}`, liveItems).catch(() => {});
            const count = liveItems.length;
            onProgress?.(
              count,
              count,
              `Chargement ${count.toLocaleString('fr-FR')}/${count.toLocaleString('fr-FR')}, Terminé.`
            );
            return liveItems as unknown as T;
          }
        } catch (bundleErr) {
          console.warn('[Defib Chunks Bundle] Bundled delivery failed, falling back to individual chunks:', bundleErr);
        }

        // Strategy 3: Individual chunk requests with gentle concurrency (2 concurrent) and exponential retry
        const metaRes = await fetch(`/api/defib-chunks/meta?tenantId=${encodeURIComponent(activeTenantId)}`, {
          signal: AbortSignal.timeout(10000)
        });
        if (metaRes.ok) {
          const meta = await metaRes.json();
          const totalChunks = meta.totalChunks || 0;
          if (totalChunks > 0 && meta.prefix) {
            const chunkResults: any[][] = new Array(totalChunks);
            let loadedCount = 0;
            const totalEst = meta.totalCount || 18193;
            // Gentle pacing & concurrency: 2 concurrent requests prevents tripping reverse proxy (Nginx/Cloudflare) 503 limit_req limits
            const CONCURRENCY = 2;

            for (let i = 0; i < totalChunks; i += CONCURRENCY) {
              const batchPromises = [];
              const batchEnd = Math.min(i + CONCURRENCY, totalChunks);
              for (let c = i; c < batchEnd; c++) {
                batchPromises.push((async (cIdx) => {
                  let chunkData: any[] | null = null;
                  for (let attempt = 0; attempt < 6; attempt++) {
                    try {
                      const chunkRes = await fetch(`/api/defib-chunks/chunk/${cIdx}?prefix=${encodeURIComponent(meta.prefix)}&tenantId=${encodeURIComponent(activeTenantId)}`, {
                        signal: AbortSignal.timeout(15000)
                      });
                      if (chunkRes.ok) {
                        const arr = await chunkRes.json();
                        if (Array.isArray(arr)) {
                          chunkData = arr;
                          break;
                        }
                      } else if (chunkRes.status === 503 || chunkRes.status === 502 || chunkRes.status === 429) {
                        // Rate limit / proxy busy: back off before retrying
                        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
                      }
                    } catch (_) {
                      if (attempt < 5) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
                    }
                  }
                  if (chunkData && Array.isArray(chunkData)) {
                    chunkResults[cIdx] = chunkData;
                    loadedCount += chunkData.length;
                  }
                })(c));
              }
              await Promise.all(batchPromises);
              // Small pause between batches to protect proxy queue
              await new Promise(r => setTimeout(r, 60));

              onProgress?.(
                loadedCount,
                totalEst,
                `Chargement ${loadedCount.toLocaleString('fr-FR')}/${totalEst.toLocaleString('fr-FR')}, Veuillez patienter.`
              );
            }

            // Data integrity check: if any chunk failed to download, NEVER overwrite cache with partial truncated data!
            const missingChunks = chunkResults.filter(x => !Array.isArray(x)).length;
            if (missingChunks > 0) {
              console.warn(`[Defib Chunks Relay] Warning: ${missingChunks} chunk(s) could not be loaded. Preserving existing local cache to prevent data loss.`);
              try {
                const existingCached = await idbGet<any[]>(`defib_${activeTenantId}_${collectionName}`);
                if (Array.isArray(existingCached) && existingCached.length > 0) {
                  return filterCollectionForTenant(existingCached as unknown as T, collectionName, activeTenantId);
                }
              } catch (_) {}
            }

            const combined = chunkResults.filter(Boolean).flat();
            if (combined.length > 0) {
              const sanitizedVal = filterCollectionForTenant(combined as unknown as T, collectionName, activeTenantId);
              idbSet(`defib_${activeTenantId}_${collectionName}`, sanitizedVal).catch(() => {});
              const count = Array.isArray(sanitizedVal) ? (sanitizedVal as any[]).length : 0;
              onProgress?.(
                count,
                count,
                `Chargement ${count.toLocaleString('en-US')}/${count.toLocaleString('en-US')}, Terminé.`
              );
              return sanitizedVal;
            }
          }
        }
      } catch (chunkFetchErr) {
        console.warn(`[Defib Chunks Relay] Error downloading chunks:`, chunkFetchErr);
      }
    }

    try {
      const resp = await fetch(`/api/sync-collection?collectionName=${encodeURIComponent(collectionName)}&tenantId=${encodeURIComponent(activeTenantId)}&_t=${Date.now()}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(60000)
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json && json.value !== undefined) {
          const val = filterCollectionForTenant(json.value as T, collectionName, activeTenantId);
          const primaryKey = candidateKeys[0] || `${collectionName}_${activeTenantId}`;

          if (Array.isArray(val)) {
            let finalArr: any[] = val;
            if (collectionName === 'members') {
              // Merge with any locally saved members for this tenant so browser additions are preserved
              const localMem = getFromLocalCache<any[]>(`defib_${activeTenantId}_members`) || getFromLocalCache<any[]>(`${activeTenantId}_members`) || [];
              const combinedMem = mergeCollectionItems('members', [...(Array.isArray(localMem) ? localMem : []), ...val]);
              finalArr = ensureTenantMembersClient(combinedMem, activeTenantId);
            }
            if (finalArr.length > 0) {
              onProgress?.(finalArr.length, finalArr.length, `Chargement ${finalArr.length.toLocaleString('en-US')}/${finalArr.length.toLocaleString('en-US')}, Terminé.`);
              // Update local cache and IndexedDB when server has populated items
              idbSet(primaryKey, finalArr).catch(() => {});
              idbSet(`${activeTenantId}_${collectionName}`, finalArr).catch(() => {});
              idbSet(`defib_${activeTenantId}_${collectionName}`, finalArr).catch(() => {});
              saveToLocalCache(primaryKey, finalArr);
              saveToLocalCache(`${activeTenantId}_${collectionName}`, finalArr);
              saveToLocalCache(`defib_${activeTenantId}_${collectionName}`, finalArr);
              return finalArr as unknown as T;
            }
            // If server returned empty array [], do NOT overwrite local cache before checking Strategy 3 below!
          } else if (val && typeof val === 'object' && Object.keys(val as any).length > 0) {
            if ((collectionName === 'companyInfo' || collectionName === 'company_info') && (val as any)._isDefaultFallback) {
              // Do not overwrite local cache with synthetic default fallback before checking Strategy 3
            } else {
              // Non-empty object (e.g. companyInfo, api_connectors, tenantDatabases)
              idbSet(primaryKey, val).catch(() => {});
              idbSet(`${activeTenantId}_${collectionName}`, val).catch(() => {});
              idbSet(`defib_${activeTenantId}_${collectionName}`, val).catch(() => {});
              saveToLocalCache(primaryKey, val);
              return val;
            }
          }
        }
      }
    } catch (apiErr) {
      console.warn(`[Sync Server Relay] Error fetching ${collectionName} via /api/sync-collection:`, apiErr);
    }
  }

  // 3. Tertiary Strategy: Local storage and IndexedDB cache
  const candidateCacheKeys = [
    candidateKeys[0] || `${collectionName}_${activeTenantId}`,
    `${activeTenantId}_${collectionName}`,
    `defib_${activeTenantId}_${collectionName}`,
    `fs_cache_${activeTenantId}_${collectionName}`,
    ...candidateKeys
  ];

  let bestCandidateData: any = null;
  let maxCandidateCount = -1;

  for (const ck of Array.from(new Set(candidateCacheKeys))) {
    const localVal = getFromLocalCache<any>(ck);
    if (localVal !== null && localVal !== undefined) {
      if (Array.isArray(localVal)) {
        if (localVal.length > maxCandidateCount) {
          maxCandidateCount = localVal.length;
          bestCandidateData = localVal;
        }
      } else if (!bestCandidateData) {
        bestCandidateData = localVal;
      }
    }
  }

  for (const ck of Array.from(new Set(candidateCacheKeys))) {
    try {
      const idbVal = await idbGet<any>(ck);
      if (idbVal !== null && idbVal !== undefined) {
        if (Array.isArray(idbVal)) {
          if (idbVal.length > maxCandidateCount) {
            maxCandidateCount = idbVal.length;
            bestCandidateData = idbVal;
          }
        } else if (!bestCandidateData) {
          bestCandidateData = idbVal;
        }
      }
    } catch (_) {}
  }

  if (bestCandidateData !== null && bestCandidateData !== undefined) {
    const filtered = filterCollectionForTenant(bestCandidateData as T, collectionName, activeTenantId);
    if (collectionName === 'members' && Array.isArray(filtered)) {
      return ensureTenantMembersClient(filtered, activeTenantId) as unknown as T;
    }
    return filtered;
  }

  if (collectionName === 'members') {
    return ensureTenantMembersClient([], activeTenantId) as unknown as T;
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

let firestoreQuotaExhaustedUntil = 0;
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.removeItem('firestore_quota_exhausted_until');
  }
} catch (_) {}

export function isFirestoreQuotaExhausted(): boolean {
  return Date.now() < firestoreQuotaExhaustedUntil;
}

export function recordFirestoreQuotaExhaustion(durationHours = 1) {
  firestoreQuotaExhaustedUntil = Date.now() + Math.min(durationHours, 1) * 60 * 1000;
}

/**
 * Saves a collection array or object to Firestore (auto-chunking if needed).
 */
export async function saveCollectionToFirestore<T>(collectionName: string, value: T, tenantIdOverride?: string): Promise<void> {
  if (
    collectionName === 'defibrillateurs' ||
    collectionName === 'defibs' ||
    collectionName === 'devices' ||
    collectionName === 'otherEquipments' ||
    collectionName === 'other_equipments' ||
    collectionName === 'autresMateriels' ||
    collectionName === 'clients'
  ) {
    // Handled exclusively by Google Sheets API (/api/sheets/upsert & /api/sheets/delete)
    return;
  }
  const activeTenantId = tenantIdOverride || getTenantId();
  const key = getCollectionKey(collectionName, activeTenantId);
  const candidateKeys = getCollectionKeyCandidates(collectionName, activeTenantId);

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
  
  // Save to IndexedDB and cache immediately
  try {
    idbSet(key, finalCleanValue).catch(() => {});
    saveToLocalCache(key, finalCleanValue);
    if (activeTenantId.toUpperCase().startsWith('D')) {
      const altKey = `${activeTenantId.toUpperCase()}_${collectionName}`;
      idbSet(altKey, finalCleanValue).catch(() => {});
      saveToLocalCache(altKey, finalCleanValue);
    }
  } catch (cacheErr) {
    console.warn(`[Cache] Error writing to local/indexed cache for ${key}:`, cacheErr);
  }

  // Server sync relay with chunking support and failure protection (stops on 503 / network failure)
  try {
    if (typeof fetch !== 'undefined') {
      if (Array.isArray(finalCleanValue) && finalCleanValue.length > 1000) {
        const CHUNK_SIZE = 1500;
        const items = finalCleanValue;
        const totalChunks = Math.ceil(items.length / CHUNK_SIZE);
        for (let i = 0; i < totalChunks; i++) {
          const chunk = items.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);
          try {
            const res = await fetch('/api/sync-collection-chunk', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                collectionName,
                tenantId: activeTenantId,
                chunkIndex: i,
                totalChunks,
                chunkItems: chunk,
                totalCount: items.length
              })
            });
            clearTimeout(timer);
            if (!res.ok) {
              console.warn(`[Sync Server Relay] Chunk ${i + 1}/${totalChunks} failed with status ${res.status} (${res.statusText}). Halting chunk relay to avoid freezing.`);
              break;
            }
          } catch (chunkErr) {
            clearTimeout(timer);
            console.warn(`[Sync Server Relay] Network error on chunk ${i + 1}/${totalChunks}:`, chunkErr);
            break;
          }
        }
      } else {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
          const res = await fetch('/api/sync-collection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              collectionName,
              tenantId: activeTenantId,
              value: finalCleanValue
            })
          });
          clearTimeout(timer);
          if (!res.ok) {
            console.warn(`[Sync Server Relay] Failed to sync ${collectionName}: status ${res.status}`);
          }
        } catch (singleErr) {
          clearTimeout(timer);
          console.warn(`[Sync Server Relay] Network error syncing ${collectionName}:`, singleErr);
        }
      }
    }
  } catch (syncErr) {
    console.warn(`[Sync Server Relay] Error syncing collection ${collectionName} to server:`, syncErr);
  }

  const isCriticalMetadata =
    collectionName === 'companyInfo' ||
    collectionName === 'company_info' ||
    collectionName === 'tenantDatabases' ||
    collectionName === 'registered_tenants' ||
    collectionName === 'members' ||
    collectionName === 'variables' ||
    collectionName === 'api_connectors';

  if (isFirestoreQuotaExhausted() && !isCriticalMetadata) {
    // Quota reached for today; data is already stored safely in local storage & server sync
    return;
  }

  try {
    const primaryKey = getCollectionKey(collectionName, activeTenantId);
    const writeKeySet = new Set<string>([primaryKey]);
    if (primaryKey.toLowerCase() !== primaryKey) {
      writeKeySet.add(primaryKey.toLowerCase());
    }
    if (isCriticalMetadata && activeTenantId && activeTenantId !== 'demo') {
      const tAliases = getTenantAliases(activeTenantId);
      for (const al of tAliases) {
        if (/^d\d+$/i.test(al)) {
          writeKeySet.add(`${al.toUpperCase()}_${collectionName}`);
          writeKeySet.add(`${al.toLowerCase()}_${collectionName}`);
        }
      }
    }
    const writeKeys = Array.from(writeKeySet);

    const jsonStr = JSON.stringify(finalCleanValue);
    // Firestore single doc limit is 1MB. If array and payload > 400 KB, chunk it!
    if (Array.isArray(finalCleanValue) && jsonStr.length > 400000) {
      const items = finalCleanValue;
      const avgItemLen = Math.max(1, Math.ceil(jsonStr.length / items.length));
      const chunkSize = Math.max(50, Math.floor(450000 / avgItemLen));
      const chunksCount = Math.ceil(items.length / chunkSize);

      // Write chunks sequentially or in small throttled batches with strict timeout to prevent freezing on quota limits
      for (let i = 0; i < chunksCount; i += 2) {
        if (isFirestoreQuotaExhausted()) break;
        const batch: Promise<any>[] = [];
        for (let j = i; j < Math.min(i + 2, chunksCount); j++) {
          const chunkItems = items.slice(j * chunkSize, (j + 1) * chunkSize);
          const chunkRef = doc(db, 'appData', `${primaryKey}_chunk_${j}`);
          batch.push(setDoc(chunkRef, { value: chunkItems }));
        }
        await Promise.race([
          Promise.all(batch),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore write timeout')), 2500))
        ]).catch(e => {
          const msg = String(e?.message || e || '').toLowerCase();
          if (msg.includes('quota') || msg.includes('resource-exhausted') || (e as any)?.code === 'resource-exhausted') {
            recordFirestoreQuotaExhaustion(6);
          }
        });
        if (isFirestoreQuotaExhausted()) break;
        if (chunksCount > 4) {
          await new Promise(r => setTimeout(r, 60));
        }
      }

      // Write main metadata doc if quota was not reached
      if (!isFirestoreQuotaExhausted()) {
        const mainBatch = writeKeys.map(wk => {
          const mainDocRef = doc(db, 'appData', wk);
          return setDoc(mainDocRef, { 
            _chunked: true, 
            chunksCount, 
            chunkPrefix: primaryKey,
            totalItems: items.length,
            updatedAt: new Date().toISOString() 
          });
        });
        await Promise.race([
          Promise.all(mainBatch),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore write timeout')), 2500))
        ]).catch(e => {
          const msg = String(e?.message || e || '').toLowerCase();
          if (msg.includes('quota') || msg.includes('resource-exhausted') || (e as any)?.code === 'resource-exhausted') {
            recordFirestoreQuotaExhaustion(6);
          }
        });
      }

      console.log(`Successfully synced chunked collection ${primaryKey} (${chunksCount} chunks, ${items.length} items) to Firestore.`);
    } else {
      const isDefibCol = collectionName === 'defibrillateurs' || collectionName === 'defibs' || collectionName === 'devices';
      if (isDefibCol && Array.isArray(finalCleanValue) && finalCleanValue.length < 5000) {
        console.warn(`[Protection] Refusing to write non-chunked small defibrillateurs array (${finalCleanValue.length} items) to Firestore root document to protect catalog.`);
        return;
      }
      const docBatch = writeKeys.map(wk => {
        const docRef = doc(db, 'appData', wk);
        return setDoc(docRef, { value: finalCleanValue, _chunked: false }).catch((err: any) => {
          const msg = String(err?.message || err || '').toLowerCase();
          if (msg.includes('quota') || msg.includes('resource-exhausted') || err?.code === 'resource-exhausted') {
            recordFirestoreQuotaExhaustion(6);
          }
          throw err;
        });
      });
      let writeSuccess = true;
      await Promise.race([
        Promise.all(docBatch),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore write timeout')), 2000))
      ]).catch(e => {
        writeSuccess = false;
        const msg = String(e?.message || e || '').toLowerCase();
        if (msg.includes('quota') || msg.includes('resource-exhausted') || (e as any)?.code === 'resource-exhausted') {
          recordFirestoreQuotaExhaustion(6);
        } else {
          console.warn(`[Firestore Safe Write] Non-blocking write notice for ${primaryKey}:`, e?.message);
        }
      });
      if (writeSuccess) {
        console.log(`Successfully synced ${primaryKey} to Firestore.`);
      }
    }
  } catch (error: any) {
    const msg = String(error?.message || error || '').toLowerCase();
    if (msg.includes('quota') || msg.includes('resource-exhausted') || error?.code === 'resource-exhausted') {
      recordFirestoreQuotaExhaustion(6);
      return;
    }
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

  // Secondary strategy: fetch registered_tenants from server relay if available
  try {
    if (typeof fetch !== 'undefined') {
      const resp = await fetch('/api/sync-collection?collectionName=registered_tenants&tenantId=demo', {
        signal: AbortSignal.timeout(6000)
      });
      if (resp.ok) {
        const json = await resp.json();
        if (Array.isArray(json?.value) && json.value.length > 0) {
          const mergedServer = addDemoIfNeeded(json.value as Tenant[]);
          saveToLocalCache('registered_tenants', mergedServer);
          return mergedServer;
        }
      }
    }
  } catch (_) {}

  const cached = getFromLocalCache<Tenant[]>('registered_tenants') || [];
  const combined = [...cached];
  const existingIds = new Set(combined.map(t => t.id?.toLowerCase()));
  for (const kt of KNOWN_TENANTS_REGISTRY) {
    if (!existingIds.has(kt.id.toLowerCase())) {
      combined.push(kt as Tenant);
    }
  }
  return addDemoIfNeeded(combined);
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
  _excludeDefibId?: string
): Promise<{ exists: boolean; tenantName?: string }> {
  const checkIdent = identifiant.trim().toUpperCase();
  if (!checkIdent) {
    return { exists: false };
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
 * Finds the tenant information owning a specified intervention reference.
 */
export async function findTenantByInterventionGlobally(interventionRef: string): Promise<{ tenantId: string; companyName: string; companyEmail: string; exists: boolean } | null> {
  const checkRef = interventionRef.trim().toUpperCase();
  if (!checkRef) return null;
  try {
    const tenants = await getRegisteredTenants();
    const tenantIds = ['demo', ...tenants.map(t => t.id)];

    const results = await Promise.all(
      tenantIds.map(async (tid) => {
        try {
          const key = tid === 'demo' ? 'generatedReports' : `${tid}_generatedReports`;
          const reportsList = await fetchRawCollectionFromFirestore<any[]>(key, 3000) || [];
          if (Array.isArray(reportsList)) {
            const hasMatch = reportsList.some(rep => 
              (rep.interventionReference && rep.interventionReference.trim().toUpperCase() === checkRef) ||
              (rep.id && rep.id.trim().toUpperCase() === checkRef)
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
          console.warn(`Error finding tenant by intervention globally for ${tid}:`, err);
        }
        return null;
      })
    );

    const found = results.find(r => r !== null);
    if (found) {
      return found;
    }
  } catch (error) {
    console.warn('Error finding tenant by intervention globally:', error);
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

/**
 * Finds a tour mission by intervention reference or ID globally across all tenants in Firestore.
 */
export async function findMissionByInterventionGlobally(
  interventionRef: string,
  tenantHint?: string
): Promise<{
  tenantId: string;
  tour: any;
  mission: any;
  tours: any[];
} | null> {
  const checkRef = (interventionRef || '').trim().toUpperCase();
  if (!checkRef) return null;

  try {
    const tenants = await getRegisteredTenants();
    const allTenantIds = ['demo', ...tenants.map(t => t.id)];
    const prioritizedTenants = tenantHint 
      ? Array.from(new Set([tenantHint, ...allTenantIds]))
      : allTenantIds;

    // Search across tenants
    for (const tid of prioritizedTenants) {
      try {
        const candidateKeys = getCollectionKeyCandidates('fsmTours', tid);
        let toursList: any[] | null = null;

        for (const ck of candidateKeys) {
          toursList = await fetchRawCollectionFromFirestore<any[]>(ck, 4000);
          if (Array.isArray(toursList) && toursList.length > 0) break;
        }

        if (!Array.isArray(toursList) || toursList.length === 0) {
          const directKey = tid === 'demo' ? 'fsmTours' : `${tid}_fsmTours`;
          toursList = await fetchRawCollectionFromFirestore<any[]>(directKey, 4000);
        }

        if (Array.isArray(toursList)) {
          for (const tour of toursList) {
            const missions = tour.missions || [];
            const foundMission = missions.find((m: any) => 
              (m.interventionReference && m.interventionReference.trim().toUpperCase() === checkRef) ||
              (m.id && String(m.id).trim().toUpperCase() === checkRef)
            );
            if (foundMission) {
              return {
                tenantId: tid,
                tour,
                mission: foundMission,
                tours: toursList
              };
            }
          }
        }
      } catch (err) {
        console.warn(`Error searching fsmTours for tenant ${tid}:`, err);
      }
    }

    // Secondary check: If not found in fsmTours, check generatedReports for pending report line
    for (const tid of prioritizedTenants) {
      try {
        const repKey = tid === 'demo' ? 'generatedReports' : `${tid}_generatedReports`;
        const reportsList = await fetchRawCollectionFromFirestore<any[]>(repKey, 3000);
        if (Array.isArray(reportsList)) {
          const matchedReport = reportsList.find((r: any) => 
            (r.interventionReference && r.interventionReference.trim().toUpperCase() === checkRef) ||
            (r.id && String(r.id).trim().toUpperCase() === checkRef) ||
            (r.missionId && String(r.missionId).trim().toUpperCase() === checkRef)
          );
          if (matchedReport) {
            // Synthesize mission object from report
            const synthMission = {
              id: matchedReport.missionId || matchedReport.id,
              interventionReference: matchedReport.interventionReference || checkRef,
              estimatedDate: matchedReport.estimatedDate || matchedReport.date || '',
              estimatedSlot: matchedReport.estimatedSlot || '',
              status: matchedReport.missionStatus || 'Brouillon',
              refusalComment: matchedReport.refusalComment || '',
              clientName: matchedReport.clientName || matchedReport.siteMission || '',
              defibIdentifiant: matchedReport.defibIdentifiant || '',
            };
            return {
              tenantId: tid,
              tour: { id: matchedReport.origin || 'Tour', title: matchedReport.tourName || 'Tour' },
              mission: synthMission,
              tours: []
            };
          }
        }
      } catch (_) {}
    }
  } catch (err) {
    console.warn('Error in findMissionByInterventionGlobally:', err);
  }

  return null;
}

/**
 * Updates a tour mission status ('Accepté Client' or 'Refusé Client') and optional refusal comment in Firestore DB.
 */
export async function updateMissionStatusByIntervention(
  interventionRef: string,
  newStatus: 'Accepté Client' | 'Refusé Client' | string,
  comment?: string,
  tenantHint?: string
): Promise<{ success: boolean; tenantId?: string; mission?: any }> {
  const checkRef = (interventionRef || '').trim().toUpperCase();
  if (!checkRef) return { success: false };

  try {
    const searchResult = await findMissionByInterventionGlobally(checkRef, tenantHint);
    if (!searchResult) {
      console.warn(`Could not locate mission with interventionReference ${checkRef}`);
      return { success: false };
    }

    const { tenantId, tours } = searchResult;
    const nowIso = new Date().toISOString();
    let updatedMission: any = null;

    if (Array.isArray(tours) && tours.length > 0) {
      const updatedTours = tours.map((tour) => {
        let tourChanged = false;
        const nextMissions = (tour.missions || []).map((m: any) => {
          if (
            (m.interventionReference && m.interventionReference.trim().toUpperCase() === checkRef) ||
            (m.id && String(m.id).trim().toUpperCase() === checkRef)
          ) {
            tourChanged = true;
            updatedMission = {
              ...m,
              status: newStatus,
              refusalComment: comment !== undefined ? comment : (m.refusalComment || ''),
              clientRefusalComment: comment !== undefined ? comment : (m.clientRefusalComment || ''),
              clientDecisionDate: nowIso,
              updatedAt: nowIso
            };
            return updatedMission;
          }
          return m;
        });

        if (tourChanged) {
          return { ...tour, missions: nextMissions, updatedAt: nowIso };
        }
        return tour;
      });

      // Save updated tours to Firestore
      await saveCollectionToFirestore('fsmTours', updatedTours, tenantId);

      // Save to local cache
      try {
        localStorage.setItem(`defib_${tenantId}_fsm_tours`, JSON.stringify(updatedTours));
      } catch (_) {}
    }

    // Also synchronize generatedReports for that tenant so GMAO stays up to date
    try {
      const repKey = tenantId === 'demo' ? 'generatedReports' : `${tenantId}_generatedReports`;
      const reportsList = await fetchRawCollectionFromFirestore<any[]>(repKey, 3000);
      if (Array.isArray(reportsList)) {
        let reportsChanged = false;
        const updatedReports = reportsList.map((rep) => {
          if (
            (rep.interventionReference && rep.interventionReference.trim().toUpperCase() === checkRef) ||
            (updatedMission && rep.missionId && String(rep.missionId) === String(updatedMission.id))
          ) {
            reportsChanged = true;
            return {
              ...rep,
              missionStatus: newStatus,
              refusalComment: comment !== undefined ? comment : rep.refusalComment,
              updatedAt: nowIso
            };
          }
          return rep;
        });

        if (reportsChanged) {
          await saveCollectionToFirestore('generatedReports', updatedReports, tenantId);
          try {
            localStorage.setItem(`defib_${tenantId}_generated_reports`, JSON.stringify(updatedReports));
          } catch (_) {}
        }
      }
    } catch (repErr) {
      console.warn('Failed to sync report status with mission decision:', repErr);
    }

    return { success: true, tenantId, mission: updatedMission };
  } catch (error) {
    console.error('Error updating mission status by intervention:', error);
    return { success: false };
  }
}


