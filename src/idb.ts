/**
 * Robust IndexedDB client-side cache for large datasets (exceeding localStorage 5MB quota)
 * Includes in-memory fallback cache for environments where IndexedDB is blocked or restricted (Edge Tracking Prevention, private mode, iframe policies).
 */
const DB_NAME = 'DefibeoStoreDB';
const DB_VERSION = 1;
const STORE_NAME = 'collections';

let dbInstance: IDBDatabase | null = null;
const inMemoryStore = new Map<string, any>();

function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported in this environment'));
    }

    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        } catch (upgradeErr) {
          console.warn('[IndexedDB] Upgrade error:', upgradeErr);
        }
      };

      req.onsuccess = () => {
        dbInstance = req.result;
        dbInstance.onversionchange = () => {
          dbInstance?.close();
          dbInstance = null;
        };
        resolve(dbInstance);
      };

      req.onerror = () => {
        reject(req.error || new Error('Failed to open IndexedDB'));
      };
    } catch (openErr) {
      reject(openErr);
    }
  });
}

export async function idbSet<T>(key: string, value: T): Promise<void> {
  // Always update in-memory cache first for instant synchronous cross-browser access
  inMemoryStore.set(key, value);

  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (txErr) {
        reject(txErr);
      }
    });
  } catch (err) {
    // Non-blocking: memory cache already has it
    console.warn(`[IndexedDB] Error setting key ${key} (fallback to memory):`, err);
  }
}

export async function idbGet<T>(key: string): Promise<T | null> {
  // 1. If available in memory cache, return immediately
  if (inMemoryStore.has(key)) {
    const memVal = inMemoryStore.get(key);
    if (memVal !== undefined) {
      return memVal as T;
    }
  }

  // 2. Try IndexedDB
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => {
          const res = req.result !== undefined ? (req.result as T) : null;
          if (res !== null) {
            inMemoryStore.set(key, res);
          }
          resolve(res);
        };
        req.onerror = () => {
          reject(req.error);
        };
      } catch (txErr) {
        reject(txErr);
      }
    });
  } catch (err) {
    console.warn(`[IndexedDB] Error getting key ${key}:`, err);
    return inMemoryStore.get(key) || null;
  }
}

export async function idbDelete(key: string): Promise<void> {
  inMemoryStore.delete(key);

  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (txErr) {
        reject(txErr);
      }
    });
  } catch (err) {
    console.warn(`[IndexedDB] Error deleting key ${key}:`, err);
  }
}
