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

export function getTenantSuspiciousLogs(tenantId: string): SuspiciousActivityLog[] {
  const effectiveTenantId = tenantId || localStorage.getItem('defib_tenant_id') || 'demo';
  const key = `defib_${effectiveTenantId}_suspicious_activity_logs`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
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
  const ip = entry.userIp || getCurrentCachedIp();
  const userName = entry.userName || getCurrentUserName();

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

  const key = `defib_${effectiveTenantId}_suspicious_activity_logs`;
  let existing: SuspiciousActivityLog[] = [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) existing = parsed;
    }
  } catch (_) {}

  const updated = [newLog, ...existing];
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

  // If IP was not yet ready, fetch it asynchronously and update the log entry
  if (ip === 'Non renseignée') {
    fetchCurrentIp().then((fetchedIp) => {
      if (fetchedIp && fetchedIp !== 'Non renseignée') {
        newLog.userIp = fetchedIp;
        newLog.message = newLog.message.replace('(IP : Non renseignée)', `(IP : ${fetchedIp})`);
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
  const effectiveName = userName || getCurrentUserName();
  const effectiveIp = userIp || getCurrentCachedIp();
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
