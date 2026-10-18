import { jsPDF } from "jspdf";

/**
 * Generates a professional PDF from a report object using jsPDF.
 */
export function generateReportPDF(report: any): Uint8Array {
  const doc = new jsPDF();
  const snapshot = report.defibSnapshot || {};

  const docTitle = report.title || report.reportTitle || `Rapport d'intervention - ${report.typeMateriel || snapshot.categorie || 'Défibrillateur'}`;
  const categorie = report.typeMateriel || snapshot.categorie || 'Défibrillateur';
  const modele = report.modeleDefib || snapshot.modele || snapshot.modeleId || '-';
  const numeroSerie = report.numeroSerie || snapshot.numeroSerie || '-';
  const identifiant = report.defibIdentifiant || report.identifiant || snapshot.identifiant || '-';
  const clientName = report.clientName || snapshot.clientName || snapshot.clientId || '-';
  const dateIntervention = report.horodatageEntrant || report.date || '-';
  const dateCloture = report.horodatageCloture || report.endTimeStamp || '-';
  const technicien = report.techName || report.technicien || '-';
  const comments = report._s12_commentaireGlobal || report.commentaireGlobal || report.commentaires || snapshot.commentaire || '';
  const isConforme = (report._s12_defibConforme || report.conforme || snapshot.conforme) === 'Oui' || snapshot.conforme === true;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(docTitle, 10, 20);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Conservez et archivez consciencieusement ce certificat technique GMAO.", 10, 28);

  doc.setLineWidth(0.5);
  doc.line(10, 32, 200, 32);

  // Section 1: Equipment & Client Details
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("1. INFORMATIONS GENERALES & EQUIPEMENT", 10, 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let y = 48;
  doc.text(`Client: ${clientName} (ID: ${report.clientId || snapshot.clientId || '-'})`, 12, y); y += 6;
  doc.text(`Contact site: ${report.contactSite || snapshot.nomPrenomSite || '-'} | Tel: ${report.telephoneContact || snapshot.telephoneSite || '-'}`, 12, y); y += 6;
  doc.text(`Adresse: ${[report.voie || snapshot.numVoie, report.cp || snapshot.cp, report.ville || snapshot.ville].filter(Boolean).join(' ') || '-'}`, 12, y); y += 6;
  doc.text(`Categorie: ${categorie} | Modele: ${modele}`, 12, y); y += 6;
  doc.text(`Identifiant: ${identifiant} | Numero de serie: ${numeroSerie}`, 12, y); y += 6;
  doc.text(`Reference intervention: ${report.interventionReference || '-'} | Mission: ${report.siteMission || report.missionSite || 'DEPLACEMENT'}`, 12, y); y += 10;

  // Section 2: Consommables & Verifications
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("2. CONSOMMABLES & VERIFICATIONS TECHNIQUES", 10, y); y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Batterie: ${report._s8_modeleBatterie || snapshot.modeleBatterieId || '-'} | Lot: ${report._s8_lotBatterie || snapshot.lotBatterie || '-'} | Peremption: ${report._s8_peremptionBatterie || snapshot.peremptionBatterie || '-'}`, 12, y); y += 6;
  doc.text(`Electrode A: ${report._s6_modeleElectrodeA || snapshot.modeleElectrodeAId || '-'} | Lot: ${report._s6_lotElectrodeA || snapshot.lotElectrodeA || '-'} | Peremption: ${report._s6_peremptionElectrodeA || snapshot.peremptionElectrodeA || '-'}`, 12, y); y += 6;
  doc.text(`Electrode P: ${report._s7_modeleElectrodeP || snapshot.modeleElectrodePId || '-'} | Lot: ${report._s7_lotElectrodeP || snapshot.lotElectrodeP || '-'} | Peremption: ${report._s7_peremptionElectrodeP || snapshot.peremptionElectrodeP || '-'}`, 12, y); y += 6;
  doc.text(`Coffret: ${report._s9_modeleCoffret || snapshot.modeleCoffretId || '-'} | Kit Secours Peremption: ${report.kitPeremption || snapshot.peremptionTrousse || '-'}`, 12, y); y += 6;
  doc.text(`Conforme a l'arrivee: ${report.techConformeArrivee || '-'} | Voyant: ${report.techVoyantConforme || '-'} | Nettoyage: ${report.techNettoyage || '-'}`, 12, y); y += 10;

  // Section 3: Intervention Details
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("3. DIAGNOSTIC ET CLOTURE", 10, y); y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Horodatage entrant: ${dateIntervention} | Cloture: ${dateCloture}`, 12, y); y += 6;
  doc.text(`Technicien: ${technicien}`, 12, y); y += 6;
  
  if (comments) {
    doc.text(`Commentaire / Diagnostic:`, 12, y); y += 6;
    const splitComments = doc.splitTextToSize(String(comments), 180);
    doc.text(splitComments, 14, y);
    y += (splitComments.length * 5) + 6;
  } else {
    doc.text(`Commentaire / Diagnostic: -`, 12, y); y += 10;
  }

  // Section 4: Status and Signatures
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("4. STATUT ET VALIDATION", 10, y); y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Statut final: ${isConforme ? 'Conforme / Operationnel (Oui)' : 'Non-conforme (Non)'}`, 12, y); y += 10;

  doc.text("Signatures:", 10, y); y += 6;

  doc.setFont("helvetica", "italic");
  doc.text(`Signature du Technicien: ${report.techSignature ? '[Signe electroniquement]' : '-'}`, 12, y); y += 6;
  doc.text(`Signature du Client: ${report.clientPinCode ? '[Valide electroniquement]' : '[Signe electroniquement]'}`, 12, y);

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
