import { fetchCollectionFromFirestore } from '../firebase';

/**
 * Helper to retrieve the current Google Drive credentials from Firestore or localStorage.
 */
export async function getGoogleDriveCredentials(tenantId?: string): Promise<{ active: boolean; email: string; token: string }> {
  const activeTenant = tenantId || localStorage.getItem('defib_tenant_id') || 'demo';

  // 1. First check Firestore 'api_connectors'
  try {
    const data = await fetchCollectionFromFirestore<any>('api_connectors', activeTenant);
    if (data && data.googleDriveActive !== undefined) {
      const active = Boolean(data.googleDriveActive);
      const email = data.googleDriveEmail || '';
      const token = data.googleDriveAccessToken || '';
      if (active) {
        // Keep localStorage in sync
        localStorage.setItem('defib_google_drive_active', 'true');
        if (email) localStorage.setItem('defib_google_drive_email', email);
        if (token) localStorage.setItem('defib_google_drive_token', token);
      }
      return { active, email, token };
    }
  } catch (err) {
    console.warn("Could not fetch api_connectors from Firestore:", err);
  }

  // 2. Fallback to localStorage
  const active = localStorage.getItem('defib_google_drive_active') === 'true';
  const email = localStorage.getItem('defib_google_drive_email') || '';
  const token = localStorage.getItem('defib_google_drive_token') || '';

  return { active, email, token };
}

/**
 * Searches for or creates a dedicated folder (default "Defibeo") in the user's Google Drive.
 */
export async function getOrCreateDefibeoFolder(accessToken: string, folderName = 'Defibeo'): Promise<string> {
  if (!accessToken) {
    throw new Error("Jeton d'accès Google Drive manquant.");
  }

  // Search for existing non-trashed folder named folderName
  const query = encodeURIComponent(`name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
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
    throw new Error(`Erreur lors de la recherche du dossier Google Drive '${folderName}' : ${searchResponse.statusText} - ${errText}`);
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
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    }
  );

  if (!createResponse.ok) {
    const errText = await createResponse.text();
    throw new Error(`Erreur lors de la création du dossier Google Drive '${folderName}' : ${createResponse.statusText} - ${errText}`);
  }

  const createResult = await createResponse.json();
  return createResult.id;
}

/**
 * Makes a Google Drive file publicly accessible via link to allow viewing without manual access requests.
 */
export async function makeFilePubliclyReadable(accessToken: string, fileId: string): Promise<void> {
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
      console.warn(`Impossible de définir les permissions publiques sur le fichier Google Drive ${fileId}:`, await response.text());
    }
  } catch (e) {
    console.warn(`Erreur de permissions publiques pour le fichier Google Drive ${fileId}:`, e);
  }
}

/**
 * Uploads a file to Google Drive directly inside the 'Defibeo' folder and returns the shared view link.
 */
export async function uploadFileToGoogleDrive(accessToken: string, file: File, folderName = 'Defibeo'): Promise<string> {
  if (!accessToken) {
    throw new Error("Le connecteur Google Drive n'est pas configuré ou est inactif. Veuillez l'activer dans les réglages.");
  }

  // Support mock / preview environment simulation
  if (accessToken.startsWith('mock_') || accessToken === 'demo' || accessToken === 'simulation') {
    return `https://drive.google.com/file/d/mock_${Date.now()}/view`;
  }

  try {
    // 1. Find or create the destination folder
    const folderId = await getOrCreateDefibeoFolder(accessToken, folderName);

    // 2. Upload file directly inside the folder
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
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      const isAuthError = response.status === 401 || 
                          errorText.includes('UNAUTHENTICATED') || 
                          errorText.includes('authError') || 
                          errorText.includes('invalid credentials') || 
                          errorText.includes('Invalid Credentials');
      
      if (isAuthError) {
        throw new Error("Votre session Google Drive a expiré ou vos autorisations sont invalides. Veuillez désactiver puis réactiver le connecteur Google Drive dans les réglages pour renouveler votre accès.");
      }

      throw new Error(`Échec du téléversement sur Google Drive : ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    
    // 3. Set public read permissions so clicking "Consulter" opens cleanly
    if (result.id) {
      await makeFilePubliclyReadable(accessToken, result.id);
    }

    return result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`;
  } catch (err: any) {
    console.error("Google Drive Upload Error:", err);
    const isAuthError = err?.message?.includes('401') || 
                        err?.message?.includes('UNAUTHENTICATED') || 
                        err?.message?.includes('authError') ||
                        err?.message?.includes('credentials');
    if (isAuthError) {
      throw new Error("Session Google Drive expirée ou invalide. Veuillez désactiver puis réactiver le connecteur Google Drive dans les réglages pour renouveler vos autorisations.");
    }
    throw err;
  }
}
