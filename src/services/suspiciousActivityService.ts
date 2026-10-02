import { saveCollectionToFirestore, fetchCollectionFromFirestore } from '../firebase';

export type SuspiciousActionType =
  | 'CONNEXION'
  | 'MODIFICATION_MASSE_DEFIB'
  | 'EXPORT_MASSE'
  | 'SUPPRESSION_DEFIB'
  | 'SUPPRESSION_AUTRE_MATERIEL'
  | 'SUPPRESSION_CLIENT'
  | 'SUPPRESSION_TOURNEE'
  | 'SUPPRESSION_STOCK_CENTRALE'
  | 'SUPPRESSION_STOCK_DISTRIBUE'
  | 'SUPPRESSION_MEMBRE'
  | 'MODIFICATION_PARAMETRE';

export interface SuspiciousActivityLog {
  id: string;
  tenantId: string;
  timestamp: string; // ISO string
  userId?: string;
  userName: string;
  userIp: string;
  actionType: SuspiciousActionType;
  message: string;
  details?: Record<string, any>;
}

let inMemoryIp: string = '';
let lastLoggedCall: { key: string; time: number } | null = null;

// Pre-fetch IP on initial module load
if (typeof window !== 'undefined') {
  try {
    const cached = sessionStorage.getItem('user_client_ip');
    if (cached) {
      inMemoryIp = cached;
    } else {
      fetch('https://api64.ipify.org?format=json')
        .then((res) => res.json())
        .then((data) => {
          if (data?.ip) {
            inMemoryIp = String(data.ip);
            sessionStorage.setItem('user_client_ip', inMemoryIp);
          }
        })
        .catch(() => {});
    }
  } catch (_) {}
}

export function getCurrentCachedIp(): string {
  if (inMemoryIp) return inMemoryIp;
  try {
    const cached = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('user_client_ip') : null;
    if (cached) {
      inMemoryIp = cached;
      return cached;
    }
  } catch (_) {}
  return 'Non renseignée';
}

export function setCurrentIp(ip: string): void {
  if (!ip) return;
  inMemoryIp = ip;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('user_client_ip', ip);
    }
  } catch (_) {}
}

export async function fetchCurrentIp(): Promise<string> {
  if (inMemoryIp && inMemoryIp !== 'Non renseignée') return inMemoryIp;
  try {
    const cached = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('user_client_ip') : null;
    if (cached) {
      inMemoryIp = cached;
      return cached;
    }
  } catch (_) {}

  try {
    const res = await fetch('https://api64.ipify.org?format=json');
    const data = await res.json();
    if (data?.ip) {
      inMemoryIp = String(data.ip);
      try {
        sessionStorage.setItem('user_client_ip', inMemoryIp);
      } catch (_) {}
      return inMemoryIp;
    }
  } catch (_) {}

  return inMemoryIp || 'Non renseignée';
}

export function getCurrentUserName(fallbackUser?: { name?: string; email?: string } | null): string {
  if (fallbackUser?.name && fallbackUser.name.trim() !== '') return fallbackUser.name.trim();
  if (fallbackUser?.email && fallbackUser.email.trim() !== '') return fallbackUser.email.trim();
  try {
    const saved = localStorage.getItem('defib_admin_logged_user');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.name && parsed.name.trim() !== '') return parsed.name.trim();
      if (parsed?.email && parsed.email.trim() !== '') return parsed.email.trim();
    }
  } catch (_) {}
  return 'Utilisateur';
}

export function deduplicateSuspiciousLogs(logs: SuspiciousActivityLog[]): SuspiciousActivityLog[] {
  if (!Array.isArray(logs) || logs.length === 0) return [];
  const result: SuspiciousActivityLog[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < logs.length; i++) {
    const item = logs[i];
    if (!item || !item.id || seenIds.has(item.id)) continue;

    // Check if this item is a near-duplicate of an already included item (e.g. double connection within 15 seconds)
    const isDup = result.some((prev) => {
      if (item.actionType === 'CONNEXION' && prev.actionType === 'CONNEXION') {
        const tItem = new Date(item.timestamp).getTime();
        const tPrev = new Date(prev.timestamp).getTime();
        if (!isNaN(tItem) && !isNaN(tPrev) && Math.abs(tItem - tPrev) < 15000) {
          // If previous log had 'local_ip' or 'Non renseignée' and this one has real IP, update previous
          if (
            (prev.userIp === 'local_ip' || prev.userIp === 'Non renseignée') &&
            item.userIp &&
            item.userIp !== 'local_ip' &&
            item.userIp !== 'Non renseignée'
          ) {
            prev.userIp = item.userIp;
            prev.message = prev.message.replace(/\(IP\s*:\s*(?:local_ip|Non renseignée)\)/i, `(IP : ${item.userIp})`);
          }
          return true;
        }
      }
      if (item.actionType === prev.actionType && item.message === prev.message) {
        const tItem = new Date(item.timestamp).getTime();
        const tPrev = new Date(prev.timestamp).getTime();
        if (!isNaN(tItem) && !isNaN(tPrev) && Math.abs(tItem - tPrev) < 5000) {
          return true;
        }
      }
      return false;
    });

    if (!isDup) {
      seenIds.add(item.id);
      result.push(item);
    }
  }

  return result;
}

export function getTenantSuspiciousLogs(tenantId: string): SuspiciousActivityLog[] {
  const effectiveTenantId = tenantId || localStorage.getItem('defib_tenant_id') || 'demo';
  const key = `defib_${effectiveTenantId}_suspicious_activity_logs`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return deduplicateSuspiciousLogs(parsed);
    }
  } catch (_) {}
  return [];
}

export async function recordSuspiciousActivity(
  tenantId: string,
  entry: {
    userName?: string;
    userIp?: string;
    actionType: SuspiciousActionType;
    message: string;
    details?: Record<string, any>;
  },
  onLogsUpdated?: (logs: SuspiciousActivityLog[]) => void
): Promise<SuspiciousActivityLog> {
  const effectiveTenantId = tenantId || localStorage.getItem('defib_tenant_id') || 'demo';
  let ip = entry.userIp || getCurrentCachedIp();
  if (ip === 'local_ip') {
    const cached = getCurrentCachedIp();
    if (cached && cached !== 'local_ip' && cached !== 'Non renseignée') {
      ip = cached;
    }
  }
  const userName = entry.userName || getCurrentUserName();

  const key = `defib_${effectiveTenantId}_suspicious_activity_logs`;
  let existing: SuspiciousActivityLog[] = [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) existing = deduplicateSuspiciousLogs(parsed);
    }
  } catch (_) {}

  const nowMs = Date.now();

  // 1. Connection deduplication: Strictly prevent duplicate CONNEXION logs within 15 seconds
  if (entry.actionType === 'CONNEXION') {
    const recentConn = existing.find((l) => {
      if (l.actionType !== 'CONNEXION') return false;
      const t = new Date(l.timestamp).getTime();
      return !isNaN(t) && Math.abs(nowMs - t) < 15000;
    });
    if (recentConn) {
      // If previous entry had placeholder IP and current has a real IP, upgrade it in place
      if (
        (recentConn.userIp === 'local_ip' || recentConn.userIp === 'Non renseignée') &&
        ip &&
        ip !== 'local_ip' &&
        ip !== 'Non renseignée'
      ) {
        recentConn.userIp = ip;
        recentConn.message = recentConn.message.replace(/\(IP\s*:\s*(?:local_ip|Non renseignée)\)/i, `(IP : ${ip})`);
        try {
          localStorage.setItem(key, JSON.stringify(existing));
          if (effectiveTenantId && effectiveTenantId !== 'demo') {
            saveCollectionToFirestore('suspicious_activity_logs', existing, effectiveTenantId).catch(() => {});
          }
        } catch (_) {}
      }
      return recentConn;
    }

    if (
      lastLoggedCall &&
      lastLoggedCall.key.startsWith(`${effectiveTenantId}_CONNEXION`) &&
      nowMs - lastLoggedCall.time < 15000
    ) {
      if (existing.length > 0) return existing[0];
    }
  }

  // 2. Generic deduplication: Prevent duplicate records for the same action within 3 seconds
  const dedupeKey = `${effectiveTenantId}_${entry.actionType}_${entry.message}`;
  if (lastLoggedCall && lastLoggedCall.key === dedupeKey && (nowMs - lastLoggedCall.time) < 3000) {
    if (existing.length > 0) return existing[0];
  }
  lastLoggedCall = { key: dedupeKey, time: nowMs };

  if (existing.length > 0) {
    const latest = existing[0];
    if (latest.actionType === entry.actionType && latest.message === entry.message) {
      const diffMs = Math.abs(nowMs - new Date(latest.timestamp).getTime());
      if (diffMs < 3000) {
        return latest;
      }
    }
  }

  const newLog: SuspiciousActivityLog = {
    id: 'sus_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
    tenantId: effectiveTenantId,
    timestamp: new Date().toISOString(),
    userName,
    userIp: ip,
    actionType: entry.actionType,
    message: entry.message,
    details: entry.details,
  };

  const updated = deduplicateSuspiciousLogs([newLog, ...existing]);
  try {
    localStorage.setItem(key, JSON.stringify(updated));
  } catch (_) {}

  if (onLogsUpdated) {
    onLogsUpdated(updated);
  }

  // Sync to Firebase
  if (effectiveTenantId && effectiveTenantId !== 'demo') {
    saveCollectionToFirestore('suspicious_activity_logs', updated, effectiveTenantId).catch((err) => {
      console.warn('Error saving suspicious activity logs to Firestore:', err);
    });
  }

  // Emit event for reactive UI updates
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('defib-suspicious-activity-logged', {
        detail: { newLog, updated, tenantId: effectiveTenantId },
      })
    );
  }

  // If IP was not yet ready (e.g. 'local_ip' or 'Non renseignée'), fetch it asynchronously and update the log entry
  if (ip === 'Non renseignée' || ip === 'local_ip') {
    fetchCurrentIp().then((fetchedIp) => {
      if (fetchedIp && fetchedIp !== 'Non renseignée' && fetchedIp !== 'local_ip') {
        newLog.userIp = fetchedIp;
        newLog.message = newLog.message.replace(/\(IP\s*:\s*(?:local_ip|Non renseignée)\)/i, `(IP : ${fetchedIp})`);
        try {
          const rawCurrent = localStorage.getItem(key);
          if (rawCurrent) {
            const list: SuspiciousActivityLog[] = JSON.parse(rawCurrent);
            const patched = list.map((item) => (item.id === newLog.id ? newLog : item));
            localStorage.setItem(key, JSON.stringify(patched));
            if (effectiveTenantId && effectiveTenantId !== 'demo') {
              saveCollectionToFirestore('suspicious_activity_logs', patched, effectiveTenantId).catch(() => {});
            }
            if (onLogsUpdated) onLogsUpdated(patched);
          }
        } catch (_) {}
      }
    });
  }

  return newLog;
}

// -------------------------------------------------------------
// EVENT MESSAGE BUILDERS & SPECIFIC LOGGERS (A to K)
// -------------------------------------------------------------

// A) Connexion
export async function logUserLogin(
  tenantId: string,
  userName?: string,
  userIp?: string
): Promise<SuspiciousActivityLog> {
  const effectiveName = (userName && userName.trim() !== '') ? userName.trim() : getCurrentUserName();
  let effectiveIp = userIp;
  if (!effectiveIp || effectiveIp === 'local_ip' || effectiveIp === 'Non renseignée') {
    const cached = getCurrentCachedIp();
    if (cached && cached !== 'local_ip' && cached !== 'Non renseignée') {
      effectiveIp = cached;
    } else {
      effectiveIp = effectiveIp || cached || 'Non renseignée';
    }
  }
  const message = `L’utilisateur ${effectiveName} (IP : ${effectiveIp}), s’est connecté.`;
  return recordSuspiciousActivity(tenantId, {
    userName: effectiveName,
    userIp: effectiveIp,
    actionType: 'CONNEXION',
    message,
  });
}

// B) Modification en masse des Défibrillateurs
export async function logBulkEditDefib(
  tenantId: string,
  userName?: string,
  userIp?: string,
  count?: number
): Promise<SuspiciousActivityLog> {
  const effectiveName = userName || getCurrentUserName();
  const effectiveIp = userIp || getCurrentCachedIp();
  const message = `L’utilisateur ${effectiveName} (IP : ${effectiveIp}), à effectué une modification en masse des Défibrillateurs.`;
  return recordSuspiciousActivity(tenantId, {
    userName: effectiveName,
    userIp: effectiveIp,
    actionType: 'MODIFICATION_MASSE_DEFIB',
    message,
    details: count ? { count } : undefined,
  });
}

// C) Export en masse
export async function logBulkExport(
  tenantId: string,
  userName?: string,
  userIp?: string,
  category?: string
): Promise<SuspiciousActivityLog> {
  const effectiveName = userName || getCurrentUserName();
  const effectiveIp = userIp || getCurrentCachedIp();
  const message = `L’utilisateur ${effectiveName} (IP : ${effectiveIp}), à effectué un export en masse.`;
  return recordSuspiciousActivity(tenantId, {
    userName: effectiveName,
    userIp: effectiveIp,
    actionType: 'EXPORT_MASSE',
    message,
    details: category ? { category } : undefined,
  });
}

// D) Suppression Défibrillateur
export async function logDeleteDefib(
  tenantId: string,
  identifiant: string,
  materialType: string,
  userName?: string,
  userIp?: string
): Promise<SuspiciousActivityLog> {
  const effectiveName = userName || getCurrentUserName();
  const effectiveIp = userIp || getCurrentCachedIp();
  const message = `L’utilisateur ${effectiveName} (IP : ${effectiveIp}), à supprimé le défibrillateur ${identifiant || 'Inconnu'} / ${materialType || 'Défibrillateur'}.`;
  return recordSuspiciousActivity(tenantId, {
    userName: effectiveName,
    userIp: effectiveIp,
    actionType: 'SUPPRESSION_DEFIB',
    message,
    details: { identifiant, materialType },
  });
}

// E) Suppression Autre Matériel
export async function logDeleteOtherEquipment(
  tenantId: string,
  identifiant: string,
  serialNumber: string,
  userName?: string,
  userIp?: string
): Promise<SuspiciousActivityLog> {
  const effectiveName = userName || getCurrentUserName();
  const effectiveIp = userIp || getCurrentCachedIp();
  const message = `L’utilisateur ${effectiveName} (IP : ${effectiveIp}), à supprimé le autre matériel ${identifiant || 'Inconnu'} / ${serialNumber || 'Sans numéro de série'}.`;
  return recordSuspiciousActivity(tenantId, {
    userName: effectiveName,
    userIp: effectiveIp,
    actionType: 'SUPPRESSION_AUTRE_MATERIEL',
    message,
    details: { identifiant, serialNumber },
  });
}

// F) Suppression Client
export async function logDeleteClient(
  tenantId: string,
  companyName: string,
  userName?: string,
  userIp?: string
): Promise<SuspiciousActivityLog> {
  const effectiveName = userName || getCurrentUserName();
  const effectiveIp = userIp || getCurrentCachedIp();
  const message = `L’utilisateur ${effectiveName} (IP : ${effectiveIp}), à supprime le client ${companyName || 'Client'}.`;
  return recordSuspiciousActivity(tenantId, {
    userName: effectiveName,
    userIp: effectiveIp,
    actionType: 'SUPPRESSION_CLIENT',
    message,
    details: { companyName },
  });
}

// G) Suppression Tournée
export async function logDeleteTour(
  tenantId: string,
  tourName: string,
  userName?: string,
  userIp?: string
): Promise<SuspiciousActivityLog> {
  const effectiveName = userName || getCurrentUserName();
  const effectiveIp = userIp || getCurrentCachedIp();
  const message = `L’utilisateur ${effectiveName} (IP : ${effectiveIp}), à supprimé la tournée ${tourName || 'Tournée'}.`;
  return recordSuspiciousActivity(tenantId, {
    userName: effectiveName,
    userIp: effectiveIp,
    actionType: 'SUPPRESSION_TOURNEE',
    message,
    details: { tourName },
  });
}

// H) Suppression Stock Centrale
export async function logDeleteStockCenter(
  tenantId: string,
  itemName: string,
  userName?: string,
  userIp?: string
): Promise<SuspiciousActivityLog> {
  const effectiveName = userName || getCurrentUserName();
  const effectiveIp = userIp || getCurrentCachedIp();
  const message = `L’utilisateur ${effectiveName} (IP : ${effectiveIp}), à supprimé le stock de la centrale ${itemName || 'Équipement'}.`;
  return recordSuspiciousActivity(tenantId, {
    userName: effectiveName,
    userIp: effectiveIp,
    actionType: 'SUPPRESSION_STOCK_CENTRALE',
    message,
    details: { itemName },
  });
}

// I) Suppression Stock Distribué
export async function logDeleteDistributedStock(
  tenantId: string,
  itemName: string,
  userName?: string,
  userIp?: string
): Promise<SuspiciousActivityLog> {
  const effectiveName = userName || getCurrentUserName();
  const effectiveIp = userIp || getCurrentCachedIp();
  const message = `L’utilisateur ${effectiveName} (IP : ${effectiveIp}), à supprimé le stock distribué ${itemName || 'Équipement'}.`;
  return recordSuspiciousActivity(tenantId, {
    userName: effectiveName,
    userIp: effectiveIp,
    actionType: 'SUPPRESSION_STOCK_DISTRIBUE',
    message,
    details: { itemName },
  });
}

// J) Suppression Membre
export async function logDeleteMember(
  tenantId: string,
  memberName: string,
  userName?: string,
  userIp?: string
): Promise<SuspiciousActivityLog> {
  const effectiveName = userName || getCurrentUserName();
  const effectiveIp = userIp || getCurrentCachedIp();
  const message = `L’utilisateur ${effectiveName} (IP : ${effectiveIp}), à supprimé le membre de l’environnement ${memberName || 'Membre'}.`;
  return recordSuspiciousActivity(tenantId, {
    userName: effectiveName,
    userIp: effectiveIp,
    actionType: 'SUPPRESSION_MEMBRE',
    message,
    details: { memberName },
  });
}

// K) Modification Paramètre Réglages
export async function logUpdateSetting(
  tenantId: string,
  fieldName: string,
  userName?: string,
  userIp?: string
): Promise<SuspiciousActivityLog> {
  const effectiveName = userName || getCurrentUserName();
  const effectiveIp = userIp || getCurrentCachedIp();
  const message = `L’utilisateur ${effectiveName} (IP : ${effectiveIp}), à modifié le paramètre ${fieldName} de l’environnement.`;
  return recordSuspiciousActivity(tenantId, {
    userName: effectiveName,
    userIp: effectiveIp,
    actionType: 'MODIFICATION_PARAMETRE',
    message,
    details: { fieldName },
  });
}

// -------------------------------------------------------------
// CSV EXPORT OF ALL SUSPICIOUS ACTION TRACES
// -------------------------------------------------------------
export function exportSuspiciousActivityToCsv(
  logs: SuspiciousActivityLog[],
  tenantId?: string
): void {
  const effectiveTenantId = tenantId || localStorage.getItem('defib_tenant_id') || 'demo';
  const headers = ['Date & Heure', 'Utilisateur', 'Adresse IP', 'Type d’action', 'Événement'];
  const rows = logs.map((l) => {
    let dateFormatted = l.timestamp;
    try {
      dateFormatted = new Date(l.timestamp).toLocaleString('fr-FR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch (_) {}

    return [
      `"${dateFormatted}"`,
      `"${(l.userName || '').replace(/"/g, '""')}"`,
      `"${(l.userIp || '').replace(/"/g, '""')}"`,
      `"${(l.actionType || '').replace(/"/g, '""')}"`,
      `"${(l.message || '').replace(/"/g, '""')}"`,
    ].join(';');
  });

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  link.setAttribute('href', url);
  link.setAttribute(
    'download',
    `traces_actions_suspectes_${effectiveTenantId}_${dateStr}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
