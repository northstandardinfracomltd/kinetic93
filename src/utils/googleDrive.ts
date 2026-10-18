import { fetchCollectionFromFirestore, uploadMediaToFirebase } from '../firebase';

export interface GoogleDriveStatus {
  active: boolean;
  email: string;
  accessToken: string;
}

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

export async function fetchGoogleDriveStatus(tenantId?: string): Promise<GoogleDriveStatus> {
  const activeTenant = resolveEffectiveTenantId(tenantId);

  const cacheLocally = (tid: string, active: boolean, email: string, accessToken: string) => {
    if (typeof window === 'undefined') return;
    try {
      const targets = Array.from(new Set([tid, tid.toUpperCase(), tid.toLowerCase()])).filter(Boolean);
      for (const t of targets) {
        localStorage.setItem(`defib_${t}_google_drive_active`, active ? 'true' : 'false');
        if (email) localStorage.setItem(`defib_${t}_google_drive_email`, email);
        if (accessToken) localStorage.setItem(`defib_${t}_google_drive_token`, accessToken);
      }
    } catch (_) {}
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
        if (data && typeof data === 'object' && data.googleDriveActive !== undefined) {
          const active = Boolean(data.googleDriveActive);
          const email =
            data.googleDriveEmail ||
            (typeof window !== 'undefined' ? localStorage.getItem(`defib_${activeTenant}_google_drive_email`) : '') ||
            '';
          const accessToken =
            data.googleDriveAccessToken ||
            (typeof window !== 'undefined' ? localStorage.getItem(`defib_${activeTenant}_google_drive_token`) : '') ||
            '';
          cacheLocally(activeTenant, active, email, accessToken);
          return { active, email, accessToken };
        }
      }
    } catch (_) {}
  }

  // 2. Fallback to Firestore helper
  try {
    const rawData = await fetchCollectionFromFirestore<any>('api_connectors', activeTenant);
    const data = Array.isArray(rawData) ? rawData[0] : rawData;
    if (data && typeof data === 'object' && data.googleDriveActive !== undefined) {
      const active = Boolean(data.googleDriveActive);
      const email =
        data.googleDriveEmail ||
        (typeof window !== 'undefined' ? localStorage.getItem(`defib_${activeTenant}_google_drive_email`) : '') ||
        '';
      const accessToken =
        data.googleDriveAccessToken ||
        (typeof window !== 'undefined' ? localStorage.getItem(`defib_${activeTenant}_google_drive_token`) : '') ||
        '';
      cacheLocally(activeTenant, active, email, accessToken);
      return { active, email, accessToken };
    }
  } catch (e) {
    console.error("Error fetching Google Drive status from Firestore for tenant:", activeTenant, e);
  }

  const tenantSpecificActive = typeof window !== 'undefined' ? localStorage.getItem(`defib_${activeTenant}_google_drive_active`) : null;
  const active = tenantSpecificActive !== null ? tenantSpecificActive === 'true' : false;
  const email = (typeof window !== 'undefined' ? localStorage.getItem(`defib_${activeTenant}_google_drive_email`) : '') || '';
  const accessToken = (typeof window !== 'undefined' ? localStorage.getItem(`defib_${activeTenant}_google_drive_token`) : '') || '';
  return { active, email, accessToken };
}

export const getOrCreateDefibeoFolder = async (accessToken: string): Promise<string> => {
  const query = encodeURIComponent("name = 'Defibeo' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  const searchResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!searchResponse.ok) {
    const errText = await searchResponse.text();
    throw new Error(`Erreur lors de la recherche du dossier Defibeo : ${searchResponse.statusText} - ${errText}`);
  }

  const searchResult = await searchResponse.json();
  if (searchResult.files && searchResult.files.length > 0) {
    return searchResult.files[0].id;
  }

  // Create the folder if it doesn't exist
  const createResponse = await fetch(
    'https://www.googleapis.com/drive/v3/files',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Defibeo',
        mimeType: 'application/vnd.google-apps.folder',
      }),
    }
  );

  if (!createResponse.ok) {
    const errText = await createResponse.text();
    throw new Error(`Erreur lors de la création du dossier Defibeo : ${createResponse.statusText} - ${errText}`);
  }

  const createResult = await createResponse.json();
  return createResult.id;
};

export const makeFilePubliclyReadable = async (accessToken: string, fileId: string): Promise<void> => {
  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone',
        }),
      }
    );
    if (!response.ok) {
      console.warn(`Impossible de définir les permissions publiques sur le fichier ${fileId}:`, await response.text());
    }
  } catch (e) {
    console.warn(`Erreur de permissions publiques pour le fichier ${fileId}:`, e);
  }
};

export const uploadFileToGoogleDrive = async (
  accessTokenOrFile: string | File,
  fileOrFolder?: File | string,
  explicitTenantId?: string
): Promise<string> => {
  let accessToken = '';
  let file: File;

  if (typeof accessTokenOrFile !== 'string') {
    file = accessTokenOrFile;
    const status = await fetchGoogleDriveStatus(explicitTenantId);
    accessToken = status.accessToken;
  } else {
    accessToken = accessTokenOrFile;
    file = fileOrFolder as File;
    if (!accessToken) {
      const status = await fetchGoogleDriveStatus(explicitTenantId);
      accessToken = status.accessToken;
    }
  }

  // Support mock for testing/preview environments if necessary
  if (accessToken && accessToken.startsWith('mock_')) {
    return `https://drive.google.com/file/d/mock_${Date.now()}/view`;
  }

  const executeDriveUpload = async (token: string): Promise<string> => {
    const folderId = await getOrCreateDefibeoFolder(token);
    const metadata = {
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      parents: [folderId],
    };

    const formData = new FormData();
    formData.append(
      'metadata',
      new Blob([JSON.stringify(metadata)], { type: 'application/json' })
    );
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

  if (accessToken) {
    try {
      return await executeDriveUpload(accessToken);
    } catch (err: any) {
      console.warn("Google Drive upload attempt failed, checking for refreshed tenant token or server media fallback:", err);
      try {
        const freshStatus = await fetchGoogleDriveStatus(explicitTenantId);
        if (freshStatus.accessToken && freshStatus.accessToken !== accessToken) {
          return await executeDriveUpload(freshStatus.accessToken);
        }
      } catch (_) {}
    }
  }

  // Seamless fallback to server-hosted media URL so tenant users never fail to upload or retrieve a source URL even if the OAuth token expired
  const fallbackUrl = await uploadMediaToFirebase(file, 'documents', file?.name);
  if (fallbackUrl) {
    return fallbackUrl;
  }

  throw new Error("Impossible d'uploader le fichier et de récupérer l'URL source.");
};

