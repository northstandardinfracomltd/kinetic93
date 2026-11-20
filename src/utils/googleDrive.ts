import { fetchCollectionFromFirestore, getTenantAliases, saveCollectionToFirestore, uploadMediaToFirebase } from '../firebase';

export interface GoogleDriveStatus {
  active: boolean;
  email: string;
  accessToken: string;
  folderId?: string;
}

const SERVICE_ACCOUNT_EMAIL = 'sheets-service-account@gen-lang-client-0441699702.iam.gserviceaccount.com';
const sharedFoldersInSession = new Set<string>();

export function resolveEffectiveTenantId(explicitTenantId?: string, companyInfo?: any): string {
  if (explicitTenantId && explicitTenantId.trim() && explicitTenantId.trim() !== 'demo') {
    return explicitTenantId.trim();
  }
  const compTid =
    companyInfo?.tenantId ||
    companyInfo?.envId ||
    companyInfo?.id ||
    companyInfo?.shortEnvId ||
    companyInfo?.code;
  if (compTid && String(compTid).trim() && String(compTid).trim() !== 'demo') {
    return String(compTid).trim();
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
      const userRaw = localStorage.getItem('defib_logged_user') || localStorage.getItem('defib_admin_logged_user');
      if (userRaw) {
        const parsed = JSON.parse(userRaw);
        const tid = parsed?.tenantId || parsed?.envId;
        if (tid && String(tid).trim() && String(tid).trim() !== 'demo') {
          return String(tid).trim();
        }
      }
    } catch (_) {}
    const shortEnv = localStorage.getItem('defib_short_env_id');
    if (shortEnv && shortEnv.trim() && shortEnv.trim() !== 'demo') {
      return shortEnv.trim();
    }
    if (direct && direct.trim()) return direct.trim();
  }
  return explicitTenantId?.trim() || (compTid ? String(compTid).trim() : '') || 'demo';
}

function getTenantCandidateIds(tid: string, companyInfo?: any): string[] {
  const base = (tid || 'demo').trim();
  const aliases = Array.from(getTenantAliases(base));
  const extraFromComp = [
    companyInfo?.tenantId,
    companyInfo?.envId,
    companyInfo?.id,
    companyInfo?.shortEnvId,
    companyInfo?.code,
  ]
    .map(v => String(v || '').trim())
    .filter(Boolean);
  for (const ext of extraFromComp) {
    for (const a of Array.from(getTenantAliases(ext))) {
      aliases.push(a);
    }
    aliases.push(ext);
  }
  return Array.from(
    new Set([
      base,
      base.toUpperCase(),
      base.toLowerCase(),
      ...aliases.flatMap(a => [a, a.toUpperCase(), a.toLowerCase()]),
    ])
  ).filter(Boolean);
}

export function getCachedGoogleDriveActiveSync(explicitTenantId?: string, companyInfo?: any): boolean {
  if (companyInfo && typeof companyInfo === 'object') {
    if (
      companyInfo.googleDriveActive === true ||
      companyInfo.googleDriveActive === 'Oui' ||
      Boolean(companyInfo.googleDriveEmail || companyInfo.googleDriveFolderId)
    ) {
      if (!(companyInfo.explicitGoogleDriveToggle && companyInfo.googleDriveActive === false)) {
        return true;
      }
    }
  }
  if (typeof window === 'undefined') return false;
  try {
    const tid = resolveEffectiveTenantId(explicitTenantId, companyInfo);
    const candidates = getTenantCandidateIds(tid, companyInfo);
    for (const c of candidates) {
      const tenantActive = localStorage.getItem(`defib_${c}_google_drive_active`);
      if (tenantActive === 'true') return true;
      const tenantEmail = localStorage.getItem(`defib_${c}_google_drive_email`);
      const tenantFolder = localStorage.getItem(`defib_${c}_google_drive_folder_id`);
      if ((tenantEmail && tenantEmail.includes('@')) || tenantFolder) {
        return true;
      }
    }
    for (const c of candidates) {
      const cacheKeys = [
        `fs_cache_${c}_api_connectors`,
        `fs_cache_defib_${c}_api_connectors`,
        `defib_${c}_company_info`,
        `fs_cache_${c}_companyInfo`,
        `fs_cache_defib_${c}_companyInfo`,
      ];
      for (const ck of cacheKeys) {
        try {
          const rawConn = localStorage.getItem(ck);
          if (rawConn) {
            const unwrap = JSON.parse(rawConn);
            const parsed = unwrap?.data !== undefined ? unwrap.data : unwrap;
            if (
              parsed?.googleDriveActive === true ||
              parsed?.googleDriveActive === 'Oui' ||
              ((parsed?.googleDriveEmail || parsed?.googleDriveFolderId) &&
                !(parsed?.explicitGoogleDriveToggle && parsed?.googleDriveActive === false))
            ) {
              return true;
            }
          }
        } catch (_) {}
      }
    }
    for (const c of candidates) {
      const tenantActive = localStorage.getItem(`defib_${c}_google_drive_active`);
      if (tenantActive === 'false') return false;
    }
    const globalActive = localStorage.getItem('defib_google_drive_active');
    if (globalActive === 'true') return true;
    const globalEmail = localStorage.getItem('defib_google_drive_email');
    if (globalEmail && globalEmail.includes('@') && globalActive !== 'false') return true;
  } catch (_) {}
  return false;
}

export async function fetchGoogleDriveStatus(tenantId?: string, companyInfo?: any): Promise<GoogleDriveStatus> {
  const activeTenant = resolveEffectiveTenantId(tenantId, companyInfo);
  const candidates = getTenantCandidateIds(activeTenant, companyInfo);

  const getLocalField = (suffix: string, globalKey?: string): string => {
    if (typeof window === 'undefined') return '';
    try {
      for (const c of candidates) {
        const v = localStorage.getItem(`defib_${c}_${suffix}`);
        if (v) return v;
      }
      if (globalKey) {
        return localStorage.getItem(globalKey) || '';
      }
    } catch (_) {}
    return '';
  };

  const cacheLocally = (tid: string, active: boolean, email: string, accessToken: string, folderId?: string) => {
    if (typeof window === 'undefined') return;
    try {
      const targets = getTenantCandidateIds(tid, companyInfo);
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
    const isExplicitlyDisabled = Boolean(data.explicitGoogleDriveToggle && (data.googleDriveActive === false || data.googleDriveActive === 'Non'));
    const isActiveFlag = data.googleDriveActive === true || data.googleDriveActive === 'Oui';
    const hasLinkedInData = Boolean(data.googleDriveEmail || data.googleDriveAccessToken || data.googleDriveFolderId);

    // Ignore default/un-toggled false records that have no linked Google Drive data so they never poison active state
    if (!isActiveFlag && !hasLinkedInData && !isExplicitlyDisabled) {
      return null;
    }

    const active = isExplicitlyDisabled ? false : (isActiveFlag || hasLinkedInData);
    const email = data.googleDriveEmail || getLocalField('google_drive_email', 'defib_google_drive_email') || '';
    const accessToken = data.googleDriveAccessToken || getLocalField('google_drive_token', 'defib_google_drive_token') || '';
    const folderId = data.googleDriveFolderId || getLocalField('google_drive_folder_id') || '';

    if (active || isExplicitlyDisabled) {
      cacheLocally(activeTenant, active, email, accessToken, folderId);
    }
    return { active, email, accessToken, folderId };
  };

  // 0. Check passed companyInfo prop first if it explicitly carries active Google Drive metadata
  if (companyInfo && typeof companyInfo === 'object') {
    const extractedFromProp = extractStatusFromData(companyInfo);
    if (extractedFromProp && extractedFromProp.active) {
      // Still query server for latest accessToken/folderId if missing in companyInfo
      if (extractedFromProp.accessToken && extractedFromProp.folderId) {
        return extractedFromProp;
      }
    }
  }

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
        if (extracted) {
          return extracted;
        }
      }
    } catch (_) {}
  }

  // 2. Fallback to Firestore helper for api_connectors
  try {
    const rawData = await fetchCollectionFromFirestore<any>('api_connectors', activeTenant);
    const data = Array.isArray(rawData) ? rawData[0] : rawData;
    const extracted = extractStatusFromData(data);
    if (extracted) {
      return extracted;
    }
  } catch (e) {
    console.error('Error fetching Google Drive status from Firestore for tenant:', activeTenant, e);
  }

  // 2b. Check companyInfo backup (both prop and server/Firestore) in case Google Drive state was mirrored into companyInfo
  if (companyInfo && typeof companyInfo === 'object') {
    const extractedFromProp = extractStatusFromData(companyInfo);
    if (extractedFromProp) {
      return extractedFromProp;
    }
  }
  try {
    const compData = await fetchCollectionFromFirestore<any>('companyInfo', activeTenant);
    const extractedComp = extractStatusFromData(compData);
    if (extractedComp) {
      return extractedComp;
    }
  } catch (_) {}

  // 3. Fallback to localStorage across all tenant aliases
  const email = getLocalField('google_drive_email', 'defib_google_drive_email');
  const accessToken = getLocalField('google_drive_token', 'defib_google_drive_token');
  const folderId = getLocalField('google_drive_folder_id');
  const cachedSyncActive = getCachedGoogleDriveActiveSync(activeTenant, companyInfo);

  const active = cachedSyncActive || Boolean(email || accessToken || folderId);
  if (active) {
    cacheLocally(activeTenant, true, email, accessToken, folderId);
  }

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

export const normalizePublicMediaUrl = (rawUrl: string): string => {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';
  if (trimmed.includes('/api/firebase-media/')) {
    if (typeof window !== 'undefined' && window.location?.origin && !window.location.origin.includes('localhost')) {
      return trimmed.replace(/^https?:\/\/[^/]+/i, window.location.origin.replace(/^http:\/\//i, 'https://'));
    }
    if (/https?:\/\/kinetic93-[^/]+\.run\.app/i.test(trimmed)) {
      return trimmed.replace(/https?:\/\/kinetic93-[^/]+\.run\.app/i, 'https://consoledefibeo.deroesch.com');
    }
  }
  return trimmed;
};

const refreshGoogleDriveTokenSilently = (activeTenant: string, hintEmail?: string): Promise<string> => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve('');
  }
  return new Promise((resolve) => {
    let settled = false;
    let iframe: HTMLIFrameElement | null = null;
    let pollTimer: any = null;
    let timeoutTimer: any = null;

    const cleanup = (token: string) => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (iframe && iframe.parentNode) {
        try {
          iframe.parentNode.removeChild(iframe);
        } catch (_) {}
      }
      resolve(token);
    };

    try {
      const clientId = '627487981610-1srkug4lp1qeih26pd2thd1241andaq4.apps.googleusercontent.com';
      const redirectUri = window.location.origin;
      const scopes = [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/userinfo.email',
      ].join(' ');
      const emailHint =
        hintEmail ||
        localStorage.getItem(`defib_${activeTenant}_google_drive_email`) ||
        localStorage.getItem('defib_google_drive_email') ||
        '';

      let oauthUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=token` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&prompt=none`;
      if (emailHint && emailHint.includes('@')) {
        oauthUrl += `&login_hint=${encodeURIComponent(emailHint)}`;
      }

      iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.style.width = '0px';
      iframe.style.height = '0px';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.src = oauthUrl;
      document.body.appendChild(iframe);

      pollTimer = setInterval(() => {
        try {
          if (!iframe || !iframe.contentWindow) return;
          const href = iframe.contentWindow.location.href;
          if (href && href.startsWith(redirectUri)) {
            const hash = iframe.contentWindow.location.hash || '';
            const search = iframe.contentWindow.location.search || '';
            const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : search.slice(1));
            const newToken = params.get('access_token') || '';
            const err = params.get('error') || '';
            if (newToken) {
              try {
                const targets = Array.from(
                  new Set([activeTenant, activeTenant.toUpperCase(), activeTenant.toLowerCase()])
                ).filter(Boolean);
                for (const t of targets) {
                  localStorage.setItem(`defib_${t}_google_drive_token`, newToken);
                  localStorage.setItem(`defib_${t}_google_drive_active`, 'true');
                }
                localStorage.setItem('defib_google_drive_token', newToken);
              } catch (_) {}
              cleanup(newToken);
            } else if (err) {
              cleanup('');
            }
          }
        } catch (_) {
          // Cross-origin while on accounts.google.com; wait until redirect back to redirectUri
        }
      }, 120);

      timeoutTimer = setTimeout(() => {
        cleanup('');
      }, 2400);
    } catch (_) {
      cleanup('');
    }
  });
};

export const uploadFileToGoogleDrive = async (
  accessTokenOrFile: string | File,
  fileOrFolder?: File | string,
  explicitTenantId?: string
): Promise<string> => {
  const activeTenant = resolveEffectiveTenantId(explicitTenantId);
  let accessToken = '';
  let folderId = '';
  let linkedEmail = '';
  let file: File;

  if (typeof accessTokenOrFile !== 'string') {
    file = accessTokenOrFile;
    const status = await fetchGoogleDriveStatus(activeTenant);
    accessToken = status.accessToken;
    folderId = status.folderId || '';
    linkedEmail = status.email || '';
  } else {
    accessToken = accessTokenOrFile;
    file = fileOrFolder as File;
    if (!accessToken) {
      const status = await fetchGoogleDriveStatus(activeTenant);
      accessToken = status.accessToken;
      folderId = status.folderId || '';
      linkedEmail = status.email || '';
    } else if (typeof window !== 'undefined') {
      folderId = localStorage.getItem(`defib_${activeTenant}_google_drive_folder_id`) || '';
      linkedEmail =
        localStorage.getItem(`defib_${activeTenant}_google_drive_email`) ||
        localStorage.getItem('defib_google_drive_email') ||
        '';
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
          if (existing && typeof existing === 'object') {
            saveCollectionToFirestore(
              'api_connectors',
              { ...existing, googleDriveFolderId: targetFolderId, googleDriveAccessToken: token },
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
        'Direct Google Drive upload attempt with cached token failed, trying refreshed status or silent OAuth renewal:',
        err?.message || err
      );
      try {
        const freshStatus = await fetchGoogleDriveStatus(activeTenant);
        if (freshStatus.folderId) folderId = freshStatus.folderId;
        if (freshStatus.email) linkedEmail = freshStatus.email;
        if (freshStatus.accessToken && freshStatus.accessToken !== accessToken) {
          return await executeDriveUpload(freshStatus.accessToken);
        }
      } catch (_) {}
    }
  }

  // 1b. If Google Drive is active for this tenant and cached token was missing or expired (1h OAuth limit), try silent OAuth token refresh
  if (getCachedGoogleDriveActiveSync(activeTenant)) {
    try {
      const renewedToken = await refreshGoogleDriveTokenSilently(activeTenant, linkedEmail);
      if (renewedToken && renewedToken !== accessToken) {
        return await executeDriveUpload(renewedToken);
      }
    } catch (silentErr) {
      console.warn('Silent Google Drive token renewal upload failed:', silentErr);
    }
  }

  // 2. Try server-side Google Drive bridge (/api/google-drive/upload) which uses stored OAuth token or permanent Google Sheets media store
  if (typeof fetch !== 'undefined' && file) {
    try {
      const dataUrl = await fileToDataUrl(file);
      if (dataUrl) {
        const clientOrigin =
          typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
        const res = await fetch('/api/google-drive/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId: activeTenant,
            folderId,
            fileName: file.name || `document_${Date.now()}`,
            mimeType: file.type || 'application/octet-stream',
            dataUrl,
            clientOrigin,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json?.url && typeof json.url === 'string') {
            return normalizePublicMediaUrl(json.url);
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
    return normalizePublicMediaUrl(fallbackUrl);
  }

  throw new Error("Impossible d'uploader le fichier et de récupérer l'URL source.");
};
