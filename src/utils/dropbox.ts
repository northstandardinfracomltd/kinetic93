import { jsPDF } from "jspdf";

/**
 * Generates a professional PDF from a report object using jsPDF.
 */
export function generateReportPDF(report: any): Uint8Array {
  const doc = new jsPDF();
  const snapshot = report.defibSnapshot || {};

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(report.title || `Rapport d'intervention - ${snapshot.categorie || ''}`, 10, 20);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Conservez et archivez consciencieusement ce certificat technique GMAO.", 10, 28);

  doc.setLineWidth(0.5);
  doc.line(10, 32, 200, 32);

  // Section 1: Equipment Details
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("1. EQUIPEMENT CONCERNE", 10, 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let y = 48;
  doc.text(`Categorie: ${snapshot.categorie || '-'}`, 12, y); y += 6;
  doc.text(`Marque: ${snapshot.marque || '-'}`, 12, y); y += 6;
  doc.text(`Modele: ${snapshot.modele || '-'}`, 12, y); y += 6;
  doc.text(`Numero de serie: ${snapshot.numeroSerie || '-'}`, 12, y); y += 6;
  doc.text(`Identifiant Defibeo: ${snapshot.identifiant || report.defibIdentifiant || '-'}`, 12, y); y += 10;

  // Section 2: Intervention Details
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("2. DETAILS DE L'INTERVENTION", 10, y); y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Date de l'intervention: ${report.date || '-'}`, 12, y); y += 6;
  doc.text(`Technicien: ${report.technicien || '-'}`, 12, y); y += 6;
  
  const comments = report.commentaires || '';
  if (comments) {
    doc.text(`Commentaire / Diagnostic:`, 12, y); y += 6;
    const splitComments = doc.splitTextToSize(comments, 180);
    doc.text(splitComments, 14, y);
    y += (splitComments.length * 5) + 6;
  } else {
    doc.text(`Commentaire / Diagnostic: -`, 12, y); y += 12;
  }

  // Section 3: Status and Signatures
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("3. STATUT ET VALIDATION", 10, y); y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Statut final: ${snapshot.conforme ? 'Conforme / Operationnel' : 'Non-conforme'}`, 12, y); y += 12;

  doc.text("Signatures:", 10, y); y += 8;

  doc.setFont("helvetica", "italic");
  doc.text("Signature du Technicien: [Signe electroniquement]", 12, y); y += 6;
  doc.text("Signature du Client: [Signe electroniquement]", 12, y);

  // Return binary
  return new Uint8Array(doc.output("arraybuffer"));
}

/**
 * Assures the /Defibeo folder and optional file request exists on Dropbox.
 */
export async function ensureDropboxSetup(accessToken: string): Promise<void> {
  if (!accessToken || !accessToken.trim()) {
    throw new Error("Token d'accès Dropbox vide.");
  }

  // Try checking metadata of "/Defibeo" folder first
  const metaRes = await fetch("/api/dropbox/files/get_metadata", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ path: "/Defibeo" })
  });

  if (metaRes.ok) {
    // Already exists, return
    return;
  }

  // Folder does not exist or fetch failed. Try creating it.
  const createRes = await fetch("/api/dropbox/files/create_folder_v2", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ path: "/Defibeo", autorename: false })
  });

  if (!createRes.ok) {
    const errorBody = await createRes.text();
    // Check if it's already a path conflict (meaning folder exists now)
    if (errorBody.includes("path/conflict")) {
      return;
    }
    throw new Error(`Impossible de créer le dossier '/Defibeo'. Code: ${createRes.status}. Détail: ${errorBody}`);
  }

  // Now create the file request inside "/Defibeo" as requested: "file_requests/create"
  try {
    await fetch("/api/dropbox/file_requests/create", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: "Defibeo",
        destination: "/Defibeo",
        open: true
      })
    });
  } catch (err) {
    // Fail silently for file_requests creation if folder succeeded, since some tokens may lack file_request scopes
    console.warn("La création de la requête de fichier a échoué, mais le dossier a été créé:", err);
  }
}

/**
 * Uploads data to Dropbox inside the /Defibeo folder.
 */
export async function uploadToDropbox(
  accessToken: string,
  fileName: string,
  fileData: Uint8Array | string
): Promise<void> {
  if (!accessToken || !accessToken.trim()) {
    throw new Error("Token d'accès Dropbox vide.");
  }

  // First, verify the folder exists (ensures it is run "une seule fois si le fichier n'existe pas")
  await ensureDropboxSetup(accessToken);

  const cleanFileName = fileName.replace(/[^a-zA-Z0-9_\.-]/g, "_");
  const path = `/Defibeo/${cleanFileName}`;

  // Use files/upload endpoint via proxy
  const apiArg = JSON.stringify({
    path,
    mode: "overwrite",
    autorename: true,
    mute: false,
    strict_conflict: false
  });

  const uploadRes = await fetch("/api/dropbox/files/upload", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Dropbox-API-Arg": apiArg,
      "Content-Type": "application/octet-stream"
    },
    body: fileData
  });

  if (!uploadRes.ok) {
    const errorBody = await uploadRes.text();
    throw new Error(`Échec de l'upload Dropbox de '${fileName}'. Code: ${uploadRes.status}. Détail: ${errorBody}`);
  }
}
