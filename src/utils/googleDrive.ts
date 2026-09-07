import { fetchCollectionFromFirestore } from '../firebase';

export interface GoogleDriveStatus {
  active: boolean;
  email: string;
  accessToken: string;
}

export async function fetchGoogleDriveStatus(tenantId?: string): Promise<GoogleDriveStatus> {
  const activeTenant = tenantId || localStorage.getItem('defib_tenant_id') || 'demo';
  try {
    const data = await fetchCollectionFromFirestore<any>('api_connectors', activeTenant);
    if (data && data.googleDriveActive !== undefined) {
      const active = Boolean(data.googleDriveActive);
      const email = data.googleDriveEmail || localStorage.getItem('defib_google_drive_email') || '';
      const accessToken = data.googleDriveAccessToken || localStorage.getItem('defib_google_drive_token') || '';
      return { active, email, accessToken };
    }
  } catch (e) {
    console.error("Error fetching Google Drive status from Firestore:", e);
  }

  const active = localStorage.getItem('defib_google_drive_active') === 'true';
  const email = localStorage.getItem('defib_google_drive_email') || '';
  const accessToken = localStorage.getItem('defib_google_drive_token') || '';
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

export const uploadFileToGoogleDrive = async (accessToken: string, file: File): Promise<string> => {
  if (!accessToken) {
    throw new Error("Le connecteur Google Drive n'est pas configuré ou est inactif. Veuillez l'activer dans les réglages.");
  }

  // Support mock for testing/preview environments if necessary
  if (accessToken.startsWith('mock_')) {
    return `https://drive.google.com/file/d/mock_${Date.now()}/view`;
  }

  try {
    // 1. Find or create the Defibeo folder
    const folderId = await getOrCreateDefibeoFolder(accessToken);

    // 2. Upload file directly inside Defibeo folder
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
        throw new Error("Votre session Google Drive a expiré ou vos identifiants d'accès ne sont plus valides. Veuillez désactiver puis réactiver le connecteur Google Drive dans l'onglet des réglages de l'application pour renouveler vos autorisations d'accès.");
      }

      throw new Error(`Échec de l'upload sur Google Drive : ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    
    // 3. Make file accessible by link to avoid permission request dialogs for viewers
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
      throw new Error("Session Google Drive expirée ou invalide. Veuillez désactiver puis réactiver le connecteur Google Drive dans les réglages pour renouveler vos accès.");
    }
    throw err;
  }
};
