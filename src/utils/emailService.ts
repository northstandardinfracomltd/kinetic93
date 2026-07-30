import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Default Apps Script URL provided by the developer
const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzx6ElCSC7A5dWvE5fdBJMAQOmYbsnjVs1ttQ0g9ktrJtln7ei9Pl3Em3ine99CrI0/exec';
const DEPRECATED_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyNparlDkMMyWTh8hRSAPIAStMC8h9phwlUogleK6rntYwM6QUjWqQoK_Ulpzoqpd7aoQ/exec';

// Shared cached URL
let cachedUrl: string | null = null;

/**
 * Fetches the Google Apps Script Web App URL from environment variables, or Firestore,
 * to allow dynamic configuration. Falls back to localStorage, and finally the default hardcoded URL.
 */
export async function getAppsScriptUrl(): Promise<string> {
  // 1. Try env variable first
  const envUrl = (import.meta as any).env?.VITE_APPS_SCRIPT_URL;
  if (envUrl && envUrl.trim() && envUrl.trim() !== DEPRECATED_APPS_SCRIPT_URL) {
    return envUrl.trim();
  }

  if (cachedUrl && cachedUrl !== DEPRECATED_APPS_SCRIPT_URL) return cachedUrl;

  // 2. Try localStorage cache first for instant retrieval (0ms)
  const localSaved = localStorage.getItem('defib_global_apps_script_url');
  if (localSaved && localSaved.trim() && localSaved.trim() !== DEPRECATED_APPS_SCRIPT_URL) {
    cachedUrl = localSaved.trim();
    
    // Trigger a background silent update of Firestore cache without blocking
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      const docRef = doc(db, 'appData', 'global_email_config');
      getDoc(docRef).then(snap => {
        if (snap.exists()) {
          const data = snap.data();
          if (data && data.url && data.url.trim() !== DEPRECATED_APPS_SCRIPT_URL) {
            const freshUrl = data.url.trim();
            localStorage.setItem('defib_global_apps_script_url', freshUrl);
            cachedUrl = freshUrl;
          }
        }
      }).catch(() => {});
    }
    
    return cachedUrl;
  }
  
  // 3. Fallback to quick server check with a 2-second timeout
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const docRef = doc(db, 'appData', 'global_email_config');
      const docPromise = getDoc(docRef);
      const timeoutPromise = new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000));
      
      const snap = await Promise.race([docPromise, timeoutPromise]) as any;
      if (snap && snap.exists()) {
        const data = snap.data();
        if (data && data.url && data.url.trim() !== DEPRECATED_APPS_SCRIPT_URL) {
          cachedUrl = data.url.trim();
          localStorage.setItem('defib_global_apps_script_url', cachedUrl);
          return cachedUrl;
        }
      }
    } catch (error) {
      console.log('[Email Service] Silent notice: Fetching global_email_config from Firestore timed out or offline, using fallback.');
    }
  }

  // Fallback to developer default URL
  return DEFAULT_APPS_SCRIPT_URL;
}

/**
 * Saves the Google Apps Script Web App URL to Firestore so all tenants/users share it.
 */
export async function saveAppsScriptUrl(url: string): Promise<void> {
  const cleanUrl = url.trim();
  cachedUrl = cleanUrl;
  localStorage.setItem('defib_global_apps_script_url', cleanUrl);

  try {
    const docRef = doc(db, 'appData', 'global_email_config');
    await setDoc(docRef, { url: cleanUrl });
  } catch (error) {
    console.warn('Error saving global_email_config to firestore:', error);
  }
}

/**
 * Core helper that performs the fetch post request to the user's Google Apps Script backend.
 */
export async function sendScriptEmail(payload: {
  to: string;
  subject: string;
  body: string;
  replyTo: string;
}): Promise<boolean> {
  try {
    const scriptUrl = await getAppsScriptUrl();
    if (!scriptUrl) {
      console.warn(`[Email Service] Apps Script URL empty. Skip email: "${payload.subject}" to "${payload.to}"`);
      return false;
    }

    console.log(`[Email Service] Dispatching payload to Apps Script:`, scriptUrl, payload);

    await fetch(scriptUrl, {
      method: 'POST',
      mode: 'no-cors', // standard Apps Script POST request requires no-cors when executed from browser sandbox
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    return true;
  } catch (error) {
    console.warn('[Email Service] Warning: sendScriptEmail fetch completed with warning (usually due to CORS or sandbox limits):', error);
    return false;
  }
}

// ==========================================
// THE 9 SYSTEM EMAILS REQUESTED BY THE USER
// ==========================================

/**
 * EMAIL 1: INSCRIPTION (Delayed by 15 minutes)
 * When a user registers (CRÉER UN COMPTE), send a confirmation email containing credentials.
 * Scheduled for 15 minutes in the future.
 */
export async function triggerEmail1Inscription(emailEntreprise: string, passwordHexOrPlain: string): Promise<boolean> {
  const tenantId = localStorage.getItem('defib_tenant_id') || 'demo';
  const savedOption = localStorage.getItem(`defib_${tenantId}_enable_auto_emails`);
  if (savedOption === 'Non') {
    console.log(`[Email 1] Inscription email to ${emailEntreprise} skipped because automatic emails are disabled.`);
    return false;
  }
  console.log(`[Email 1] Sending welcome/inscription email to ${emailEntreprise} immediately.`);
  const subject = "Défibeo : Confirmation pour l’ouverture de votre environnement.";
  const body = `Bravo pour l’ouverture de votre environnement Défibeo! Pour rappel, pour vous connecter, accédez à https://defibeo.com/ et cliquez sur Connexion, ensuite veuillez utiliser votre email ${emailEntreprise} ainsi que le mot de passe que vous avez ajouté.`;
  
  return sendScriptEmail({
    to: `defibeo@gmail.com, ${emailEntreprise}`,
    subject,
    body,
    replyTo: "defibeo@gmail.com"
  });
}

/**
 * EMAIL 2: INFORMATIONS DE CONNEXION POUR LE TECHNICIEN
 * Triggered when a new Technicien member is added in settings.
 */
export async function triggerEmail2TechnicianConnexion(
  emailTechnicien: string, 
  pinCode: string, 
  companyName: string, 
  companyEmail: string
): Promise<boolean> {
  const subject = `Défibeo : Informations de connexion à votre compte Technicien pour ${companyName}.`;
  const body = `${companyName} vous a ajouté en tant que membre technicien. Utilisez l’email ${emailTechnicien} et le mot de passe ${pinCode} pour vous connecter. Accédez à defibeo.com puis cliquez sur Connexion en tant que Technicien.`;
  
  return sendScriptEmail({
    to: `defibeo@gmail.com, ${emailTechnicien}`,
    subject,
    body,
    replyTo: companyEmail || "defibeo@gmail.com"
  });
}

/**
 * EMAIL 3: INFORMATIONS DE CONNEXION POUR L’ADMIN USER
 * Triggered when a new Administrateur member is added in settings.
 */
export async function triggerEmail3AdminConnexion(
  emailAdmin: string, 
  pinCode: string, 
  companyName: string, 
  companyEmail: string
): Promise<boolean> {
  const subject = `Défibeo : Informations de connexion à votre compte utilisateur pour ${companyName}.`;
  const body = `${companyName} vous a ajouté en tant que membre administrateur. Utilisez l’email ${emailAdmin} et le mot de passe ${pinCode} pour vous connecter. Accédez à defibeo.com puis cliquez sur Connexion en tant que Admin.`;
  
  return sendScriptEmail({
    to: `defibeo@gmail.com, ${emailAdmin}`,
    subject,
    body,
    replyTo: companyEmail || "defibeo@gmail.com"
  });
}

/**
 * EMAIL FOR NEW MEMBER ADDITION
 * Sends the customized greeting and credentials to any added collaborator.
 */
export async function triggerEmailNewMemberAdded(
  userEmail: string,
  passwordCode: string,
  companyName: string,
  companyEmail: string
): Promise<boolean> {
  const subject = `${companyName} : Vous avez été ajouté au logiciel Défibeo.`;
  const body = `Bonjour, vous avez été ajouté au logiciel Défibeo de ${companyName}. Pour y accéder, ouvrez https://defibeo.deroesch.com/ et connectez-vous en tant que Admin, avec votre email ${userEmail}, et le mot de passe: ${passwordCode}.`;

  return sendScriptEmail({
    to: `defibeo@gmail.com, ${userEmail}`,
    subject,
    body,
    replyTo: companyEmail || "defibeo@gmail.com"
  });
}

/**
 * EMAIL 4: NOUVEAU SIGNALEMENT FORMULAIRE PUBLIQUE
 * Triggered when a public user submits an incident report for a defibrillator.
 */
export async function triggerEmail4Signalement(
  defibIdentifiant: string, 
  companyName: string, 
  companyEmail: string
): Promise<boolean> {
  const subject = "Défibeo : Vous avez reçu un message.";
  const body = `${companyName}, vous avez reçu un signalement ou une demande d’un client ou d’un passant concernant le défibrillateur ${defibIdentifiant}, accédez à l’onglet CRM pour en savoir plus.`;
  
  return sendScriptEmail({
    to: `defibeo@gmail.com, ${companyEmail}`,
    subject,
    body,
    replyTo: "defibeo@gmail.com"
  });
}

/**
 * EMAIL 5: AVISAGE FSM DESTINÉ AUX CLIENTS
 * Triggered immediately for each defibrillator/mission in the tour when tour status becomes "À faire".
 */
export async function triggerEmail5AvisageFSM(
  clientEmail: string, 
  defibIdentifiant: string, 
  companyName: string, 
  companyEmail: string, 
  periodDate: string,
  pinCode?: string,
  estimatedSlot?: string
): Promise<boolean> {
  const tenantId = localStorage.getItem('defib_tenant_id') || 'demo';
  const savedOption = localStorage.getItem(`defib_${tenantId}_enable_auto_emails`);
  if (savedOption === 'Non') {
    console.log(`[Email 5] Avisage FSM to ${clientEmail} skipped because automatic emails are disabled.`);
    return false;
  }
  const subject = `${companyName} : Nouvelle visite prévue pour votre matériel.`;
  const pinText = pinCode ? `\n\nVoici le code pin à fournir au technicien pour signer la visite sur site : ${pinCode}\n` : '';
  const slotStr = estimatedSlot || '09:00am';
  const body = `${companyName} a prévu une visite sur votre matériel ${defibIdentifiant} le ${periodDate} (estimé) à ${slotStr} (estimé).${pinText}\nSi vous souhaitez en savoir plus ou vous opposer à l’intervention, répondez simplement au présent email.`;
  
  return sendScriptEmail({
    to: `defibeo@gmail.com, ${clientEmail}`,
    subject,
    body,
    replyTo: companyEmail || "defibeo@gmail.com"
  });
}

/**
 * EMAIL 6: RAPPORT SUITE À UNE INTERVENTION AU CLIENT
 * Triggered when a technician submits a mission intervention report/log sheet.
 */
export async function triggerEmail6RapportIntervention(
  clientEmail: string, 
  defibIdentifiant: string, 
  dateStr: string, 
  companyName: string, 
  companyEmail: string
): Promise<boolean> {
  const tenantId = localStorage.getItem('defib_tenant_id') || 'demo';
  const savedOption = localStorage.getItem(`defib_${tenantId}_enable_auto_emails`);
  if (savedOption === 'Non') {
    console.log(`[Email 6] Rapport Intervention to ${clientEmail} skipped because automatic emails are disabled.`);
    return false;
  }
  const subject = `${companyName} : Document relatif à votre matériel.`;
  const enableAvis = localStorage.getItem(`defib_${tenantId}_enable_satisfaction_avis`) !== 'Non';
  const body = `Un document a été généré pour l’intervention effectuée sur votre matériel ${defibIdentifiant} le ${dateStr}. Connectez-vous sur votre portail client https://defibeo.deroesch.com/ pour le télécharger.${enableAvis ? ' Nous vous invitons à laisser un avis sur : https://defibeo.deroesch.com/satisfaction/' : ''}`;
  
  return sendScriptEmail({
    to: `defibeo@gmail.com, ${clientEmail}`,
    subject,
    body,
    replyTo: companyEmail || "defibeo@gmail.com"
  });
}

/**
 * EMAIL 7: RÉPONSE ENVOYÉE DEPUIS LE CRM POUR LE CLIENT
 * Triggered when replying to an incident ticket via CRM "Envoyer la réponse".
 */
export async function triggerEmail7CrmReply(
  crmSenderEmail: string, 
  replyText: string, 
  companyName: string, 
  companyEmail: string
): Promise<boolean> {
  const subject = `${companyName} : Vous avez reçu une réponse.`;
  const body = replyText;
  
  return sendScriptEmail({
    to: `defibeo@gmail.com, ${crmSenderEmail}`,
    subject,
    body,
    replyTo: companyEmail || "defibeo@gmail.com"
  });
}

/**
 * EMAIL 8: NOUVELLE TOURNÉE POUR LE TECHNICIEN
 * Triggered immediately when a tour status becomes "À faire" for the assigned technician.
 */
export async function triggerEmail8NouvelleTourneeTech(
  techEmail: string, 
  tourName: string, 
  periodDate: string, 
  companyName: string, 
  companyEmail: string
): Promise<boolean> {
  const subject = `${companyName} : Vous avez été attribué à une nouvelle tournée.`;
  const body = `Vous avez été attribué a la tournée ${tourName} pour la période du ${periodDate} par ${companyName}, ouvrez votre webapp pour en savoir plus.`;
  
  return sendScriptEmail({
    to: `defibeo@gmail.com, ${techEmail}`,
    subject,
    body,
    replyTo: companyEmail || "defibeo@gmail.com"
  });
}

/**
 * EMAIL 9: RAPPEL MENSUEL AUTO-VIGILANCE POUR LE CLIENT/CONTACT
 * Can be run manually or automatically.
 */
export async function triggerEmail9RappelMensuelVigilance(
  clientEmail: string, 
  defibIdentifiant: string, 
  companyName: string, 
  companyEmail: string
): Promise<boolean> {
  const subject = `${companyName} : Vérification mensuelle auto-vigilance défibrillateur.`;
  const body = `Bonjour, nous vous invitons a vérifier la disponibilité technique et d’accessibilité de votre défibrillateur ${defibIdentifiant}.`;
  
  return sendScriptEmail({
    to: `defibeo@gmail.com, ${clientEmail}`,
    subject,
    body,
    replyTo: companyEmail || "defibeo@gmail.com"
  });
}

/**
 * CLIENT AUTO-VIGILANCE LOOPER
 * Finds all active defibrillators that have 'rappelMensuelAuto' === 'Oui'
 * and dispatches Email 9 to each of their clients.
 * Can be run automatically on the 15th of the month or manually from the dashboard.
 */
export async function runMonthlyVigilanceCampaign(
  defibrillateurs: any[], 
  clients: any[], 
  companyInfo: { name: string, email: string }
): Promise<number> {
  let count = 0;
  
  for (const defib of defibrillateurs) {
    if (defib.rappelMensuelAuto === 'Oui') {
      const matchingClient = clients.find(c => c.id === defib.clientId);
      const clientEmail = defib.emailSite || matchingClient?.email || matchingClient?.emailSite;
      
      if (clientEmail && clientEmail.trim()) {
        const ok = await triggerEmail9RappelMensuelVigilance(
          clientEmail.trim(),
          defib.identifiant,
          companyInfo.name,
          companyInfo.email
        );
        if (ok) count++;
      }
    }
  }
  
  return count;
}

/**
 * GOOGLE APPS SCRIPT CODE TO DEPLOY (for reference & ease of use):
 * 
 * ```javascript
 * function doPost(e) {
 *   try {
 *     var data = JSON.parse(e.postData.contents);
 *     var to = data.to;
 *     var subject = data.subject || "Ouverture de votre environnement Défibeo.";
 *     var body = data.body;
 *     var replyTo = data.replyTo || "support@defibeo.com";
 *     
 *     MailApp.sendEmail({
 *       to: to,
 *       subject: subject,
 *       body: body,
 *       replyTo: replyTo
 *     });
 *     
 *     return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
 *       .setMimeType(ContentService.MimeType.JSON);
 *   } catch (error) {
 *     return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
 *       .setMimeType(ContentService.MimeType.JSON);
 *   }
 * }
 * ```
 */
