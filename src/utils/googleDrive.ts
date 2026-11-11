import { fetchCollectionFromFirestore, saveCollectionToFirestore, uploadMediaToFirebase } from '../firebase';

export interface GoogleDriveStatus {
  active: boolean;
  email: string;
  accessToken: string;
  folderId?: string;
}

const SERVICE_ACCOUNT_EMAIL = 'sheets-service-account@gen-lang-client-0441699702.iam.gserviceaccount.com';
const sharedFoldersInSession = new Set<string>();

export function resolveEffectiveTenantId(explicitTenantId?: string): string {
  if (explicitTenantId && explicitTenantId.trim() && explicitTenantId.trim() !== 'demo') {
    return explicitTenantId.trim();
  }
  if (typeof window !== 'undefined') {
    const direct = localStorage.getItem('defib_tenant_id') || localStorage.getItem('tenant_id');
    if (direct && direct.trim() && direct.trim() !== 'demo') {
      return direct.trim();
    }
    try {
      const techRaw = localStorage.getItem('defib_active_tech_session');
      if (techRaw) {
        const parsed = JSON.parse(techRaw);
        const tid = parsed?.tenantId || parsed?.envId;
        if (tid && String(tid).trim() && String(tid).trim() !== 'demo') {
          return String(tid).trim();
        }
      }
    } catch (_) {}
    try {
      const userRaw = localStorage.getItem('defib_logged_user');
      if (userRaw) {
        const parsed = JSON.parse(userRaw);
        const tid = parsed?.tenantId || parsed?.envId;
        if (tid && String(tid).trim() && String(tid).trim() !== 'demo') {
          return String(tid).trim();
        }
      }
    } catch (_) {}
    if (direct && direct.trim()) return direct.trim();
  }
  return explicitTenantId?.trim() || 'demo';
}

export function getCachedGoogleDriveActiveSync(explicitTenantId?: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const tid = resolveEffectiveTenantId(explicitTenantId);
    const tenantActive = localStorage.getItem(`defib_${tid}_google_drive_active`);
    if (tenantActive === 'true') return true;
    if (tenantActive === 'false') return false;
    const globalActive = localStorage.getItem('defib_google_drive_active');
    if (globalActive === 'true') return true;
    const tenantEmail = localStorage.getItem(`defib_${tid}_google_drive_email`);
    if (tenantEmail && tenantEmail.includes('@')) return true;
  } catch (_) {}
  return false;
}

export async function fetchGoogleDriveStatus(tenantId?: string): Promise<GoogleDriveStatus> {
  const activeTenant = resolveEffectiveTenantId(tenantId);

  const cacheLocally = (tid: string, active: boolean, email: string, accessToken: string, folderId?: string) => {
    if (typeof window === 'undefined') return;
    try {
      const targets = Array.from(new Set([tid, tid.toUpperCase(), tid.toLowerCase()])).filter(Boolean);
      for (const t of targets) {
        localStorage.setItem(`defib_${t}_google_drive_active`, active ? 'true' : 'false');
        if (email) localStorage.setItem(`defib_${t}_google_drive_email`, email);
        if (accessToken) localStorage.setItem(`defib_${t}_google_drive_token`, accessToken);
        if (folderId) localStorage.setItem(`defib_${t}_google_drive_folder_id`, folderId);
      }
      localStorage.setItem('defib_google_drive_active', active ? 'true' : 'false');
      if (email) localStorage.setItem('defib_google_drive_email', email);
      if (accessToken) localStorage.setItem('defib_google_drive_token', accessToken);
    } catch (_) {}
  };

  const extractStatusFromData = (data: any): GoogleDriveStatus | null => {
    if (!data || typeof data !== 'object') return null;
    const hasExplicitActive = data.googleDriveActive !== undefined;
    const hasLinkedAccount = Boolean(data.googleDriveEmail || data.googleDriveAccessToken);
    if (!hasExplicitActive && !hasLinkedAccount) return null;

    // Once linked, keep active unless explicitly set to false
    const active = hasExplicitActive ? Boolean(data.googleDriveActive) : hasLinkedAccount;
    const email =
      data.googleDriveEmail ||
      (typeof window !== 'undefined'
        ? localStorage.getItem(`defib_${activeTenant}_google_drive_email`) ||
          localStorage.getItem('defib_google_drive_email')
        : '') ||
      '';
    const accessToken =
      data.googleDriveAccessToken ||
      (typeof window !== 'undefined'
        ? localStorage.getItem(`defib_${activeTenant}_google_drive_token`) ||
          localStorage.getItem('defib_google_drive_token')
        : '') ||
      '';
    const folderId =
      data.googleDriveFolderId ||
      (typeof window !== 'undefined' ? localStorage.getItem(`defib_${activeTenant}_google_drive_folder_id`) : '') ||
      '';

    cacheLocally(activeTenant, active, email, accessToken, folderId);
    return { active, email, accessToken, folderId };
  };

  // 1. Query authoritative server endpoint first so all users of the tenant share the exact same connector state
  if (typeof fetch !== 'undefined') {
    try {
      const res = await fetch(
        `/api/sync-collection?collectionName=api_connectors&tenantId=${encodeURIComponent(activeTenant)}&t=${Date.now()}`,
        { cache: 'no-store' }
      );
      if (res.ok) {
        const json = await res.json();
        const rawData = json?.value;
        const data = Array.isArray(rawData) ? rawData[0] : rawData;
        const extracted = extractStatusFromData(data);
        if (extracted) return extracted;
      }
    } catch (_) {}
  }

  // 2. Fallback to Firestore helper
  try {
    const rawData = await fetchCollectionFromFirestore<any>('api_connectors', activeTenant);
    const data = Array.isArray(rawData) ? rawData[0] : rawData;
    const extracted = extractStatusFromData(data);
    if (extracted) return extracted;
  } catch (e) {
    console.error('Error fetching Google Drive status from Firestore for tenant:', activeTenant, e);
  }

  // 3. Fallback to localStorage
  const tenantSpecificActive =
    typeof window !== 'undefined' ? localStorage.getItem(`defib_${activeTenant}_google_drive_active`) : null;
  const globalActive = typeof window !== 'undefined' ? localStorage.getItem('defib_google_drive_active') : null;
  const email =
    (typeof window !== 'undefined'
      ? localStorage.getItem(`defib_${activeTenant}_google_drive_email`) ||
        localStorage.getItem('defib_google_drive_email')
      : '') || '';
  const accessToken =
    (typeof window !== 'undefined'
      ? localStorage.getItem(`defib_${activeTenant}_google_drive_token`) ||
        localStorage.getItem('defib_google_drive_token')
      : '') || '';
  const folderId =
    (typeof window !== 'undefined' ? localStorage.getItem(`defib_${activeTenant}_google_drive_folder_id`) : '') || '';

  const active =
    tenantSpecificActive !== null
      ? tenantSpecificActive === 'true'
      : globalActive !== null
      ? globalActive === 'true'
      : Boolean(email || accessToken);

  return { active, email, accessToken, folderId };
}

export const shareFolderWithServiceAccount = async (accessToken: string, folderId: string): Promise<void> => {
  if (!accessToken || !folderId || accessToken.startsWith('mock_')) return;
  if (sharedFoldersInSession.has(folderId)) return;
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}/permissions?sendNotificationEmail=false&supportsAllDrives=true`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: 'writer',
          type: 'user',
          emailAddress: SERVICE_ACCOUNT_EMAIL,
        }),
      }
    );
    if (res.ok) {
      sharedFoldersInSession.add(folderId);
    }
  } catch (_) {}
};

export const getOrCreateDefibeoFolder = async (accessToken: string, explicitTenantId?: string): Promise<string> => {
  const query = encodeURIComponent(
    "name = 'Defibeo' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
  );
  const searchResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!searchResponse.ok) {
    const errText = await searchResponse.text();
    throw new Error(`Erreur lors de la recherche du dossier Defibeo : ${searchResponse.statusText} - ${errText}`);
  }

  let folderId = '';
  const searchResult = await searchResponse.json();
  if (searchResult.files && searchResult.files.length > 0) {
    folderId = searchResult.files[0].id;
  } else {
    // Create the folder if it doesn't exist
    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Defibeo',
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });

    if (!createResponse.ok) {
      const errText = await createResponse.text();
      throw new Error(`Erreur lors de la création du dossier Defibeo : ${createResponse.statusText} - ${errText}`);
    }

    const createResult = await createResponse.json();
    folderId = createResult.id;
  }

  if (folderId) {
    // Share folder with service account in background so server-side uploads keep working even after user's 1h OAuth token expires
    shareFolderWithServiceAccount(accessToken, folderId).catch(() => {});
    if (typeof window !== 'undefined') {
      try {
        const tid = resolveEffectiveTenantId(explicitTenantId);
        localStorage.setItem(`defib_${tid}_google_drive_folder_id`, folderId);
      } catch (_) {}
    }
  }

  return folderId;
};

export const ensureGoogleDriveFolderSetup = async (
  accessToken: string,
  explicitTenantId?: string
): Promise<string> => {
  if (!accessToken || accessToken.startsWith('mock_')) return '';
  try {
    const folderId = await getOrCreateDefibeoFolder(accessToken, explicitTenantId);
    if (folderId) {
      await shareFolderWithServiceAccount(accessToken, folderId);
    }
    return folderId;
  } catch (e) {
    console.warn('Could not pre-initialize Defibeo folder during Google Drive link:', e);
    return '';
  }
};

export const makeFilePubliclyReadable = async (accessToken: string, fileId: string): Promise<void> => {
  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    });
    if (!response.ok) {
      console.warn(`Impossible de définir les permissions publiques sur le fichier ${fileId}:`, await response.text());
    }
  } catch (e) {
    console.warn(`Erreur de permissions publiques pour le fichier ${fileId}:`, e);
  }
};

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });

export const uploadFileToGoogleDrive = async (
  accessTokenOrFile: string | File,
  fileOrFolder?: File | string,
  explicitTenantId?: string
): Promise<string> => {
  const activeTenant = resolveEffectiveTenantId(explicitTenantId);
  let accessToken = '';
  let folderId = '';
  let file: File;

  if (typeof accessTokenOrFile !== 'string') {
    file = accessTokenOrFile;
    const status = await fetchGoogleDriveStatus(activeTenant);
    accessToken = status.accessToken;
    folderId = status.folderId || '';
  } else {
    accessToken = accessTokenOrFile;
    file = fileOrFolder as File;
    if (!accessToken) {
      const status = await fetchGoogleDriveStatus(activeTenant);
      accessToken = status.accessToken;
      folderId = status.folderId || '';
    } else if (typeof window !== 'undefined') {
      folderId = localStorage.getItem(`defib_${activeTenant}_google_drive_folder_id`) || '';
    }
  }

  // Support mock for testing/preview environments if necessary
  if (accessToken && accessToken.startsWith('mock_')) {
    return `https://drive.google.com/file/d/mock_${Date.now()}/view`;
  }

  const executeDriveUpload = async (token: string): Promise<string> => {
    const targetFolderId = await getOrCreateDefibeoFolder(token, activeTenant);
    if (targetFolderId && targetFolderId !== folderId) {
      folderId = targetFolderId;
      // Persist discovered folderId to tenant api_connectors in background
      fetchCollectionFromFirestore<any>('api_connectors', activeTenant)
        .then((raw) => {
          const existing = Array.isArray(raw) ? raw[0] : raw;
          if (existing && typeof existing === 'object' && !existing.googleDriveFolderId) {
            saveCollectionToFirestore(
              'api_connectors',
              { ...existing, googleDriveFolderId: targetFolderId },
              activeTenant
            ).catch(() => {});
          }
        })
        .catch(() => {});
    }

    const metadata = {
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      parents: [targetFolderId],
    };

    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('file', file);

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Échec de l'upload sur Google Drive (${response.status}) : ${errorText}`);
    }

    const result = await response.json();
    if (result.id) {
      await makeFilePubliclyReadable(token, result.id);
    }
    return result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`;
  };

  // 1. Try direct client-side upload if we have a token
  if (accessToken) {
    try {
      return await executeDriveUpload(accessToken);
    } catch (err: any) {
      console.warn(
        'Direct Google Drive upload attempt with cached token failed, trying refreshed status or server bridge:',
        err?.message || err
      );
      try {
        const freshStatus = await fetchGoogleDriveStatus(activeTenant);
        if (freshStatus.folderId) folderId = freshStatus.folderId;
        if (freshStatus.accessToken && freshStatus.accessToken !== accessToken) {
          return await executeDriveUpload(freshStatus.accessToken);
        }
      } catch (_) {}
    }
  }

  // 2. Try server-side Google Drive bridge (/api/google-drive/upload) which uses the permanent Service Account token or server media store
  if (typeof fetch !== 'undefined' && file) {
    try {
      const dataUrl = await fileToDataUrl(file);
      if (dataUrl) {
        const res = await fetch('/api/google-drive/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId: activeTenant,
            folderId,
            fileName: file.name || `document_${Date.now()}`,
            mimeType: file.type || 'application/octet-stream',
            dataUrl,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json?.url && typeof json.url === 'string') {
            return json.url;
          }
        }
      }
    } catch (bridgeErr) {
      console.warn('Server Google Drive bridge fallback warning:', bridgeErr);
    }
  }

  // 3. Final seamless fallback to Firebase/Server media URL so tenant users NEVER fail to upload a file
  const fallbackUrl = await uploadMediaToFirebase(file, 'documents', file?.name);
  if (fallbackUrl) {
    return fallbackUrl;
  }

  throw new Error("Impossible d'uploader le fichier et de récupérer l'URL source.");
};
