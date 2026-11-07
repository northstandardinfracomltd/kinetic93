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
    infoGreenCard: "Contacter Defibeo: cliquez ici pour afficher les coordonnées de contact de votre pays.",
    infoBlueCard: "Devenir utilisateur: téléchargez la documentation du logiciel pour en savoir plus.",
    infoDarkCard: "Découvrir Defibeo: la solution métier dédiée à l'infogérance des défibrillateurs et équipements associés. Defibeo centralise la traçabilité des matériels et des pièces, la gestion de maintenance sur site (GMAO) ainsi que l'organisation des tournées (FSM).",
    infoGdpCard: "Le saviez-vous? Defibeo est une solution développée par Civilprom et en partenariat avec des experts du programme Google for Startups Accelerator (UK, Glasgow — Google Developer Program).",
    civilpromSolutionPill: "Une solution Civilprom",
    contactCoordsAria: "Coordonnées de contact",
    ecosystemHeaderPrefix: "À la découverte de l’écosystème Civilprom.",
    ecosystemHeaderHide: "Non merci, masquer cela.",
    ecosystemItems: [
      "Explorez les solutions Civilprom TheLab",
      "Participez au Civilprom Business Day 2027",
      "(Re)Découvrez Civilprom, éditeur de logiciels personnalisés",
      "Abonnez-vous à Civilprom sur LinkedIn",
    ],
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
    infoGreenCard: "Contact Defibeo: click here to view the contact details for your country.",
    infoBlueCard: "Become a user: download the software documentation to learn more.",
    infoDarkCard: "Discover Defibeo: The business solution dedicated to the managed services of defibrillators and associated equipment. Defibeo centralizes equipment and parts traceability, on-site maintenance management (CMMS) and route planning (FSM).",
    infoGdpCard: "Did you know? Defibeo is a solution developed by Civilprom and in partnership with experts from the Google for Startups Accelerator program (UK, Glasgow — Google Developer Program).",
    civilpromSolutionPill: "A Civilprom solution",
    contactCoordsAria: "Contact details",
    ecosystemHeaderPrefix: "Discovering the Civilprom ecosystem.",
    ecosystemHeaderHide: "No thanks, hide this.",
    ecosystemItems: [
      "Explore Civilprom TheLab solutions",
      "Join the Civilprom Business Day 2027",
      "(Re)Discover Civilprom, custom software publisher",
      "Follow Civilprom on LinkedIn",
    ],
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
    infoGreenCard: "Defibeo kontaktieren: Klicken Sie hier, um die Kontaktdaten für Ihr Land anzuzeigen.",
    infoBlueCard: "Nutzer werden: Laden Sie die Softwaredokumentation herunter, um mehr zu erfahren.",
    infoDarkCard: "Entdecken Sie Defibeo: Die Fachlösung für das Management von Defibrillatoren und zugehörigen Geräten. Defibeo zentralisiert die Rückverfolgbarkeit von Geräten und Ersatzteilen, das Vor-Ort-Wartungsmanagement (CMMS) sowie die Tourenplanung (FSM).",
    infoGdpCard: "Wussten Sie schon? Defibeo ist eine von Civilprom und in Partnerschaft mit Experten des Google for Startups Accelerator-Programms (UK, Glasgow — Google Developer Program) entwickelte Lösung.",
    civilpromSolutionPill: "Eine Lösung von Civilprom",
    contactCoordsAria: "Kontaktdaten",
    ecosystemHeaderPrefix: "Entdecken Sie das Civilprom-Ökosystem.",
    ecosystemHeaderHide: "Nein danke, ausblenden.",
    ecosystemItems: [
      "Entdecken Sie die Lösungen von Civilprom TheLab",
      "Nehmen Sie am Civilprom Business Day 2027 teil",
      "Entdecken Sie Civilprom, Herausgeber individueller Software",
      "Folgen Sie Civilprom auf LinkedIn",
    ],
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
    infoGreenCard: "Contactar a Defibeo: clique aqui para ver os dados de contacto do seu país.",
    infoBlueCard: "Tornar-se utilizador: descarregue a documentação do software para saber mais.",
    infoDarkCard: "Descubra a Defibeo: A solução empresarial dedicada à gestão de desfibrilhadores e equipamentos associados. A Defibeo centraliza a rastreabilidade de equipamentos e peças, a gestão de manutenção no local (GMAO) e o planeamento de rotas (FSM).",
    infoGdpCard: "Sabia que? A Defibeo é uma solução desenvolvida pela Civilprom e em parceria com especialistas do programa Google for Startups Accelerator (UK, Glasgow — Google Developer Program).",
    civilpromSolutionPill: "Uma solução Civilprom",
    contactCoordsAria: "Dados de contacto",
    ecosystemHeaderPrefix: "À descoberta do ecossistema Civilprom.",
    ecosystemHeaderHide: "Não, obrigado, ocultar isto.",
    ecosystemItems: [
      "Explore as soluções Civilprom TheLab",
      "Participe no Civilprom Business Day 2027",
      "(Re)Descubra a Civilprom, editora de software personalizado",
      "Siga a Civilprom no LinkedIn",
    ],
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
    infoGreenCard: "Contactar con Defibeo: haga clic aquí para ver los datos de contacto de su país.",
    infoBlueCard: "Convertirse en usuario: descargue la documentación del software para saber más.",
    infoDarkCard: "Descubra Defibeo: La solución profesional dedicada a la gestión integral de desfibriladores y equipos asociados. Defibeo centraliza la trazabilidad de equipos y piezas, la gestión de mantenimiento en sitio (GMAO) y la organización de rutas (FSM).",
    infoGdpCard: "¿Sabías que? Defibeo es una solución desarrollada por Civilprom y en colaboración con expertos del programa Google for Startups Accelerator (UK, Glasgow — Google Developer Program).",
    civilpromSolutionPill: "Una solución de Civilprom",
    contactCoordsAria: "Datos de contacto",
    ecosystemHeaderPrefix: "Descubriendo el ecosistema Civilprom.",
    ecosystemHeaderHide: "No gracias, ocultar esto.",
    ecosystemItems: [
      "Explore las soluciones de Civilprom TheLab",
      "Participe en el Civilprom Business Day 2027",
      "(Re)Descubra Civilprom, editor de software personalizado",
      "Suscríbase a Civilprom en LinkedIn",
    ],
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
  const [isMobileOrTablet, setIsMobileOrTablet] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.innerWidth < 1300 ||
      window.innerHeight < 640 ||
      window.matchMedia('(max-width: 1299px), (max-height: 639px)').matches
    );
  });
  const [loginRole, setLoginRole] = useState<'admin' | 'client' | 'technicien'>(() => {
    if (
      typeof window !== 'undefined' &&
      (window.innerWidth < 1300 ||
        window.innerHeight < 640 ||
        window.matchMedia('(max-width: 1299px), (max-height: 639px)').matches)
    ) {
      return 'technicien';
    }
    return 'admin';
  });
  const [isLogoHovered, setIsLogoHovered] = useState(false);
  const rolePillVisualRef = React.useRef<HTMLDivElement | null>(null);
  const langPillVisualRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 1299px), (max-height: 639px)');
    const update = () => {
      const matches = mq.matches || window.innerWidth < 1300 || window.innerHeight < 640;
      setIsMobileOrTablet(matches);
      if (matches) {
        setLoginRole((prev) => (prev === 'admin' ? 'technicien' : prev));
      } else {
        setLoginRole((prev) => (prev === 'technicien' ? 'admin' : prev));
      }
    };
    update();
    mq.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      mq.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const playPillWaveOnElement = (el: HTMLDivElement | null) => {
    if (!el) return;
    el.classList.remove('sidebar-nav-click-shrink-wave');
    void el.offsetWidth;
    el.classList.add('sidebar-nav-click-shrink-wave');
  };
  
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
    const fullCode = authCodeDigits.join('').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (fullCode.length < 6) {
      setError(t.authCodeInvalid || "Veuillez saisir les 6 caractères du code.");
      return;
    }
    if (!pendingUser) return;

    setIsLoading(true);
    try {
      let verifyRes: Response | null = null;
      let verifyData: any = null;

      // Automatically retry up to 3 times if the server is waking up or returns 502/503/504
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          verifyRes = await fetch('/api/auth/verify-tenant-member', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: pendingUser.loginIdentifier,
              role: loginRole,
              authCode: fullCode,
            }),
          });
          if (verifyRes.ok) {
            verifyData = await verifyRes.json().catch(() => ({}));
            break;
          }
          if (verifyRes.status < 500) {
            verifyData = await verifyRes.json().catch(() => ({}));
            break;
          }
        } catch (_) {}
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 900 * attempt));
        }
      }

      if (!verifyRes || !verifyRes.ok) {
        setError("Le serveur est momentanément occupé (503). Veuillez recliquer sur Valider dans quelques secondes.");
        setIsLoading(false);
        return;
      }

      if (!verifyData?.matched || !verifyData?.codeVerified) {
        setError(verifyData?.error || t.authCodeInvalid || "Code d'authentification incorrect. Veuillez vérifier le code reçu.");
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

      let verifyData: any = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          verifyData = await performVerifyRequest();
          if (verifyData !== null) break;
        } catch (_) {}
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 800 * attempt));
        }
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

  const [showLeftGreenCard, setShowLeftGreenCard] = useState(true);
  const [showLeftBlueCard, setShowLeftBlueCard] = useState(true);
  const [showLeftDarkCard, setShowLeftDarkCard] = useState(true);
  const [showRightGdpCard, setShowRightGdpCard] = useState(true);
  const [showEcosystemPill, setShowEcosystemPill] = useState(true);
  const [ecosystemIndex, setEcosystemIndex] = useState(0);
  const [ecosystemExpanded, setEcosystemExpanded] = useState(false);

  const ecosystemLinks = [
    {
      icon: 'https://civilprom.s3.eu-north-1.amazonaws.com/defibeologininfoslab.svg',
      url: 'https://civilprom.com/thelab',
    },
    {
      icon: 'https://civilprom.s3.eu-north-1.amazonaws.com/defibeologininfosuser.svg',
      url: 'https://civilprom.com/businessday2027',
    },
    {
      icon: 'https://civilprom.s3.eu-north-1.amazonaws.com/defibeologininfosscissors.svg',
      url: 'https://civilprom.com/fromdefibeo',
    },
    {
      icon: 'https://civilprom.s3.eu-north-1.amazonaws.com/defibeologininfosfire.svg',
      url: 'https://www.linkedin.com/company/civilprom/',
    },
  ];

  useEffect(() => {
    if (!showEcosystemPill || isMobileOrTablet) return;
    let initTimer: ReturnType<typeof setTimeout> | null = null;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    let closeTimer: ReturnType<typeof setTimeout> | null = null;
    let openTimer: ReturnType<typeof setTimeout> | null = null;

    const ROLL_MS = 520;
    const DISPLAY_MS = 6000;

    const runCycle = () => {
      // Stay open for a full 6000ms (excluding appear/disappear roll duration)
      holdTimer = setTimeout(() => {
        // Roll left to hide text
        setEcosystemExpanded(false);
        closeTimer = setTimeout(() => {
          // Switch to next item and roll right to reveal text
          setEcosystemIndex((prev) => (prev + 1) % 4);
          setEcosystemExpanded(true);
          openTimer = setTimeout(() => {
            runCycle();
          }, ROLL_MS);
        }, ROLL_MS);
      }, DISPLAY_MS);
    };

    // Initial roll right appearance on mount
    initTimer = setTimeout(() => {
      setEcosystemExpanded(true);
      openTimer = setTimeout(() => {
        runCycle();
      }, ROLL_MS);
    }, 60);

    return () => {
      if (initTimer) clearTimeout(initTimer);
      if (holdTimer) clearTimeout(holdTimer);
      if (closeTimer) clearTimeout(closeTimer);
      if (openTimer) clearTimeout(openTimer);
    };
  }, [showEcosystemPill, isMobileOrTablet]);

  const roleLabel =
    loginRole === 'admin'
      ? t.admin
      : loginRole === 'technicien'
      ? t.technicien
      : t.client;

  return (
    <div
      className="min-h-screen w-full flex flex-col-reverse lg:flex-row font-sans relative overflow-x-hidden"
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

        #login-left-mobile-copyright {
          display: none;
        }

        @media (max-width: 1299px), (max-height: 639px) {
          #login-viewport-wrapper {
            flex-direction: column-reverse !important;
          }
          #login-left-column {
            width: 100% !important;
            height: auto !important;
            min-height: 250px !important;
            flex-direction: column !important;
            align-items: center !important;
          }
          #login-left-column > img {
            position: absolute !important;
            max-width: 45% !important;
          }
          #login-left-info-cards {
            position: relative !important;
            top: auto !important;
            left: auto !important;
            right: auto !important;
            width: 100% !important;
            padding: 16px !important;
            padding-bottom: 8px !important;
          }
          #login-left-logo-container {
            position: relative !important;
            bottom: auto !important;
            left: auto !important;
            width: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            margin-top: 24px !important;
            margin-bottom: 32px !important;
          }
          #login-right-column {
            width: 100% !important;
            min-height: 460px !important;
            flex: 1 1 auto !important;
          }
          #login-right-copyright {
            display: none !important;
          }
          #login-left-mobile-copyright {
            display: block !important;
          }
        }

        .login-info-card-zoom {
          transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
          will-change: transform;
        }
        .login-info-card-zoom:hover {
          transform: scale(1.02);
        }

        @keyframes loginCloseZoomDezoom {
          0% { transform: scale(1); }
          35% { transform: scale(1.22); }
          70% { transform: scale(0.9); }
          100% { transform: scale(1.1); }
        }
        .login-close-btn-zoom {
          transition: transform 220ms ease;
          will-change: transform;
        }
        .login-close-btn-zoom:hover {
          animation: loginCloseZoomDezoom 520ms ease-in-out forwards;
        }

        .login-ecosystem-prefix {
          color: rgb(39 4 91 / 40%);
          transition: color 200ms ease;
        }
        .login-ecosystem-prefix:hover {
          color: rgb(39 4 91);
        }

        .login-ecosystem-hide-btn {
          color: rgb(246 58 8 / 40%);
          transition: color 200ms ease;
        }
        .login-ecosystem-hide-btn:hover {
          color: rgb(246 58 8);
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

      {/* Left Column (Top on Mobile & Vertical Tablet, Left on Desktop) */}
      <div
        className="w-full lg:w-1/2 min-h-[250px] lg:min-h-screen lg:h-screen relative overflow-hidden flex items-stretch shrink-0"
        style={{ backgroundColor: '#e9edf1' }}
        id="login-left-column"
      >
        <img
          src="https://civilprom.s3.eu-north-1.amazonaws.com/loginpcillustration.svg"
          alt="Illustration Connexion"
          className="h-full w-auto max-w-[45%] lg:max-w-none object-contain object-left select-none pointer-events-none absolute lg:static inset-y-0 left-0"
          style={{ height: '100%', alignSelf: 'flex-start' }}
        />

        {/* Gradient color overlay above the illustration */}
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            background: 'linear-gradient(1deg, rgb(245, 247, 250), transparent)',
          }}
        />

        {/* Top Ecosystem Pill (PC only) + 2+1 Info Notification Cards */}
        {((showEcosystemPill && !isMobileOrTablet) || showLeftGreenCard || showLeftBlueCard || showLeftDarkCard) && (
          <div
            className="relative lg:absolute lg:top-5 lg:left-5 lg:right-5 z-20 w-full lg:w-auto p-4 lg:p-0 pb-24 lg:pb-0 flex flex-col gap-4"
            id="login-left-info-cards"
          >
            {showEcosystemPill && !isMobileOrTablet && (
              <div className="flex flex-col items-start gap-2.5 mb-1" id="login-ecosystem-pill-wrapper">
                <div
                  className="text-[15px] leading-snug select-none"
                  style={{
                    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                    marginLeft: '4px',
                  }}
                >
                  <span className="login-ecosystem-prefix">{t.ecosystemHeaderPrefix} </span>
                  <button
                    type="button"
                    onClick={() => setShowEcosystemPill(false)}
                    className="login-ecosystem-hide-btn bg-transparent border-0 p-0 cursor-pointer no-underline"
                    style={{
                      fontSize: '15px',
                      textDecoration: 'none',
                      fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                    }}
                  >
                    {t.ecosystemHeaderHide}
                  </button>
                </div>

                <a
                  href={ecosystemLinks[ecosystemIndex].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="login-info-card-zoom inline-flex items-center rounded-full cursor-pointer select-none no-underline overflow-hidden"
                  style={{
                    backgroundColor: '#27045b',
                    color: '#ffffff',
                    padding: '5px',
                    minHeight: '48px',
                  }}
                >
                  <div
                    style={{
                      maxWidth: ecosystemExpanded ? '720px' : '0px',
                      opacity: ecosystemExpanded ? 1 : 0,
                      paddingLeft: ecosystemExpanded ? '16px' : '0px',
                      paddingRight: ecosystemExpanded ? '12px' : '0px',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      transition:
                        'max-width 520ms cubic-bezier(0.4, 0, 0.2, 1), opacity 360ms ease, padding 520ms cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  >
                    <span
                      style={{
                        color: '#ffffff',
                        fontSize: '17px',
                        fontWeight: 400,
                        lineHeight: 1.2,
                        fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                      }}
                    >
                      {t.ecosystemItems[ecosystemIndex]}
                    </span>
                  </div>

                  <img
                    src={ecosystemLinks[ecosystemIndex].icon}
                    alt=""
                    className="w-[38px] h-[38px] rounded-full object-contain shrink-0 select-none pointer-events-none"
                    style={{
                      transform: ecosystemExpanded ? 'rotate(360deg)' : 'rotate(0deg)',
                      transition: 'transform 520ms cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  />
                </a>
              </div>
            )}

            {(showLeftGreenCard || showLeftBlueCard) && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {showLeftGreenCard && (
                  <div
                    className="login-info-card-zoom relative flex items-center gap-4 rounded-[22px] p-5 cursor-pointer select-none"
                    style={{
                      backgroundColor: '#3ddc84',
                      minHeight: '176px',
                    }}
                  >
                    <img
                      src="https://civilprom.s3.eu-north-1.amazonaws.com/defibeowebsite-illustrationgreen.svg"
                      alt=""
                      className="w-[96px] h-[126px] object-contain shrink-0 select-none pointer-events-none"
                    />
                    <div
                      className="flex-1 pr-9"
                      style={{
                        color: '#156337',
                        fontSize: '18px',
                        lineHeight: '1.38',
                        fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                      }}
                    >
                      {t.infoGreenCard}
                    </div>
                    <select
                      aria-label={t.contactCoordsAria}
                      value=""
                      onChange={(e) => {
                        const val = e.target.value;
                        e.target.value = '';
                        if (val === 'tel') {
                          if (isMobileOrTablet) {
                            window.location.href = 'tel:+33651517065';
                          } else {
                            const win = window.open('tel:+33651517065', '_blank');
                            if (!win) window.location.href = 'tel:+33651517065';
                          }
                        } else if (val === 'mail') {
                          if (isMobileOrTablet) {
                            window.location.href = 'mailto:contact@defibeo.com';
                          } else {
                            const win = window.open('mailto:contact@defibeo.com', '_blank');
                            if (!win) window.location.href = 'mailto:contact@defibeo.com';
                          }
                        } else if (val === 'whatsapp') {
                          const url = 'https://wa.me/447723501018';
                          const win = window.open(url, '_blank', 'noopener,noreferrer');
                          if (!win) {
                            window.location.href = url;
                          }
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    >
                      <option value="" disabled hidden>
                        {t.contactCoordsAria}
                      </option>
                      <option value="tel">Tel: +33 6 51 51 70 65</option>
                      <option value="mail">Mail: contact@defibeo.com</option>
                      <option value="whatsapp">WhatsApp: +447723 501018</option>
                    </select>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowLeftGreenCard(false);
                      }}
                      className="login-close-btn-zoom absolute top-3.5 right-3.5 z-20 p-0 bg-transparent border-0 cursor-pointer flex items-center justify-center"
                      aria-label={t.close}
                    >
                      <img
                        src="https://civilprom.s3.eu-north-1.amazonaws.com/xrggreen.svg"
                        alt={t.close}
                        className="w-[38px] h-[38px] object-contain"
                      />
                    </button>
                  </div>
                )}

                {showLeftBlueCard && (
                  <div
                    onClick={() => window.open('https://defibeo.com/infos2026', '_blank', 'noopener,noreferrer')}
                    className="login-info-card-zoom relative flex items-center gap-4 rounded-[22px] p-5 cursor-pointer select-none"
                    style={{
                      backgroundColor: '#2546f0',
                      minHeight: '176px',
                    }}
                  >
                    <img
                      src="https://civilprom.s3.eu-north-1.amazonaws.com/defibeowebsite-illustrationblue.svg"
                      alt=""
                      className="w-[104px] h-[126px] object-contain shrink-0 select-none pointer-events-none"
                    />
                    <div
                      className="flex-1 pr-9"
                      style={{
                        color: '#ffffff',
                        fontSize: '18px',
                        lineHeight: '1.38',
                        fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                      }}
                    >
                      {t.infoBlueCard}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowLeftBlueCard(false);
                      }}
                      className="login-close-btn-zoom absolute top-3.5 right-3.5 z-20 p-0 bg-transparent border-0 cursor-pointer flex items-center justify-center"
                      aria-label={t.close}
                    >
                      <img
                        src="https://civilprom.s3.eu-north-1.amazonaws.com/xrgblue.svg"
                        alt={t.close}
                        className="w-[38px] h-[38px] object-contain"
                      />
                    </button>
                  </div>
                )}
              </div>
            )}

            {showLeftDarkCard && (
              <div
                onClick={() => window.open('https://defibeo.com/infos2026', '_blank', 'noopener,noreferrer')}
                className="login-info-card-zoom relative flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5 rounded-[22px] p-5 lg:p-6 cursor-pointer select-none"
                style={{
                  backgroundColor: '#050d26',
                  minHeight: '176px',
                }}
              >
                <img
                  src="https://civilprom.s3.eu-north-1.amazonaws.com/defibeowebsite-illustrationdarkblue.svg"
                  alt=""
                  className="w-[96px] h-[134px] object-contain shrink-0 select-none pointer-events-none"
                />
                <div
                  className="w-full sm:flex-1 sm:pr-10"
                  style={{
                    color: '#00e5ff',
                    fontSize: '18px',
                    lineHeight: '1.42',
                    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                  }}
                >
                  {t.infoDarkCard}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowLeftDarkCard(false);
                  }}
                  className="login-close-btn-zoom absolute top-3.5 right-3.5 z-20 p-0 bg-transparent border-0 cursor-pointer flex items-center justify-center"
                  aria-label={t.close}
                >
                  <img
                    src="https://civilprom.s3.eu-north-1.amazonaws.com/xrgdarkblue.svg"
                    alt={t.close}
                    className="w-[38px] h-[38px] object-contain"
                  />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Bottom-left Defibeo logo-icon with hover icon, 'Logiciel Defibeo' pill & non-clickable 'defibeo.com' text */}
        <div
          className="absolute bottom-6 left-6 lg:bottom-8 lg:left-8 z-20 flex flex-col items-center gap-2"
          id="login-left-logo-container"
        >
          <div
            className="sidebar-nav-item-bounce relative inline-flex items-center justify-center shrink-0 cursor-default"
            onMouseEnter={() => setIsLogoHovered(true)}
            onMouseLeave={() => setIsLogoHovered(false)}
            onClick={() => setIsLogoHovered((prev) => !prev)}
          >
            <div className="sidebar-nav-icon-bounce relative w-[42px] h-[42px] lg:w-[56px] lg:h-[56px] shrink-0 select-none pointer-events-none">
              <img
                src="https://civilprom.s3.eu-north-1.amazonaws.com/defibeoiconlogo2027.svg"
                alt="Logiciel Defibeo"
                loading="eager"
                decoding="sync"
                className={`absolute inset-0 w-full h-full object-contain block ${
                  isLogoHovered ? 'opacity-0' : 'opacity-100'
                }`}
                referrerPolicy="no-referrer"
              />
              <img
                src="https://civilprom.s3.eu-north-1.amazonaws.com/eclatdefibeoiconlogo2027.svg"
                alt="Logiciel Defibeo"
                loading="eager"
                decoding="sync"
                className={`absolute inset-0 w-full h-full object-contain block ${
                  isLogoHovered ? 'opacity-100' : 'opacity-0'
                }`}
                referrerPolicy="no-referrer"
              />
            </div>

            {isLogoHovered && (
              <div
                className="absolute z-[9999] pointer-events-none select-none shadow-md"
                style={{
                  left: 'calc(100% + 12px)',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  backgroundColor: '#0f172a',
                  color: '#ffffff',
                  borderRadius: '9999px',
                  padding: '6px 16px',
                  fontSize: '16px',
                  fontWeight: 400,
                  fontFamily: "DefibeoMain, Civilprom, sans-serif",
                  whiteSpace: 'nowrap',
                }}
              >
                Logiciel Defibeo
              </div>
            )}
          </div>
          <span
            className="select-none pointer-events-none inline-flex items-center justify-center"
            style={{
              background: '#cedeff',
              borderRadius: '31px',
              padding: '6px 12px',
              fontSize: '16px',
              color: 'rgb(49 86 255)',
              marginTop: '3px',
              fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
              lineHeight: '1.2',
            }}
          >
            defibeo.com
          </span>

          <div
            className="w-full text-center select-none px-4 mt-1 lg:hidden"
            style={{
              fontSize: '10px',
              color: 'rgb(245, 247, 250)',
              fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
            }}
            id="login-left-mobile-copyright"
          >
            © 2026 Defibeo by Civilprom. All rights reserved.{' '}
            <a
              href="https://www.google.com/maps/place/Glasgow+G2+7JS,+Royaume-Uni/@55.861508,-4.2638329,23a,75y,9.99h,87.78t/data=!3m7!1e1!3m5!1s9scepnhvnV6jweow3ObCPQ!2e0!6shttps:%2F%2Fstreetviewpixels-pa.clients6.google.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D2.2176239721206628%26panoid%3D9scepnhvnV6jweow3ObCPQ%26yaw%3D9.994148180894447!7i16384!8i8192!4m6!3m5!1s0x4888469d64ac6abd:0xa74cf672bd0fbe9!8m2!3d55.8616882!4d-4.263924!16s%2Fg%2F1vj5zsnf?entry=ttu&g_ep=EgoyMDI2MTEwMS4wIKXMDSoASAFQAw%3D%3D"
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline transition-opacity duration-200 hover:opacity-65 cursor-pointer"
              style={{
                color: 'rgb(245, 247, 250)',
                textDecoration: 'none',
              }}
            >
              Civilprom UK, Glasgow, G2 7JS, 120
            </a>{' '}
            (prod-525b2634).
          </div>
        </div>
      </div>

      {/* Right Column (Top on Mobile & Vertical Tablet, Right on Desktop) */}
      <div
        className="w-full lg:w-1/2 min-h-[460px] lg:min-h-screen flex-1 flex flex-col justify-between items-center px-4 pt-16 pb-5 lg:px-5 lg:pt-12 relative"
        style={{ backgroundColor: '#375bff' }}
        id="login-right-column"
      >
        {/* Top-right Language selector pill */}
        <div
          className="absolute top-4 right-4 lg:top-5 lg:right-5 z-20 flex items-center"
          id="login-right-lang-control"
        >
          <div className="relative inline-flex items-center justify-center cursor-pointer select-none">
            <div
              ref={langPillVisualRef}
              onAnimationEnd={(e) => e.currentTarget.classList.remove('sidebar-nav-click-shrink-wave')}
              className="pointer-events-none relative overflow-hidden inline-flex items-center justify-center rounded-full px-5 py-2"
              style={{
                backgroundColor: '#4f6dff',
                color: '#ffffff',
                fontSize: '18px',
                borderRadius: '9999px',
                fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                transformOrigin: 'center center',
              }}
            >
              <span className="pointer-events-none whitespace-nowrap">
                {selectedLang}
              </span>
            </div>
            <select
              aria-label={t.chooseLangAria}
              value={selectedLang}
              onPointerDown={() => playPillWaveOnElement(langPillVisualRef.current)}
              onChange={(e) => {
                playPillWaveOnElement(langPillVisualRef.current);
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

        <div className="flex-1 flex flex-col justify-center items-center w-full">
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
                      <div className="animate-text-wave" style={{ minHeight: '25px' }}>{typedAuthLine1}</div>
                      <div className="animate-text-wave" style={{ minHeight: '25px' }}>{typedAuthLine2}</div>
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
                  <div className="animate-text-wave" style={{ minHeight: '25px' }}>{typedLine1}</div>
                  <div className="animate-text-wave" style={{ minHeight: '25px' }}>{typedLine2}</div>
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

                {/* Role toggle: Admin / Client on PC, Technicien / Client on mobile & tablet */}
                <div
                  className="relative grid grid-cols-2 w-full overflow-hidden"
                  style={{
                    backgroundColor: '#4d6dff',
                    borderRadius: '10px',
                    padding: '5px',
                  }}
                  id="login-role-toggle"
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none"
                    style={{
                      position: 'absolute',
                      top: '5px',
                      bottom: '5px',
                      left: '5px',
                      width: 'calc((100% - 10px) / 2)',
                      borderRadius: '8px',
                      backgroundColor: '#1d0245',
                      transform: loginRole === 'client' ? 'translateX(100%)' : 'translateX(0%)',
                      transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  />
                  {(isMobileOrTablet
                    ? (['technicien', 'client'] as const)
                    : (['admin', 'client'] as const)
                  ).map((role) => {
                    const isSelected = loginRole === role;
                    const label =
                      role === 'admin'
                        ? t.admin
                        : role === 'technicien'
                        ? t.technicien
                        : t.client;
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => {
                          setLoginRole(role);
                          setError('');
                        }}
                        className="relative z-10 w-full flex items-center justify-center cursor-pointer select-none"
                        style={{
                          height: '44px',
                          borderRadius: '8px',
                          backgroundColor: 'transparent',
                          color: isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.65)',
                          fontSize: '18px',
                          fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                          border: 'none',
                          outline: 'none',
                          transition: 'color 250ms ease',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

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

                {/* Legal terms & privacy notice */}
                <div
                  className="text-left leading-snug"
                  style={{
                    fontSize: '12px',
                    color: '#A4B5FF',
                    textAlign: 'left',
                    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                  }}
                >
                  En continuant, vous acceptez les{' '}
                  <a
                    href="https://defibeo.com/documents/termsuse"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                    style={{ color: '#fff', fontSize: '12px' }}
                  >
                    Conditions générales d’utilisation
                  </a>{' '}
                  de Defibeo. Consultez notre{' '}
                  <a
                    href="https://defibeo.com/documents/privacypolicy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                    style={{ color: '#fff', fontSize: '12px' }}
                  >
                    Politique de confidentialité
                  </a>{' '}
                  et de{' '}
                  <a
                    href="https://defibeo.com/documents/dataprotection"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                    style={{ color: '#fff', fontSize: '12px' }}
                  >
                    Protection des données.
                  </a>
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

        {/* Bottom Info Card & Footer Copyright in Right Column */}
        <div className="w-full flex flex-col items-center gap-3.5 pt-8">
          {showRightGdpCard && (
            <div
              className="login-info-card-zoom relative w-full hidden sm:flex flex-col sm:flex-row items-center gap-5 rounded-[22px] p-5 lg:px-7 lg:py-5 select-none"
              style={{
                backgroundColor: '#ffffff',
                minHeight: '132px',
              }}
              id="login-right-gdp-card"
            >
              <img
                src="https://civilprom.s3.eu-north-1.amazonaws.com/defibeowebsite-gdp.svg"
                alt="Google Developer Program"
                className="w-[220px] sm:w-[240px] max-h-[82px] object-contain shrink-0 select-none pointer-events-none"
              />
              <div
                className="flex-1 pr-10 text-left"
                style={{
                  color: '#000000',
                  fontSize: '18px',
                  lineHeight: '1.4',
                  fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                }}
              >
                {t.infoGdpCard}
              </div>
              <button
                type="button"
                onClick={() => setShowRightGdpCard(false)}
                className="login-close-btn-zoom absolute top-3.5 right-3.5 z-20 p-0 bg-transparent border-0 cursor-pointer flex items-center justify-center"
                aria-label={t.close}
              >
                <img
                  src="https://civilprom.s3.eu-north-1.amazonaws.com/xrgblack.svg"
                  alt={t.close}
                  className="w-[38px] h-[38px] object-contain"
                />
              </button>
            </div>
          )}

          <div
            className="hidden lg:block w-full text-center select-none"
            style={{
              fontSize: '10px',
              color: '#a4b5ff',
              fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
            }}
            id="login-right-copyright"
          >
            © 2026 Defibeo by Civilprom. All rights reserved.{' '}
            <a
              href="https://www.google.com/maps/place/Glasgow+G2+7JS,+Royaume-Uni/@55.861508,-4.2638329,23a,75y,9.99h,87.78t/data=!3m7!1e1!3m5!1s9scepnhvnV6jweow3ObCPQ!2e0!6shttps:%2F%2Fstreetviewpixels-pa.clients6.google.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D2.2176239721206628%26panoid%3D9scepnhvnV6jweow3ObCPQ%26yaw%3D9.994148180894447!7i16384!8i8192!4m6!3m5!1s0x4888469d64ac6abd:0xa74cf672bd0fbe9!8m2!3d55.8616882!4d-4.263924!16s%2Fg%2F1vj5zsnf?entry=ttu&g_ep=EgoyMDI2MTEwMS4wIKXMDSoASAFQAw%3D%3D"
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline transition-opacity duration-200 hover:opacity-65 cursor-pointer"
              style={{
                color: '#a4b5ff',
                textDecoration: 'none',
              }}
            >
              Civilprom UK, Glasgow, G2 7JS, 120
            </a>{' '}
            (prod-525b2634).
          </div>
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
