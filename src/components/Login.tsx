import React, { useState, useEffect } from 'react';
import { AlertCircle, ShieldCheck, CheckCircle, Send, CreditCard } from 'lucide-react';
import { 
  registerNewTenant, 
  loginTenantAdmin, 
  getRegisteredTenants, 
  fetchCollectionFromFirestore,
  fetchRawCollectionFromFirestore,
  findTenantAndDefibGlobally,
  purgeAllLocalEnvironmentCaches,
  saveCollectionToFirestore
} from '../firebase';
import { triggerEmail1Inscription, triggerEmail4Signalement, triggerAuthCodeEmail, getAppsScriptUrl } from '../utils/emailService';
import { updateLoginSessionSlug } from '../utils/sessionSlug';
import TopBarProgress from './TopBarProgress';
import { setCurrentIp, logUserLogin } from '../services/suspiciousActivityService';
import { getLanguage, setLanguage } from '../utils/translate';

interface LoginProps {
  onLoginSuccess: (email: string, name: string, tenantId: string, role?: string, clientIp?: string) => void;
}

const normalizeLoginLang = (raw?: string | null): 'Français' | 'English' | 'Deutsch' | 'Português' | 'Español' => {
  if (!raw) return 'Français';
  const lower = raw.trim().toLowerCase();
  if (lower.startsWith('en') || lower.includes('english')) return 'English';
  if (lower.startsWith('de') || lower.includes('deutsch')) return 'Deutsch';
  if (lower.startsWith('pt') || lower.includes('português') || lower.includes('portugues')) return 'Português';
  if (lower.startsWith('es') || lower.includes('español') || lower.includes('espanol')) return 'Español';
  if (lower.startsWith('fr') || lower.includes('français') || lower.includes('francais')) return 'Français';
  return 'Français';
};

const ApplePetalsLoader = () => (
  <svg
    className="h-5 w-5 text-white animate-spin"
    viewBox="0 0 24 24"
    fill="none"
  >
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeDasharray="40 20"
      strokeLinecap="round"
      className="opacity-90"
    />
  </svg>
);

const translations = {
  'Français': {
    welcomeLine1: "Bienvenue",
    welcomeLine2: "Entrez votre email pour continuer",
    asRolePrefix: "En tant que",
    optionsLabel: "Options",
    quitLabel: "Quitter",
    assistanceLabel: "Assistance",
    systemOptionsAria: "Options système",
    chooseRoleAria: "Choisir le type d'utilisateur",
    chooseLangAria: "Choisir la langue",
    emailInputPlaceholder: "exemple@email.com",
    connectBtn: "Se connecter",
    keepSession: "Maintenir la session",
    reportAlertTitle: "Signaler un problème avec un défibrillateur, envoyer un message en tant que client ou passant.",
    continue: "Continuer",
    login: "Connexion",
    registerTab: "Créer un compte",
    loginAs: "Connexion en tant que",
    admin: "Admin",
    client: "Client",
    technicien: "Technicien",
    email: "Adresse email",
    emailPlace: "Ex: contact@info.com",
    password: "Mot de passe",
    passwordPlace: "Ex: 123ABC%",
    loginBtn: "Connexion",
    reqSubmittedTitle: "Environnement Activé !",
    reqSubmittedDesc: "Félicitations ! Votre nouvel environnement Défibeo a été créé et activé avec succès. Vous êtes le Super Administrateur de cet espace. Vous pouvez dès à présent vous connecter.",
    backToLogin: "Retour à la connexion",
    configDesc: "Configurez et activez votre nouvel environnement Défibeo pour votre entreprise. Si vous avez besoin d’aide, veuillez",
    contactSupport: "contacter l’assistance",
    companyName: "Nom entreprise",
    companyNamePlace: "Ex: Medical360",
    softwareId: "Code Environnement / Identifiant Logiciel",
    softwareIdPlace: "Ex: D18, D19...",
    companyEmail: "Email entreprise",
    companyEmailPlace: "Ex: contact@medical360.com",
    softwareName: "Nom du logiciel",
    softwareNamePlace: "Ex: App360",
    companyPhone: "Téléphone (mobile)",
    companyPhonePlace: "06 12 34 56 78",
    adminName: "Nom et prénom",
    adminNamePlace: "Ex: Noor Jakub",
    adminEmail: "Email",
    adminEmailPlace: "Ex: n.jakub@medical360.com",
    adminPassword: "Mot de passe",
    adminPasswordPlace: "Ex: 123ABC%",
    selectLang: "Langue Logiciel",
    superAdminInfo: "Créez vos informations pour le compte super administrateur, il s'agit du compte qui est parent de tous les autres comptes.",
    activateSub: "Activer l’abonnement",
    paymentDisclaimer: "Vous paierez aujourd'hui le premier mois de votre abonnement par carte bancaire ou PayPal pour activer votre profil super-admin. Le frais unique de déploiement de votre environnement, quant à lui, est payé par virement bancaire ; une facture vous sera envoyée sous 1 à 3 jours. En continuant, vous acceptez nos ",
    eula: "conditions EULA",
    disclaimerMid1: ", notre ",
    privacyPolicy: "politique de gestion des données",
    disclaimerMid2: ", et confirmez avoir lu les informations relatives à notre ",
    hdsCertification: "certification HDS",
    returnToSite: "Retour au site",
    reportTitle: "Formulaire",
    close: "Fermer",
    reportSuccessTitle: "Signalement envoyé",
    reportSuccessDesc: "Merci pour votre assistance. Le mainteneur va intervenir rapidement.",
    messageSentSuccess: "Message envoyé avec succès.",
    reportDesc: "Veuillez remplir les informations concernant le défibrillateur ci-dessous (l'identifiant est obligatoire).",
    yourEmail: "Votre email",
    yourEmailPlace: "Ex: contact@mail.com.",
    defibIdValid: "Identifiant valide.",
    defibIdInvalid: "Identifiant invalide, vérifiez la saisie.",
    checkingId: "Vérification de l'identifiant...",
    defibId: "Identifiant Défibrillateur",
    defibIdPlace: "Ex: ABC1X123.",
    subject: "Objet",
    subjectPlace: "Ex: Défibrillateur endommagé.",
    message: "Message",
    messagePlace: "Description détaillée du signalement ou de la demande.",
    sending: "Envoi en cours...",
    send: "Envoyer",
    errorAdmin: "Identifiants Admin incorrects.",
    errorClient: "Identifiants Client incorrects.",
    errorTech: "Identifiants Technicien incorrects.",
    tooManyAttempts: "Trop de tentatives de connexion. Veuillez patienter avant de réessayer.",
    accountSuspended: "Votre compte est suspendu, contactez Défibeo pour réactiver votre environnement.",
    forgotPassword: "Mot de passe oublié",
    authCodeTitle: "Double Authentification",
    authCodeDesc: "Code de 6 caractères envoyé par email",
    authCodeConfirm: "Confirmer",
    authCodeInvalid: "Code d'authentification incorrect. Veuillez vérifier le code reçu.",
    resendAuthCode: "Réenvoyer",
    changeAccount: "Annuler",
    codeSentSuccess: "Code envoyé avec succès !",
    keepLoggedIn: "Maintenir la connexion.",
  },
  'English': {
    welcomeLine1: "Welcome",
    welcomeLine2: "Enter your email to continue",
    asRolePrefix: "As",
    optionsLabel: "Options",
    quitLabel: "Quit",
    assistanceLabel: "Support",
    systemOptionsAria: "System options",
    chooseRoleAria: "Choose user role",
    chooseLangAria: "Choose language",
    emailInputPlaceholder: "example@email.com",
    connectBtn: "Log in",
    keepSession: "Keep me signed in",
    reportAlertTitle: "Report a problem with a defibrillator, send a message as a client or bystander.",
    continue: "Continue",
    login: "Login",
    registerTab: "Create account",
    loginAs: "Login as",
    admin: "Admin",
    client: "Client",
    technicien: "Technician",
    email: "Email address",
    emailPlace: "e.g., contact@info.com",
    password: "Password",
    passwordPlace: "e.g., 123ABC%",
    loginBtn: "Login",
    reqSubmittedTitle: "Environment Activated!",
    reqSubmittedDesc: "Congratulations! Your new Défibeo environment has been successfully created and configured. You can now log in using your administrator account.",
    backToLogin: "Back to login",
    configDesc: "Configure and activate the new Défibeo software environment for your establishment. If you need help, please",
    contactSupport: "contact support",
    companyName: "Company Name",
    companyNamePlace: "e.g., Medical360",
    softwareId: "Environment Code / Software Identifier",
    softwareIdPlace: "e.g., D18, D19...",
    companyEmail: "Company Email",
    companyEmailPlace: "e.g., contact@medical360.com",
    softwareName: "Software Name",
    softwareNamePlace: "e.g., App360",
    companyPhone: "Phone (mobile)",
    companyPhonePlace: "+33 6 12 34 56 78",
    adminName: "Full Name",
    adminNamePlace: "e.g., Noor Jakub",
    adminEmail: "Email",
    adminEmailPlace: "e.g., n.jakub@medical360.com",
    adminPassword: "Password",
    adminPasswordPlace: "e.g., 123ABC%",
    selectLang: "Software Language",
    superAdminInfo: "Create your credentials for the super administrator account, this is the parent account of all other accounts.",
    activateSub: "Activate subscription",
    paymentDisclaimer: "Today you will pay the first month of your subscription by credit card or PayPal to activate your super-admin profile. The one-time deployment fee for your environment is paid by bank transfer; an invoice will be sent to you within 1 to 3 days. By continuing, you accept our ",
    eula: "EULA terms",
    disclaimerMid1: ", our ",
    privacyPolicy: "data management policy",
    disclaimerMid2: ", and confirm that you have read the information relative to our ",
    hdsCertification: "HDS certification",
    returnToSite: "Return to site",
    reportTitle: "Form",
    close: "Close",
    reportSuccessTitle: "Report sent",
    reportSuccessDesc: "Thank you for your assistance. The maintainer will intervene quickly.",
    messageSentSuccess: "Message sent successfully.",
    reportDesc: "Please fill in the defibrillator details below (the ID is mandatory).",
    yourEmail: "Your email",
    yourEmailPlace: "e.g., contact@gmail.com",
    defibIdValid: "Valid ID.",
    defibIdInvalid: "Invalid ID, check your entry.",
    checkingId: "Checking ID...",
    defibId: "Defibrillator ID",
    defibIdPlace: "e.g., DEFIB-2026-PAU.",
    subject: "Subject",
    subjectPlace: "e.g., Red light flashing / Low battery.",
    message: "Message",
    messagePlace: "Describe the observed problem precisely...",
    sending: "Sending...",
    send: "Send",
    errorAdmin: "Incorrect Admin credentials.",
    errorClient: "Incorrect Client credentials.",
    errorTech: "Incorrect Technician credentials.",
    tooManyAttempts: "Too many login attempts. Please wait before trying again.",
    accountSuspended: "Your account is suspended, contact Défibeo to reactivate your environment.",
    forgotPassword: "Forgot password",
    authCodeTitle: "Two-Factor Authentication",
    authCodeDesc: "6-character code sent by email",
    authCodeConfirm: "Confirm",
    authCodeInvalid: "Incorrect authentication code. Please check the code received.",
    resendAuthCode: "Resend",
    changeAccount: "Cancel",
    codeSentSuccess: "Code sent successfully!",
    keepLoggedIn: "Keep me signed in.",
  },
  'Deutsch': {
    welcomeLine1: "Willkommen",
    welcomeLine2: "Geben Sie Ihre E-Mail-Adresse ein, um fortzufahren",
    asRolePrefix: "Als",
    optionsLabel: "Optionen",
    quitLabel: "Beenden",
    assistanceLabel: "Support",
    systemOptionsAria: "Systemoptionen",
    chooseRoleAria: "Benutzertyp wählen",
    chooseLangAria: "Sprache wählen",
    emailInputPlaceholder: "beispiel@email.com",
    connectBtn: "Anmelden",
    keepSession: "Angemeldet bleiben",
    reportAlertTitle: "Melden Sie ein Problem mit einem Defibrillator, senden Sie eine Nachricht als Kunde oder Passant.",
    continue: "Fortfahren",
    login: "Anmeldung",
    registerTab: "Konto erstellen",
    loginAs: "Anmelden als",
    admin: "Admin",
    client: "Kunde",
    technicien: "Techniker",
    email: "E-Mail-Adresse",
    emailPlace: "z.B. contact@info.com",
    password: "Passwort",
    passwordPlace: "z.B. 123ABC%",
    loginBtn: "Anmelden",
    reqSubmittedTitle: "Anfrage registriert",
    reqSubmittedDesc: "Ihre Anfrage zur Erstellung einer neuen Defibeo-Umgebung und Ihre Aktivierung wurden erfolgreich registriert. Unser Support konfiguriert Ihren Bereich innerhalb von 24 Stunden.",
    backToLogin: "Zurück zur Anmeldung",
    configDesc: "Richten Sie die neue Defibeo-Softwareumgebung für Ihre Einrichtung ein und aktivieren Sie sie. Wenn Sie Hilfe benötigen, wenden Sie sich bitte an den",
    contactSupport: "Kundendienst",
    companyName: "Firmenname",
    companyNamePlace: "z.B. Medical360",
    softwareId: "Umgebungscode / Software-Kennung",
    softwareIdPlace: "z.B. D18, D19...",
    companyEmail: "Firmen-E-Mail",
    companyEmailPlace: "z.B. contact@medical360.com",
    softwareName: "Softwarename",
    softwareNamePlace: "z.B. App360",
    companyPhone: "Telefon (Mobil)",
    companyPhonePlace: "017 12 34 56 78",
    adminName: "Vor- & Nachname",
    adminNamePlace: "z.B. Noor Jakub",
    adminEmail: "E-Mail",
    adminEmailPlace: "z.B. n.jakub@medical360.com",
    adminPassword: "Passwort",
    adminPasswordPlace: "z.B. 123ABC%",
    selectLang: "Software-Sprache",
    superAdminInfo: "Erstellen Sie Ihre Anmeldedaten für das Super-Administrator-Konto. Dies ist das übergeordnete Konto aller anderen Konten.",
    activateSub: "Abonnement aktivieren",
    paymentDisclaimer: "Sie zahlen heute den ersten Monat Ihres Abonnements per Kreditkarte oder PayPal, um Ihr Super-Admin-Profil zu aktivieren. Die einmalige Bereitstellungsgebühr für Ihre Umgebung wird per Banküberweisung bezahlt; eine Rechnung wird Ihnen innerhalb von 1 bis 3 Tagen zugesandt. Indem Sie fortfahren, akzeptieren Sie unsere ",
    eula: "EULA-Bedingungen",
    disclaimerMid1: ", unsere ",
    privacyPolicy: "Datenmanagement-Richtlinie",
    disclaimerMid2: ", und bestätigen Sie, dass Sie die Informationen zu unserer ",
    hdsCertification: "HDS-Zertifizierung",
    returnToSite: "Zurück zur Website",
    reportTitle: "Formular",
    close: "Schließen",
    reportSuccessTitle: "Bericht gesendet",
    reportSuccessDesc: "Vielen Dank für Ihre Unterstützung. Der Wartungstechniker wird sich schnell darum kümmern.",
    messageSentSuccess: "Nachricht erfolgreich gesendet.",
    reportDesc: "Bitte füllen Sie unten die Angaben zum Defibrillator aus (die ID ist obligatorisch).",
    yourEmail: "Ihre E-Mail",
    yourEmailPlace: "z.B. contact@gmail.com",
    defibIdValid: "Gültige ID.",
    defibIdInvalid: "Ungültige ID, bitte Eingabe prüfen.",
    checkingId: "ID wird überprüft...",
    defibId: "Defibrillator-ID",
    defibIdPlace: "z.B. DEFIB-2026-PAU.",
    subject: "Betreff",
    subjectPlace: "z.B. Rote Lampe leuchtet / Schwache Batterie.",
    message: "Nachricht",
    messagePlace: "Beschreiben Sie das festgestellte Problem genau...",
    sending: "Senden...",
    send: "Senden",
    errorAdmin: "Falsche Admin-Anmeldedaten.",
    errorClient: "Falsche Kunden-Anmeldedaten.",
    errorTech: "Falsche Techniker-Anmeldedaten.",
    tooManyAttempts: "Zu viele Anmeldeversuche. Bitte warten Sie, bevor Sie es erneut versuchen.",
    accountSuspended: "Ihr Konto ist gesperrt. Kontaktieren Sie Défibeo, um Ihre Umgebung zu reaktivieren.",
    forgotPassword: "Passwort vergessen",
    authCodeTitle: "Zwei-Faktor-Authentifizierung",
    authCodeDesc: "6-stelliger Code per E-Mail gesendet",
    authCodeConfirm: "Bestätigen",
    authCodeInvalid: "Ungültiger Authentifizierungscode. Bitte prüfen Sie den Code.",
    resendAuthCode: "Erneut senden",
    changeAccount: "Abbrechen",
    codeSentSuccess: "Code erfolgreich gesendet!",
    keepLoggedIn: "Angemeldet bleiben.",
  },
  'Português': {
    welcomeLine1: "Bem-vindo",
    welcomeLine2: "Insira o seu e-mail para continuar",
    asRolePrefix: "Como",
    optionsLabel: "Opções",
    quitLabel: "Sair",
    assistanceLabel: "Assistência",
    systemOptionsAria: "Opções do sistema",
    chooseRoleAria: "Escolher tipo de utilizador",
    chooseLangAria: "Escolher idioma",
    emailInputPlaceholder: "exemplo@email.com",
    connectBtn: "Iniciar sessão",
    keepSession: "Manter a sessão iniciada",
    reportAlertTitle: "Reporte um problema com um desfibrilhador, envie uma mensagem como cliente ou transeunte.",
    continue: "Continuar",
    login: "Entrar",
    registerTab: "Criar conta",
    loginAs: "Entrar como",
    admin: "Admin",
    client: "Cliente",
    technicien: "Técnico",
    email: "Endereço de e-mail",
    emailPlace: "Ex: contact@info.com",
    password: "Senha",
    passwordPlace: "Ex: 123ABC%",
    loginBtn: "Entrar",
    reqSubmittedTitle: "Pedido registrado",
    reqSubmittedDesc: "Seu pedido de criação de um novo ambiente Défibeo e sua ativação foram registrados com sucesso. Nosso suporte configurará seu espaço em até 24 horas.",
    backToLogin: "Voltar para o login",
    configDesc: "Configure e ative o novo ambiente de software Défibeo para o seu estabelecimento. Se precisar de ajuda, entre em",
    contactSupport: "contato com o suporte",
    companyName: "Nome da empresa",
    companyNamePlace: "Ex: Medical360",
    softwareId: "Código do Ambiente / Identificador do Software",
    softwareIdPlace: "Ex: D18, D19...",
    companyEmail: "E-mail da empresa",
    companyEmailPlace: "Ex: contact@medical360.com",
    softwareName: "Nome do Software",
    softwareNamePlace: "Ex: App360",
    companyPhone: "Telefone (celular)",
    companyPhonePlace: "912 345 678",
    adminName: "Nome completo",
    adminNamePlace: "Ex: Noor Jakub",
    adminEmail: "E-mail",
    adminEmailPlace: "Ex: n.jakub@medical360.com",
    adminPassword: "Senha",
    adminPasswordPlace: "Ex: 123ABC%",
    selectLang: "Idioma do Software",
    superAdminInfo: "Crie suas credenciais para a conta de super administrador, esta é a conta-mãe de todas as outras contas.",
    activateSub: "Ativar assinatura",
    paymentDisclaimer: "Hoje você pagará o primeiro mês de sua assinatura por cartão de crédito ou PayPal para ativar seu perfil de super-admin. A taxa única de implantação do seu ambiente é paga por transferência bancária; uma fatura será enviada em até 1 a 3 dias. Ao continuar, você aceita nossos ",
    eula: "termos do EULA",
    disclaimerMid1: ", nossa ",
    privacyPolicy: "política de gerenciamento de dados",
    disclaimerMid2: ", e confirma ter lido as informações relativas à nossa ",
    hdsCertification: "certificação HDS",
    returnToSite: "Voltar ao site",
    reportTitle: "Formulário",
    close: "Fechar",
    reportSuccessTitle: "Relatório enviado",
    reportSuccessDesc: "Obrigado pela sua assistência. O técnico de manutenção intervirá rapidamente.",
    messageSentSuccess: "Mensagem enviada com sucesso.",
    reportDesc: "Por favor, preencha os detalhes do desfibrilhador abaixo (o ID é obrigatório).",
    yourEmail: "Seu e-mail",
    yourEmailPlace: "Ex: contact@gmail.com",
    defibIdValid: "ID válido.",
    defibIdInvalid: "ID inválido, verifique a entrada.",
    checkingId: "Verificando ID...",
    defibId: "ID do Desfibrilhador",
    defibIdPlace: "Ex: DEFIB-2026-PAU.",
    subject: "Assunto",
    subjectPlace: "Ex: Luz vermelha acessa / Bateria fraca.",
    message: "Mensagem",
    messagePlace: "Descreva precisamente o problema observado...",
    sending: "Enviando...",
    send: "Enviar",
    errorAdmin: "Credenciais de administrador incorretas.",
    errorClient: "Credenciais de cliente incorretas.",
    errorTech: "Credenciais de técnico incorretas.",
    tooManyAttempts: "Muitas tentativas de login. Aguarde antes de tentar novamente.",
    accountSuspended: "Sua conta está suspensa, entre em contato com a Défibeo para reativar seu ambiente.",
    forgotPassword: "Esqueceu a senha",
    authCodeTitle: "Autenticação de Dois Fatores",
    authCodeDesc: "Código de 6 caracteres enviado por e-mail",
    authCodeConfirm: "Confirmar",
    authCodeInvalid: "Código de autenticação incorreto. Verifique o código recebido.",
    resendAuthCode: "Reenviar",
    changeAccount: "Cancelar",
    codeSentSuccess: "Código enviado com sucesso!",
    keepLoggedIn: "Manter a sessão iniciada.",
  },
  'Español': {
    welcomeLine1: "Bienvenido",
    welcomeLine2: "Ingrese su correo electrónico para continuar",
    asRolePrefix: "Como",
    optionsLabel: "Opciones",
    quitLabel: "Salir",
    assistanceLabel: "Asistencia",
    systemOptionsAria: "Opciones del sistema",
    chooseRoleAria: "Elegir tipo de usuario",
    chooseLangAria: "Elegir idioma",
    emailInputPlaceholder: "ejemplo@email.com",
    connectBtn: "Iniciar sesión",
    keepSession: "Mantener la sesión iniciada",
    reportAlertTitle: "Reportar un problema con un desfibrilador, envíe un mensaje como cliente o transeúnte.",
    continue: "Continuar",
    login: "Iniciar sesión",
    registerTab: "Crear cuenta",
    loginAs: "Iniciar sesión como",
    admin: "Admin",
    client: "Cliente",
    technicien: "Técnico",
    email: "Correo electrónico",
    emailPlace: "Ej: contact@info.com",
    password: "Contraseña",
    passwordPlace: "Ej: 123ABC%",
    loginBtn: "Iniciar sesión",
    reqSubmittedTitle: "Solicitud registrada",
    reqSubmittedDesc: "Su solicitud de creación de un nuevo entorno Défibeo y su activación se han registrado correctamente. Nuestro soporte configurará su espacio en 24 horas.",
    backToLogin: "Volver a iniciar sesión",
    configDesc: "Configure y active el nuevo entorno de software Défibeo para su establecimiento. Si necesita ayuda, por favor pulse en",
    contactSupport: "contactar con el soporte",
    companyName: "Nombre de la empresa",
    companyNamePlace: "Ej: Medical360",
    softwareId: "Código de Entorno / Identificador de Software",
    softwareIdPlace: "Ej: D18, D19...",
    companyEmail: "Correo electrónico de la empresa",
    companyEmailPlace: "Ej: contact@medical360.com",
    softwareName: "Nombre del Software",
    softwareNamePlace: "Ej: App360",
    companyPhone: "Teléfono (móvil)",
    companyPhonePlace: "612 34 56 78",
    adminName: "Nombre y apellido",
    adminNamePlace: "Ej: Noor Jakub",
    adminEmail: "Correo electrónico",
    adminEmailPlace: "Ej: n.jakub@medical360.com",
    adminPassword: "Contraseña",
    adminPasswordPlace: "Ej: 123ABC%",
    selectLang: "Idioma del Software",
    superAdminInfo: "Cree sus credenciales para la cuenta de súper administrador, esta es la cuenta principal de todas las demás cuentas.",
    activateSub: "Activar suscripción",
    paymentDisclaimer: "Hoy pagará el primer mes de su suscripción con tarjeta de crédito o PayPal para activar su perfil de super-admin. La tarifa única de despliegue de su entorno se paga mediante transferencia bancaria; se le enviará una factura en un plazo de 1 a 3 días. Al continuar, acepta nuestras ",
    eula: "condiciones EULA",
    disclaimerMid1: ", nuestra ",
    privacyPolicy: "política de gestión de datos",
    disclaimerMid2: ", y confirma haber leído la información relativa a nuestra ",
    hdsCertification: "certificación HDS",
    returnToSite: "Volver al sitio",
    reportTitle: "Formulario",
    close: "Cerrar",
    reportSuccessTitle: "Reporte enviado",
    reportSuccessDesc: "Gracias por su ayuda. El mantenedor intervendrá rápidamente.",
    messageSentSuccess: "Mensaje enviado con éxito.",
    reportDesc: "Por favor, complete los detalles del desfibrilador abajo (el identificador es obligatorio).",
    yourEmail: "Su correo electrónico",
    yourEmailPlace: "Ej: contact@gmail.com",
    defibIdValid: "Identificador válido.",
    defibIdInvalid: "Identificador inválido, verifique la entrada.",
    checkingId: "Verificando identificador...",
    defibId: "Identificador de desfibrilador",
    defibIdPlace: "Ej: DEFIB-2026-PAU.",
    subject: "Asunto",
    subjectPlace: "Ej: Luz roja encendida / Batería baja.",
    message: "Mensaje",
    messagePlace: "Describa detalladamente el problema observado...",
    sending: "Enviando...",
    send: "Enviar",
    errorAdmin: "Credenciales de administrador incorrectas.",
    errorClient: "Credenciales de cliente incorrectas.",
    errorTech: "Credenciales de técnico incorrectas.",
    tooManyAttempts: "Demasiados intentos de inicio de sesión. Espere antes de volver a intentarlo.",
    accountSuspended: "Su cuenta está suspendida, contacte con Défibeo para reactivar su entorno.",
    forgotPassword: "Contraseña olvidada",
    authCodeTitle: "Doble Autenticación",
    authCodeDesc: "Código de 6 caracteres enviado por correo electrónico",
    authCodeConfirm: "Confirmar",
    authCodeInvalid: "Código de autenticación incorrecto. Verifique el código recibido.",
    resendAuthCode: "Reenviar",
    changeAccount: "Cancelar",
    codeSentSuccess: "¡Código enviado con éxito!",
    keepLoggedIn: "Mantener la sesión iniciada.",
  }
};

/**
 * La double authentification par code email aléatoire est strictement requise (100% du temps)
 * pour chaque connexion (Admin, Technicien, Client, MegaAdmin), tous les jours.
 */
export const isDoubleAuthRequiredToday = (_testDate?: Date): boolean => {
  return true;
};

export default function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [keepLoggedIn, setKeepLoggedIn] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 2FA Auth Code State (Strict random server-side 2FA)
  const [isAuthCodeStep, setIsAuthCodeStep] = useState(false);
  const [authCodeDigits, setAuthCodeDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [pendingUser, setPendingUser] = useState<{
    loginIdentifier: string;
    email: string;
    name: string;
    tenantId: string;
    role?: string;
    sentToEmail: string;
  } | null>(null);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [authCodeSentSuccess, setAuthCodeSentSuccess] = useState(false);
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  // Connection & Creation language selector state (always normalized, e.g. 'Français' not 'Français, France')
  const [selectedLang, setSelectedLang] = useState<'Français' | 'English' | 'Deutsch' | 'Português' | 'Español'>(() =>
    normalizeLoginLang(getLanguage())
  );

  useEffect(() => {
    const normalized = normalizeLoginLang(localStorage.getItem('defib_lang'));
    if (localStorage.getItem('defib_lang') !== normalized) {
      setLanguage(normalized);
    }
    if (selectedLang !== normalized) {
      setSelectedLang(normalized);
    }
  }, []);

  const [typedLine1, setTypedLine1] = useState('');
  const [typedLine2, setTypedLine2] = useState('');

  useEffect(() => {
    if (isAuthCodeStep) return;
    const currentTranslations = (translations as any)[selectedLang] || translations['Français'];
    const welcomeLine1 = String(currentTranslations.welcomeLine1 || 'Bienvenue');
    const welcomeLine2 = String(currentTranslations.welcomeLine2 || 'Entrez votre email pour continuer');

    let i = 0;
    let j = 0;
    let line2Interval: ReturnType<typeof setInterval> | null = null;
    let pauseTimeout: ReturnType<typeof setTimeout> | null = null;

    setTypedLine1('');
    setTypedLine2('');

    const line1Interval = setInterval(() => {
      i += 1;
      setTypedLine1(welcomeLine1.slice(0, i));
      if (i >= welcomeLine1.length) {
        clearInterval(line1Interval);
        pauseTimeout = setTimeout(() => {
          line2Interval = setInterval(() => {
            j += 1;
            setTypedLine2(welcomeLine2.slice(0, j));
            if (j >= welcomeLine2.length && line2Interval) {
              clearInterval(line2Interval);
            }
          }, 35);
        }, 150);
      }
    }, 55);

    return () => {
      clearInterval(line1Interval);
      if (pauseTimeout) clearTimeout(pauseTimeout);
      if (line2Interval) clearInterval(line2Interval);
    };
  }, [isAuthCodeStep, selectedLang]);

  const [typedAuthLine1, setTypedAuthLine1] = useState('');
  const [typedAuthLine2, setTypedAuthLine2] = useState('');

  useEffect(() => {
    if (!isAuthCodeStep) {
      setTypedAuthLine1('');
      setTypedAuthLine2('');
      return;
    }

    const currentTranslations = (translations as any)[selectedLang] || translations['Français'];
    const authLine1 = String(currentTranslations.authCodeTitle || 'Double Authentification').replace(/[.:]+$/, '');
    const authLine2 = String(currentTranslations.authCodeDesc || 'Code de 6 caractères envoyé par email').replace(/[.:]+$/, '');

    let i = 0;
    let j = 0;
    let line2Interval: ReturnType<typeof setInterval> | null = null;
    let pauseTimeout: ReturnType<typeof setTimeout> | null = null;

    setTypedAuthLine1('');
    setTypedAuthLine2('');

    const line1Interval = setInterval(() => {
      i += 1;
      setTypedAuthLine1(authLine1.slice(0, i));
      if (i >= authLine1.length) {
        clearInterval(line1Interval);
        pauseTimeout = setTimeout(() => {
          line2Interval = setInterval(() => {
            j += 1;
            setTypedAuthLine2(authLine2.slice(0, j));
            if (j >= authLine2.length && line2Interval) {
              clearInterval(line2Interval);
            }
          }, 35);
        }, 150);
      }
    }, 55);

    return () => {
      clearInterval(line1Interval);
      if (pauseTimeout) clearTimeout(pauseTimeout);
      if (line2Interval) clearInterval(line2Interval);
    };
  }, [isAuthCodeStep, selectedLang]);

  // Toggle & Subscriber Creation Form states
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [loginRole, setLoginRole] = useState<'admin' | 'client' | 'technicien'>('admin');
  
  // Issue report popup state variables
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportDefibId, setReportDefibId] = useState('');
  const [reportEmail, setReportEmail] = useState('');
  const [reportSubject, setReportSubject] = useState('');
  const [reportMessage, setReportMessage] = useState('');
  const [isReportSubmitting, setIsReportSubmitting] = useState(false);
  const [isReportSubmitted, setIsReportSubmitted] = useState(false);

  // Live lookup check of defibrillator identifier against main software's registry
  const [isDefibIdTypedValid, setIsDefibIdTypedValid] = useState<boolean | null>(null);
  const [isCheckingId, setIsCheckingId] = useState(false);

  const [clientIp, setClientIp] = useState<string>('local_ip');

  React.useEffect(() => {
    // Auto-modify login slug randomly on each access: /y26m8v105DRSHdatacentersession<3 chiffres><3 lettres>
    updateLoginSessionSlug();

    // Purge cached collection snapshots on arriving at the login screen to ensure fresh synchronization
    purgeAllLocalEnvironmentCaches();

    // Remove any legacy login attempt lockout keys from localStorage
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('login_attempts_')) {
          localStorage.removeItem(k);
        }
      }
    } catch (_) {}

    fetch('/api/public/client-ip')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.ip) {
          setClientIp(data.ip);
          setCurrentIp(data.ip);
        }
      })
      .catch(() => {
        // Fallback intact
      });
  }, []);

  const handleSuccessLogin = (emailVal: string, nameVal: string, tenantIdVal: string, roleVal?: string) => {
    try {
      purgeAllLocalEnvironmentCaches(tenantIdVal);
      localStorage.setItem('defib_keep_logged_in', keepLoggedIn ? 'true' : 'false');
      localStorage.setItem('defib_last_activity_ts', String(Date.now()));
      if (clientIp) {
        setCurrentIp(clientIp);
      }
    } catch (e) {
      console.error(e);
    }
    onLoginSuccess(emailVal, nameVal, tenantIdVal, roleVal, clientIp);
  };

  const promptForServerAuthCode = (userData: {
    loginIdentifier: string;
    email: string;
    name: string;
    tenantId: string;
    role?: string;
    targetEmail: string;
  }) => {
    setError('');
    setPendingUser({
      loginIdentifier: userData.loginIdentifier,
      email: userData.email,
      name: userData.name,
      tenantId: userData.tenantId,
      role: userData.role,
      sentToEmail: userData.targetEmail,
    });
    setAuthCodeDigits(['', '', '', '', '', '']);
    setIsAuthCodeStep(true);
    setIsLoading(false);
    setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 100);
  };

  const handleDigitChange = (index: number, val: string) => {
    const clean = val.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!clean) {
      const newDigits = [...authCodeDigits];
      newDigits[index] = '';
      setAuthCodeDigits(newDigits);
      return;
    }

    if (clean.length > 1) {
      const newDigits = [...authCodeDigits];
      for (let i = 0; i < clean.length && (index + i) < 6; i++) {
        newDigits[index + i] = clean[i];
      }
      setAuthCodeDigits(newDigits);
      const nextIndex = Math.min(index + clean.length, 5);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    const char = clean[clean.length - 1];
    const newDigits = [...authCodeDigits];
    newDigits[index] = char;
    setAuthCodeDigits(newDigits);

    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!authCodeDigits[index] && index > 0) {
        e.preventDefault();
        const newDigits = [...authCodeDigits];
        newDigits[index - 1] = '';
        setAuthCodeDigits(newDigits);
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (!pasted) return;
    const newDigits = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length && i < 6; i++) {
      newDigits[i] = pasted[i];
    }
    setAuthCodeDigits(newDigits);
    const focusIdx = Math.min(pasted.length, 5);
    inputRefs.current[focusIdx]?.focus();
  };

  const handleAuthCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const fullCode = authCodeDigits.join('').trim().toUpperCase();
    if (fullCode.length < 6) {
      setError(t.authCodeInvalid || "Veuillez saisir les 6 caractères du code.");
      return;
    }
    if (!pendingUser) return;

    setIsLoading(true);
    try {
      const verifyRes = await fetch('/api/auth/verify-tenant-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pendingUser.loginIdentifier,
          role: loginRole,
          authCode: fullCode,
        }),
      });

      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok || !verifyData?.matched || !verifyData?.codeVerified) {
        setError(t.authCodeInvalid || verifyData?.error || "Code d'authentification incorrect. Veuillez vérifier le code reçu.");
        setIsLoading(false);
        return;
      }

      if (verifyData.sessionToken) {
        localStorage.setItem('defib_session_token', verifyData.sessionToken);
      }

      const finalEmail = verifyData.user?.email || pendingUser.email;
      const finalName = verifyData.user?.name || pendingUser.name;
      const finalTenantId = verifyData.tenantId || pendingUser.tenantId;
      const finalRole = verifyData.user?.role || pendingUser.role;

      setIsLoading(false);
      handleSuccessLogin(finalEmail, finalName, finalTenantId, finalRole);
    } catch (err: any) {
      console.error("Error verifying auth code:", err);
      setError(t.authCodeInvalid || "Erreur lors de la vérification du code.");
      setIsLoading(false);
    }
  };

  const handleResendAuthCode = async () => {
    if (!pendingUser || isSendingCode) return;
    setIsSendingCode(true);
    setError('');
    try {
      const scriptUrl = await getAppsScriptUrl().catch(() => '');
      const res = await fetch('/api/auth/verify-tenant-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pendingUser.loginIdentifier,
          role: loginRole,
          resend: true,
          scriptUrl,
        }),
      });
      if (res.ok) {
        setAuthCodeSentSuccess(true);
        setTimeout(() => setAuthCodeSentSuccess(false), 3500);
      }
    } catch (e) {
      console.error("Error resending auth code:", e);
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleBackToCredentials = () => {
    setIsAuthCodeStep(false);
    setPendingUser(null);
    setAuthCodeDigits(['', '', '', '', '', '']);
    setError('');
  };

  React.useEffect(() => {
    const trimmed = reportDefibId.trim();
    if (!trimmed) {
      setIsDefibIdTypedValid(null);
      return;
    }

    setIsCheckingId(true);
    const delayDebounce = setTimeout(async () => {
      try {
        const result = await findTenantAndDefibGlobally(trimmed);
        if (result && result.exists) {
          setIsDefibIdTypedValid(true);
        } else {
          setIsDefibIdTypedValid(false);
        }
      } catch (err) {
        console.error("Error looking up defib ID globally:", err);
        setIsDefibIdTypedValid(false);
      } finally {
        setIsCheckingId(false);
      }
    }, 600); // 600ms debounce

    return () => clearTimeout(delayDebounce);
  }, [reportDefibId]);

  // Combined validity check for the form to be enabled
  const isFormValid = React.useMemo(() => {
    const isEmailValid = /\S+@\S+\.\S+/.test(reportEmail.trim());
    return reportSubject.trim().length > 0 &&
           reportMessage.trim().length > 0 &&
           isDefibIdTypedValid === true &&
           isEmailValid &&
           !isCheckingId;
  }, [reportSubject, reportMessage, isDefibIdTypedValid, reportEmail, isCheckingId]);
  const [reqCompany, setReqCompany] = useState('');
  const [reqNomLogiciel, setReqNomLogiciel] = useState('');
  const [reqTenantId, setReqTenantId] = useState('');
  const [reqCompanyEmail, setReqCompanyEmail] = useState('');
  const [reqCompanyPhone, setReqCompanyPhone] = useState('');
  const [reqAdminName, setReqAdminName] = useState('');
  const [reqAdminEmail, setReqAdminEmail] = useState('');
  const [reqAdminPassword, setReqAdminPassword] = useState('');
  const [reqLang, setReqLang] = useState(() => normalizeLoginLang(localStorage.getItem('defib_lang')));

  const [isReqLoading, setIsReqLoading] = useState(false);
  const [reqError, setReqError] = useState('');

  // Lock body scroll when report modal is open to avoid double scrolls
  React.useEffect(() => {
    if (isReportOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isReportOpen]);

  const t = translations[selectedLang as keyof typeof translations] || translations['Français'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const emailLower = email.replace(/[\s\u200B-\u200D\uFEFF\u00A0]+/g, '').toLowerCase();

    try {
      const scriptUrl = await Promise.race([
        getAppsScriptUrl().catch(() => ''),
        new Promise<string>(resolve => setTimeout(() => resolve(''), 600)),
      ]);

      const performVerifyRequest = async () => {
        const res = await fetch('/api/auth/verify-tenant-member', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: emailLower,
            role: loginRole,
            scriptUrl,
          }),
        });
        if (!res.ok) return null;
        return await res.json().catch(() => null);
      };

      let verifyData = await performVerifyRequest();
      if (!verifyData || !verifyData.matched) {
        // Retry once in case of a transient cold-start or spreadsheet refresh delay
        verifyData = await performVerifyRequest();
      }

      if (verifyData?.matched) {
        if (verifyData.disabled) {
          setError(t.accountSuspended || "Votre compte est suspendu, contactez Défibeo pour réactiver votre environnement.");
          setIsLoading(false);
          return;
        }

        const matchedRole = verifyData.user?.role || verifyData.member?.role || loginRole;
        const matchedTenantId = verifyData.tenantId || 'demo';
        const matchedEmail = verifyData.user?.email || verifyData.member?.email || emailLower;
        const matchedName =
          verifyData.user?.name ||
          verifyData.member?.denomination ||
          verifyData.member?.name ||
          emailLower;
        const targetEmail = verifyData.sentToEmail || matchedEmail;

        promptForServerAuthCode({
          loginIdentifier: emailLower,
          email: matchedEmail,
          name: matchedName,
          tenantId: matchedTenantId,
          role: matchedRole,
          targetEmail,
        });
        return;
      }

      if (loginRole === 'admin') {
        setError(t.errorAdmin);
      } else if (loginRole === 'client') {
        setError(t.errorClient);
      } else {
        setError(t.errorTech);
      }
      setIsLoading(false);
    } catch (err: any) {
      console.error('Error logging in:', err);
      setError('Erreur lors de la connexion: ' + (err.message || String(err)));
      setIsLoading(false);
    }
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsReqLoading(true);
    setReqError('');

    try {
      if (!reqCompany.trim() || !reqNomLogiciel.trim() || !reqCompanyEmail.trim() || !reqAdminName.trim() || !reqAdminEmail.trim() || !reqAdminPassword.trim()) {
        throw new Error('Veuillez remplir tous les champs obligatoires.');
      }

      const tenantId = await registerNewTenant({
        companyName: reqCompany.trim(),
        companyEmail: reqCompanyEmail.trim(),
        companyPhone: reqCompanyPhone.trim(),
        adminName: reqAdminName.trim(),
        adminEmail: reqAdminEmail.trim(),
        adminPasswordHexOrPlain: reqAdminPassword.trim(),
        lang: reqLang,
        nomLogiciel: reqNomLogiciel.trim(),
      });

      console.log('Successfully registered environment tenant ID:', tenantId);

      // Envoi de l'email automatique d'ouverture de l'environnement (différé de 15 min - synchronously awaited before page unload)
      try {
        await triggerEmail1Inscription(reqAdminEmail.trim(), reqAdminPassword.trim());
      } catch (emailErr) {
        console.error("Error sending welcome email during signup:", emailErr);
      }

      // Redirect current window directly to PayPal subscription to capture payment smoothly without popups being blocked
      window.location.href = "https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-1J0318296F988751YNJI6Z3A";
    } catch (err: any) {
      console.error('Registration failed:', err);
      setReqError(err.message || String(err));
      setIsReqLoading(false);
    }
  };

  const roleLabel =
    loginRole === 'admin'
      ? t.admin
      : loginRole === 'technicien'
      ? t.technicien
      : t.client;

  return (
    <div
      className="min-h-screen w-full flex flex-col md:flex-row font-sans relative overflow-x-hidden"
      id="login-viewport-wrapper"
      style={{ fontFamily: "'DefibeoMain', 'Civilprom', sans-serif" }}
    >
      <style>{`
        body {
          background: #375bff !important;
          margin: 0;
          padding: 0;
        }

        #tab-topbar-loading-indicator {
          display: none !important;
        }

        #login-email-input {
          background-color: #4d6dff !important;
          color: #ffffff !important;
          font-size: 18px !important;
          border: none !important;
          border-radius: 10px !important;
          padding: 14px 16px !important;
          outline: none !important;
          text-align: center !important;
          font-family: 'DefibeoMain', 'Civilprom', sans-serif !important;
          box-shadow: none !important;
        }

        #login-email-input::placeholder {
          color: rgba(255, 255, 255, 0.55) !important;
          font-size: 18px !important;
          text-align: center !important;
          opacity: 1 !important;
          font-family: 'DefibeoMain', 'Civilprom', sans-serif !important;
        }

        #login-email-input::-webkit-input-placeholder {
          color: rgba(255, 255, 255, 0.55) !important;
          font-size: 18px !important;
          text-align: center !important;
          font-family: 'DefibeoMain', 'Civilprom', sans-serif !important;
        }

        #login-email-input::-moz-placeholder {
          color: rgba(255, 255, 255, 0.55) !important;
          font-size: 18px !important;
          text-align: center !important;
          font-family: 'DefibeoMain', 'Civilprom', sans-serif !important;
        }

        #popup-main-card input, #popup-main-card select, #popup-main-card textarea {
          border: 1px solid #dce1ea !important;
          border-radius: 13px !important;
          padding: 14px !important;
          font-size: 18px !important;
          font-weight: 100 !important;
          color: #000000 !important;
          background-color: #ffffff !important;
          outline: none !important;
          font-family: 'DefibeoMain', 'Civilprom', sans-serif !important;
        }
        #auth-code-inputs-container input {
          border: none !important;
          outline: none !important;
        }
      `}</style>

      {/* Left Column (Top on Mobile, Left on Desktop) */}
      <div
        className="w-full md:w-1/2 h-[220px] sm:h-[250px] md:min-h-screen md:h-screen relative overflow-hidden flex items-stretch shrink-0"
        style={{ backgroundColor: '#e9edf1' }}
        id="login-left-column"
      >
        <img
          src="https://civilprom.s3.eu-north-1.amazonaws.com/loginpcillustration.svg"
          alt="Illustration Connexion"
          className="h-full w-auto max-w-[45%] md:max-w-none object-contain object-left select-none pointer-events-none"
          style={{ height: '100%', alignSelf: 'flex-start' }}
        />

        {/* Bottom-right stacked controls */}
        <div
          className="absolute bottom-6 right-6 md:bottom-8 md:right-8 z-20 flex flex-col items-end gap-2.5"
          id="login-left-controls"
        >
          {/* 1. 3-dots icon with system dropdown ("Quitter", "Assistance") */}
          <div
            className="relative inline-flex items-center justify-center cursor-pointer"
            style={{ marginBottom: '6px' }}
          >
            <img
              src="https://civilprom.s3.eu-north-1.amazonaws.com/3dotsgris.svg"
              alt="Menu"
              className="w-auto object-contain select-none pointer-events-none"
              style={{ height: '22px' }}
            />
            <select
              aria-label={t.systemOptionsAria}
              value=""
              onChange={(e) => {
                const action = e.target.value;
                if (action === 'quitter') {
                  window.location.href = 'https://defibeo.com';
                } else if (action === 'assistance') {
                  window.location.href = 'mailto:support@defibeo.com';
                }
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            >
              <option value="" disabled hidden>
                {t.optionsLabel}
              </option>
              <option value="quitter">{t.quitLabel}</option>
              <option value="assistance">{t.assistanceLabel}</option>
            </select>
          </div>

          {/* 2. Green pill button for User Role ("En tant que Admin" by default) */}
          <div
            className="relative inline-flex items-center justify-center rounded-full px-5 py-2 cursor-pointer select-none"
            style={{
              backgroundColor: '#3ddc84',
              color: '#156337',
              fontSize: '18px',
              borderRadius: '9999px',
              fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
            }}
          >
            <span className="pointer-events-none whitespace-nowrap">
              {t.asRolePrefix} {roleLabel}
            </span>
            <select
              aria-label={t.chooseRoleAria}
              value={loginRole}
              onChange={(e) => {
                setLoginRole(e.target.value as 'admin' | 'technicien' | 'client');
                setError('');
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            >
              <option value="admin">{t.admin}</option>
              <option value="technicien">{t.technicien}</option>
              <option value="client">{t.client}</option>
            </select>
          </div>

          {/* 3. Green pill button for Language selection */}
          <div
            className="relative inline-flex items-center justify-center rounded-full px-5 py-2 cursor-pointer select-none"
            style={{
              backgroundColor: '#3ddc84',
              color: '#156337',
              fontSize: '18px',
              borderRadius: '9999px',
              fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
            }}
          >
            <span className="pointer-events-none whitespace-nowrap">
              {selectedLang}
            </span>
            <select
              aria-label={t.chooseLangAria}
              value={selectedLang}
              onChange={(e) => {
                const val = normalizeLoginLang(e.target.value);
                setSelectedLang(val);
                setReqLang(val);
                setLanguage(val);
                setError('');
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            >
              <option value="Français">Français</option>
              <option value="English">English</option>
              <option value="Deutsch">Deutsch</option>
              <option value="Português">Português</option>
              <option value="Español">Español</option>
            </select>
          </div>
        </div>
      </div>

      {/* Right Column (Bottom on Mobile, Right on Desktop) */}
      <div
        className="w-full md:w-1/2 min-h-[460px] md:min-h-screen flex-1 flex flex-col justify-center items-center px-6 py-12 md:px-12 relative"
        style={{ backgroundColor: '#375bff' }}
        id="login-right-column"
      >
        <div className="w-full max-w-[380px]" id="auth-main-card">
          {isAuthCodeStep ? (
            /* 2FA Auth Code Step */
            <div className="space-y-6 animate-fadeIn">
              <form className="space-y-4" onSubmit={handleAuthCodeSubmit} id="auth-code-form">
                {error && (
                  <div
                    className="text-[18px] text-white font-sans"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                    }}
                    id="auth-code-error-message"
                  >
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <div
                    className="text-left text-white font-sans leading-snug select-none"
                    style={{
                      fontSize: '18px',
                      color: '#ffffff',
                      fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                      minHeight: '50px',
                    }}
                  >
                    <div style={{ minHeight: '25px' }}>{typedAuthLine1}</div>
                    <div style={{ minHeight: '25px' }}>{typedAuthLine2}</div>
                  </div>

                  {/* 6-box input occupying 100% of the div width */}
                  <div className="grid grid-cols-6 gap-2 w-full pt-3" id="auth-code-inputs-container">
                    {authCodeDigits.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => { inputRefs.current[index] = el; }}
                        id={`auth-code-input-${index}`}
                        type="text"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleDigitChange(index, e.target.value)}
                        onKeyDown={(e) => handleDigitKeyDown(index, e)}
                        onPaste={handlePaste}
                        onFocus={(e) => e.target.select()}
                        className="w-full text-center font-bold uppercase rounded-[10px] border-0 focus:outline-none transition-all"
                        style={{
                          height: '54px',
                          fontSize: '22px',
                          fontWeight: '700',
                          textAlign: 'center',
                          textTransform: 'uppercase',
                          backgroundColor: '#4d6dff',
                          color: '#ffffff',
                          fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                          padding: '0px',
                          border: 'none',
                          outline: 'none',
                        }}
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                      />
                    ))}
                  </div>
                </div>

                <div className="pt-2 text-center space-y-3">
                  <button
                    type="submit"
                    disabled={isLoading || authCodeDigits.some((d) => !d || d.trim() === '')}
                    style={{
                      backgroundColor: '#1d0245',
                      color: '#ffffff',
                      borderRadius: '10px',
                      fontSize: '18px',
                      fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                      padding: '14px 20px',
                      border: 'none',
                      outline: 'none',
                      cursor: (isLoading || authCodeDigits.some((d) => !d || d.trim() === '')) ? 'not-allowed' : 'pointer',
                    }}
                    className="w-full flex justify-center items-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    id="btn-auth-code-confirm"
                  >
                    {t.authCodeConfirm}
                  </button>

                  <div className="flex w-full gap-3 pt-1">
                    <button
                      type="button"
                      onClick={handleBackToCredentials}
                      style={{
                        backgroundColor: '#4d6dff',
                        color: '#ffffff',
                        borderRadius: '10px',
                        fontSize: '18px',
                        fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                        padding: '13px 12px',
                        border: 'none',
                        outline: 'none',
                        cursor: 'pointer',
                      }}
                      className="w-1/2 flex justify-center items-center text-center"
                      id="btn-auth-code-back"
                    >
                      {t.changeAccount}
                    </button>

                    <button
                      type="button"
                      onClick={handleResendAuthCode}
                      disabled={isSendingCode}
                      style={{
                        backgroundColor: '#4d6dff',
                        color: '#ffffff',
                        borderRadius: '10px',
                        fontSize: '18px',
                        fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                        padding: '13px 12px',
                        border: 'none',
                        outline: 'none',
                        cursor: isSendingCode ? 'not-allowed' : 'pointer',
                      }}
                      className="w-1/2 flex justify-center items-center text-center disabled:opacity-50 disabled:cursor-not-allowed"
                      id="btn-auth-code-resend"
                    >
                      {isSendingCode ? t.sending : authCodeSentSuccess ? t.codeSentSuccess : t.resendAuthCode}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit} id="login-form">
              {/* Two-line title in 18px white with sequential typing effect */}
              <div
                className="text-left text-white leading-snug mb-5 select-none"
                style={{
                  fontSize: '18px',
                  color: '#ffffff',
                  fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                  minHeight: '50px',
                }}
              >
                <div style={{ minHeight: '25px' }}>{typedLine1}</div>
                <div style={{ minHeight: '25px' }}>{typedLine2}</div>
              </div>

              {error && (
                <div
                  className="text-[18px] text-white font-sans"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                  }}
                  id="login-error-message"
                >
                  {error}
                </div>
              )}

              {/* Email field */}
              <div>
                <input
                  id="login-email-input"
                  name="email"
                  type={(loginRole === 'technicien' || loginRole === 'client') ? 'text' : 'email'}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full text-center"
                  placeholder={t.emailInputPlaceholder}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>

              {/* Submit button 'Se connecter' */}
              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  style={{
                    backgroundColor: '#1d0245',
                    color: '#ffffff',
                    borderRadius: '10px',
                    fontSize: '18px',
                    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                    padding: '14px 20px',
                    border: 'none',
                    outline: 'none',
                  }}
                  className="w-full flex justify-center items-center transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {t.connectBtn}
                </button>
              </div>

              {/* Radio-check 'Maintenir la session' */}
              <div className="pt-2 flex items-center">
                <button
                  type="button"
                  role="radio"
                  aria-checked={keepLoggedIn}
                  id="radio-keep-logged-in"
                  onClick={() => setKeepLoggedIn((prev) => !prev)}
                  className="inline-flex items-center gap-3 cursor-pointer select-none bg-transparent border-0 p-0 text-left"
                  style={{
                    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                    fontSize: '18px',
                    color: '#ffffff',
                    outline: 'none',
                  }}
                >
                  <span
                    className="rounded-full flex items-center justify-center shrink-0"
                    style={{
                      width: '20px',
                      height: '20px',
                      minWidth: '20px',
                      minHeight: '20px',
                      boxSizing: 'border-box',
                      border: '1.5px solid #ffffff',
                      backgroundColor: 'transparent',
                    }}
                  >
                    <span
                      className="rounded-full block transition-opacity"
                      style={{
                        width: '10px',
                        height: '10px',
                        backgroundColor: '#ffffff',
                        opacity: keepLoggedIn ? 1 : 0,
                      }}
                    />
                  </span>
                  <span
                    style={{
                      fontSize: '18px',
                      color: '#ffffff',
                      fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                    }}
                  >
                    {t.keepSession}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Modal - Signaler un problème */}
      {isReportOpen && (
        <div className="fixed inset-0 z-50 w-full h-full bg-white overflow-y-auto flex justify-center py-10 px-4" style={{ position: 'fixed' }}>
          <div className="w-full max-w-md relative animate-fadeIn py-6 px-1" id="popup-main-card">
            
            {/* Header with Title and Prominent Fermer Button */}
            <div className="flex items-center justify-between mb-8 pb-4">
              <h3 className="text-[22px] font-bold text-black" style={{ fontFamily: "DefibeoMain, Civilprom, sans-serif", cursor: 'default' }}>
                {t.reportTitle}
              </h3>
              <button
                onClick={() => {
                  setIsReportOpen(false);
                  setIsReportSubmitted(false);
                  setReportDefibId('');
                  setReportEmail('');
                  setReportSubject('');
                  setReportMessage('');
                }}
                style={{
                  fontFamily: "DefibeoMain, Civilprom, sans-serif",
                  fontWeight: 100,
                  background: '#fa53d5',
                  color: '#fff',
                  fontSize: '18px',
                  padding: '7px 18px',
                  borderRadius: '11px',
                  border: 'none',
                  cursor: 'pointer',
                }}
                className="cursor-pointer"
                type="button"
              >
                {t.close}
              </button>
            </div>

            <div className="space-y-6">
              <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!isFormValid) return;
                    setIsReportSubmitting(true);
                    try {
                      const submitRes = await fetch('/api/public/submit-report', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          identifiant: reportDefibId.trim().toUpperCase(),
                          objet: reportSubject,
                          message: reportMessage,
                          email: reportEmail.trim(),
                        }),
                      });
                      const submitData = await submitRes.json().catch(() => ({}));
                      if (!submitRes.ok || submitData.error) {
                        alert("Erreur: " + (submitData.error || "Impossible de localiser le propriétaire de ce défibrillateur."));
                        setIsReportSubmitting(false);
                        return;
                      }

                      const { companyName, companyEmail } = submitData;

                      // Dispatch the Email 4 notification warning the tenant
                      try {
                        await triggerEmail4Signalement(
                          reportDefibId.trim().toUpperCase(),
                          companyName,
                          companyEmail
                        );
                      } catch (emailErr) {
                        console.error("Error sending CRM and Email warning notification:", emailErr);
                      }

                      setIsReportSubmitted(true);
                      setReportDefibId('');
                      setReportEmail('');
                      setReportSubject('');
                      setReportMessage('');
                    } catch (err: any) {
                      console.error("Failed to submit public incident ticket:", err);
                      alert("Une erreur est survenue lors de l'envoi : " + (err.message || String(err)));
                    } finally {
                      setIsReportSubmitting(false);
                    }
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-1.5">
                    <label htmlFor="defib_id" className="block text-[18px] font-bold text-black font-sans">
                      {t.defibId}
                    </label>
                    <input
                      id="defib_id"
                      type="text"
                      required
                      value={reportDefibId}
                      onChange={(e) => {
                        setReportDefibId(e.target.value);
                        if (isReportSubmitted) setIsReportSubmitted(false);
                      }}
                      className="block w-full"
                      placeholder={t.defibIdPlace}
                    />
                    {isCheckingId && (
                      <p className="text-[14px] text-slate-500 font-medium font-sans mt-1 animate-pulse" style={{ cursor: 'default' }}>
                        {t.checkingId}
                      </p>
                    )}
                    {!isCheckingId && isDefibIdTypedValid === true && (
                      <p className="text-[14px] text-emerald-600 font-medium font-sans mt-1" style={{ cursor: 'default' }}>
                        {t.defibIdValid}
                      </p>
                    )}
                    {!isCheckingId && isDefibIdTypedValid === false && (
                      <p className="text-[14px] text-rose-600 font-medium font-sans mt-1" style={{ cursor: 'default' }}>
                        {t.defibIdInvalid}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="defib_email" className="block text-[18px] font-bold text-black font-sans">
                      {t.yourEmail}
                    </label>
                    <input
                      id="defib_email"
                      type="email"
                      required
                      value={reportEmail}
                      onChange={(e) => {
                        setReportEmail(e.target.value);
                        if (isReportSubmitted) setIsReportSubmitted(false);
                      }}
                      className="block w-full"
                      placeholder={t.yourEmailPlace}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="defib_subject" className="block text-[18px] font-bold text-black font-sans">
                      {t.subject}
                    </label>
                    <input
                      id="defib_subject"
                      type="text"
                      required
                      value={reportSubject}
                      onChange={(e) => {
                        setReportSubject(e.target.value);
                        if (isReportSubmitted) setIsReportSubmitted(false);
                      }}
                      className="block w-full"
                      placeholder={t.subjectPlace}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="defib_message" className="block text-[18px] font-bold text-black font-sans">
                      {t.message}
                    </label>
                    <textarea
                      id="defib_message"
                      rows={5}
                      required
                      value={reportMessage}
                      onChange={(e) => {
                        setReportMessage(e.target.value);
                        if (isReportSubmitted) setIsReportSubmitted(false);
                      }}
                      className="block w-full"
                      style={{
                        resize: 'none',
                        border: '1px solid #dedede',
                        borderRadius: '13px',
                        padding: '14px',
                        fontSize: '18px',
                        fontFamily: "'DefibeoMain', sans-serif",
                        color: '#000',
                        width: '100%'
                      }}
                      placeholder={t.messagePlace}
                    />
                  </div>

                  <div className="pt-2 pb-16">
                    <button
                      type="submit"
                      disabled={isReportSubmitting || !isFormValid}
                      style={{
                        backgroundColor: '#3556ec',
                        color: '#fff',
                        textTransform: 'none',
                        boxShadow: 'inset 0 1px 1px #fff3, 0 1px 2px #08080833, 0 4px 4px #08080814, 0 7px 0 -12px #077ac7, inset 0 6px 12px #ffffff1f',
                        textDecoration: 'none',
                        borderRadius: '12px',
                        fontSize: '18px',
                        fontWeight: '100',
                        transition: 'transform 0s ease',
                        fontFamily: "'DefibeoMain', sans-serif",
                        outline: 'none',
                        padding: '13px 20px',
                        width: '100%',
                        cursor: isFormValid ? 'pointer' : 'not-allowed'
                      }}
                      className="w-full flex justify-center items-center transition-all disabled:opacity-50"
                    >
                      {isReportSubmitting ? (
                        <span className="flex items-center justify-center">
                          {t.sending}
                        </span>
                      ) : (
                        <span className="flex items-center justify-center">
                          {t.send}
                        </span>
                      )}
                    </button>

                    {isReportSubmitted && (
                      <p className="mt-5 text-center text-emerald-600 font-light animate-fadeIn" style={{ fontSize: '18px', fontFamily: "DefibeoMain, Civilprom, sans-serif" }}>
                        {t.messageSentSuccess}
                      </p>
                    )}
                  </div>
                </form>
              </div>
          </div>
        </div>
      )}
    </div>
  );
}
