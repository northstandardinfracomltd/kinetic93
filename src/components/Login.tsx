import React, { useState } from 'react';
import { AlertCircle, ShieldCheck, CheckCircle, Send, CreditCard } from 'lucide-react';
import { 
  registerNewTenant, 
  loginTenantAdmin, 
  getRegisteredTenants, 
  fetchCollectionFromFirestore,
  fetchRawCollectionFromFirestore,
  findTenantAndDefibGlobally,
  db
} from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { triggerEmail1Inscription, triggerEmail4Signalement } from '../utils/emailService';

interface LoginProps {
  onLoginSuccess: (email: string, name: string, tenantId: string, role?: string) => void;
}


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
    forgotPassword: "Mot de passe oublié",
  },
  'English': {
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
    forgotPassword: "Forgot password",
  },
  'Deutsch': {
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
    loginBtn: "Anzeigen",
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
    defibId: "Defibrillator-ID",
    defibIdPlace: "z.B. DEFIB-2026-PAU.",
    subject: "Betreff",
    subjectPlace: "z.B. Rote Lampe leuchtet / Schwache Batterie.",
    message: "Nachricht",
    messagePlace: "Beschreiben Sie das festgestellte Problem genau...",
    sending: "Senden...",
    send: "Senden",
    errorAdmin: "Falsche Admin-Anmeldedaten.",
    errorClient: "Falsche Client-Anmeldedaten.",
    errorTech: "Falsche Techniker-Anmeldedaten.",
    forgotPassword: "Passwort vergessen",
  },
  'Português': {
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
    forgotPassword: "Esqueceu a senha",
  },
  'Español': {
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
    forgotPassword: "Contraseña olvidada",
  }
};

export default function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Connection & Creation language selector state
  const [selectedLang, setSelectedLang] = useState(() => localStorage.getItem('defib_lang') || 'Français');

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
    fetch('https://api64.ipify.org?format=json')
      .then(res => res.json())
      .then(data => {
        if (data.ip) {
          setClientIp(data.ip);
        }
      })
      .catch(() => {
        // Fallback intact
      });
  }, []);

  const getBlockInfo = (): { count: number; blockedUntil: number; hoursText: string } | null => {
    try {
      const stored = localStorage.getItem(`login_attempts_${clientIp}`);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      if (parsed.blockedUntil && Date.now() < parsed.blockedUntil) {
        let h = '1h';
        if (parsed.count >= 10) h = '24h';
        else if (parsed.count >= 5) h = '10h';
        return { ...parsed, hoursText: h };
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  };

  const handleFailedAttempt = () => {
    try {
      const stored = localStorage.getItem(`login_attempts_${clientIp}`);
      let parsed = { count: 0, blockedUntil: 0 };
      if (stored) {
        parsed = JSON.parse(stored);
      }
      
      parsed.count = (parsed.count || 0) + 1;
      
      let blockDurationMs = 0;
      let hoursText = '';
      if (parsed.count >= 10) {
        blockDurationMs = 24 * 60 * 60 * 1000;
        hoursText = '24h';
      } else if (parsed.count >= 5) {
        blockDurationMs = 10 * 60 * 60 * 1000;
        hoursText = '10h';
      } else if (parsed.count >= 3) {
        blockDurationMs = 1 * 60 * 60 * 1000;
        hoursText = '1h';
      }
      
      if (blockDurationMs > 0) {
        parsed.blockedUntil = Date.now() + blockDurationMs;
        localStorage.setItem(`login_attempts_${clientIp}`, JSON.stringify(parsed));
        setError(`Vous avez effectué plusieurs tentatives de connexions. Par sécurité, veuillez patienter ${hoursText} avant d'essayer à nouveau.`);
      } else {
        localStorage.setItem(`login_attempts_${clientIp}`, JSON.stringify(parsed));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSuccessLogin = (emailVal: string, nameVal: string, tenantIdVal: string, roleVal?: string) => {
    try {
      localStorage.removeItem(`login_attempts_${clientIp}`);
    } catch (e) {
      console.error(e);
    }
    onLoginSuccess(emailVal, nameVal, tenantIdVal, roleVal);
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
  const [reqLang, setReqLang] = useState(() => localStorage.getItem('defib_lang') || 'Français');

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

    // Preemptive block check
    const block = getBlockInfo();
    if (block) {
      setError(`Vous avez effectué plusieurs tentatives de connexions. Par sécurité, veuillez patienter ${block.hoursText} avant d'essayer à nouveau.`);
      return;
    }

    setIsLoading(true);

    const emailLower = email.trim().toLowerCase();
    const pass = password.trim();

    try {
      if (loginRole === 'admin') {
        const tenant = await loginTenantAdmin(emailLower, pass);
        if (tenant) {
          if (tenant.disabled) {
            setError("Votre compte est suspendu, contactez Défibeo pour réactiver votre environnement.");
            setIsLoading(false);
            return;
          }
          handleSuccessLogin(tenant.adminEmail, tenant.adminName, tenant.id, 'admin');
        } else {
          // Check for sub-account "Administrateur" members across all tenants in parallel
          const tenants = await getRegisteredTenants();
          let matchedAdmin: any = null;
          let matchedTenantId = 'demo';

          const results = await Promise.all(
            tenants.map(async (tnt) => {
              const tenantId = tnt.id;
              const key = tenantId === 'demo' ? 'members' : `${tenantId}_members`;
              try {
                const fetchedMembers = await fetchRawCollectionFromFirestore<any[]>(key);
                if (fetchedMembers && Array.isArray(fetchedMembers)) {
                  const found = fetchedMembers.find(
                    (m: any) =>
                      m.email && m.email.trim().toLowerCase() === emailLower &&
                      m.pin && m.pin.trim() === pass &&
                      (m.role?.toLowerCase().includes('admin') || m.role?.toLowerCase().includes('propriétaire'))
                  );
                  if (found) {
                    return { found, tenantId };
                  }
                }
              } catch (err) {
                console.error(`Error checking sub-admin in tenant ${tenantId}:`, err);
              }
              return null;
            })
          );

          const matchedAdminResult = results.find(r => r !== null);
          if (matchedAdminResult) {
            matchedAdmin = matchedAdminResult.found;
            matchedTenantId = matchedAdminResult.tenantId;
          }

          if (matchedAdmin) {
            // Check if this tenant is suspended
            const matchedTenant = tenants.find(t => t.id === matchedTenantId);
            if (matchedTenant && matchedTenant.disabled) {
              setError("Votre compte est suspendu, contactez Défibeo pour réactiver votre environnement.");
              setIsLoading(false);
              return;
            }
            handleSuccessLogin(matchedAdmin.email, matchedAdmin.name, matchedTenantId, 'admin');
          } else {
            setError(t.errorAdmin);
            setIsLoading(false);
            handleFailedAttempt();
          }
        }
      } else if (loginRole === 'client') {
        // Authenticate client globally
        if (emailLower === 'client@demo.com' && pass === 'client123') {
          handleSuccessLogin('client@demo.com', 'Client Démo', 'demo', 'client');
          return;
        }

        const tenants = await getRegisteredTenants();
        let matchedClient: any = null;
        let matchedTenantId = 'demo';

        // Search for this client in each tenant's clients collection in parallel
        const results = await Promise.all(
          tenants.map(async (tnt) => {
            const tenantId = tnt.id;
            const key = tenantId === 'demo' ? 'clients' : `${tenantId}_clients`;
            try {
              const fetchedClients = await fetchRawCollectionFromFirestore<any[]>(key);
              if (fetchedClients && Array.isArray(fetchedClients)) {
                const found = fetchedClients.find(
                  (c: any) =>
                    ((c.email && c.email.trim().toLowerCase() === emailLower) ||
                     (c.denomination && c.denomination.trim().toLowerCase() === emailLower)) &&
                    c.accessKey && c.accessKey.trim() === pass
                );
                if (found) {
                  return { found, tenantId };
                }
              }
            } catch (err) {
              console.error(`Error checking client in tenant ${tenantId}:`, err);
            }
            return null;
          })
        );

        const matchedClientResult = results.find(r => r !== null);
        if (matchedClientResult) {
          matchedClient = matchedClientResult.found;
          matchedTenantId = matchedClientResult.tenantId;
        }

        if (matchedClient) {
          // Check if this tenant is suspended
          const matchedTenant = tenants.find(t => t.id === matchedTenantId);
          if (matchedTenant && matchedTenant.disabled) {
            setError("Votre compte est suspendu, contactez Défibeo pour réactiver votre environnement.");
            setIsLoading(false);
            return;
          }
          handleSuccessLogin(matchedClient.email, matchedClient.denomination, matchedTenantId, 'client');
        } else {
          setError(t.errorClient);
          setIsLoading(false);
          handleFailedAttempt();
        }
      } else if (loginRole === 'technicien') {
        // Hidden mega-admin entrance check
        if (emailLower === 'is/megaadmin98121928/' && pass === '93931') {
          handleSuccessLogin('megaadmin@defibeo.com', 'Mega Admin', 'megaadmin', 'megaadmin');
          setIsLoading(false);
          return;
        }

        // Authenticate technician globally
        if (emailLower === 'tech.ouest@defibeo.com' && pass === '4321') {
          handleSuccessLogin('tech.ouest@defibeo.com', 'Technicien Ouest', 'demo', 'technicien');
          return;
        }

        const tenants = await getRegisteredTenants();
        let matchedMember: any = null;
        let matchedTenantId = 'demo';

        // Search for this member in each tenant's members list in parallel
        const results = await Promise.all(
          tenants.map(async (tnt) => {
            const tenantId = tnt.id;
            const key = tenantId === 'demo' ? 'members' : `${tenantId}_members`;
            try {
              const fetchedMembers = await fetchRawCollectionFromFirestore<any[]>(key);
              if (fetchedMembers && Array.isArray(fetchedMembers)) {
                const found = fetchedMembers.find(
                  (m: any) =>
                    ((m.email && m.email.trim().toLowerCase() === emailLower) ||
                     (m.name && m.name.trim().toLowerCase() === emailLower)) &&
                    m.pin && m.pin.trim() === pass &&
                    (m.role?.toLowerCase().includes('tech') || m.role?.toLowerCase().includes('technicien') || m.role?.toLowerCase().includes('maintenance'))
                );
                if (found) {
                  return { found, tenantId };
                }
              }
            } catch (err) {
              console.error(`Error checking tech in tenant ${tenantId}:`, err);
            }
            return null;
          })
        );

        const matchedMemberResult = results.find(r => r !== null);
        if (matchedMemberResult) {
          matchedMember = matchedMemberResult.found;
          matchedTenantId = matchedMemberResult.tenantId;
        }

        if (matchedMember) {
          // Check if this tenant is suspended
          const matchedTenant = tenants.find(t => t.id === matchedTenantId);
          if (matchedTenant && matchedTenant.disabled) {
            setError("Votre compte est suspendu, contactez Défibeo pour réactiver votre environnement.");
            setIsLoading(false);
            return;
          }
          handleSuccessLogin(matchedMember.email, matchedMember.name, matchedTenantId, 'technicien');
        } else {
          setError(t.errorTech);
          setIsLoading(false);
          handleFailedAttempt();
        }
      }
    } catch (err: any) {
      console.error('Error logging in:', err);
      setError('Erreur lors de la connexion: ' + (err.message || String(err)));
      setIsLoading(false);
      handleFailedAttempt();
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

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans relative" id="login-viewport-wrapper">
      <style>{`
        body {
          background: radial-gradient(#7e2e86, #36093a) !important;
        }
        #connexion-lang-picker select {
          width: auto !important;
          background: #732c78 !important;
          border: none !important;
          border-radius: 9999px !important;
          padding: 8px 10px !important;
          display: inline-flex !important;
          align-items: center !important;
          cursor: pointer !important;
          margin-bottom: 10px !important;
          font-size: 15px !important;
          font-weight: 500 !important;
          color: #ffffff !important;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
          outline: none !important;
          font-family: 'DefibeoMain', 'Civilprom', sans-serif !important;
          box-shadow: none !important;
          appearance: none !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          text-align: center !important;
          text-align-last: center !important;
        }
        #connexion-lang-picker select:hover {
          background: #732c78 !important;
          border: none !important;
        }
        #connexion-lang-picker select::-ms-expand {
          display: none !important;
        }
        #connexion-lang-picker select option {
          background-color: #36093a !important;
          color: #ffffff !important;
        }
        #register-lang-dropdown {
          appearance: none !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          background-image: none !important;
          text-align: center !important;
          text-align-last: center !important;
        }
        #register-lang-dropdown::-ms-expand {
          display: none !important;
        }
        #register-lang-dropdown option {
          background-color: #ffffff !important;
          color: #000000 !important;
        }
        
        #auth-main-card input, #auth-main-card select, #popup-main-card input, #popup-main-card select, #popup-main-card textarea {
          border: 1px solid #dedede !important;
          border-radius: 13px !important;
          padding: 14px !important;
          font-size: 18px !important;
          font-weight: 100 !important;
          color: #000000 !important;
          background-color: #ffffff !important;
          outline: none !important;
          transition: all 0s !important;
          font-family: 'DefibeoMain', 'Civilprom', sans-serif !important;
        }
        
        #popup-main-card textarea {
          width: 100% !important;
          display: block !important;
        }
        
        #auth-main-card input:hover, #auth-main-card select:hover,
        #auth-main-card input:focus, #auth-main-card select:focus,
        #popup-main-card input:hover, #popup-main-card select:hover, #popup-main-card textarea:hover,
        #popup-main-card input:focus, #popup-main-card select:focus, #popup-main-card textarea:focus {
          outline: 2.5px solid #fa53d5 !important;
          outline-offset: 2px !important;
          transition: all 0s !important;
        }
        
        #auth-main-card input::placeholder, #popup-main-card input::placeholder, #popup-main-card textarea::placeholder {
          font-weight: 100 !important;
          color: #747474 !important;
          font-size: 18px !important;
          font-family: 'DefibeoMain', 'Civilprom', sans-serif !important;
          opacity: 1 !important;
        }
        #auth-main-card input::-webkit-input-placeholder, #popup-main-card input::-webkit-input-placeholder, #popup-main-card textarea::-webkit-input-placeholder {
          font-weight: 100 !important;
          color: #747474 !important;
          font-size: 18px !important;
          font-family: 'DefibeoMain', 'Civilprom', sans-serif !important;
        }
        #auth-main-card input::-moz-placeholder, #popup-main-card input::-moz-placeholder, #popup-main-card textarea::-moz-placeholder {
          font-weight: 100 !important;
          color: #747474 !important;
          font-size: 18px !important;
          font-family: 'DefibeoMain', 'Civilprom', sans-serif !important;
        }
        #auth-main-card input:-ms-input-placeholder, #popup-main-card input:-ms-input-placeholder, #popup-main-card textarea:-ms-input-placeholder {
          font-weight: 100 !important;
          color: #747474 !important;
          font-size: 18px !important;
          font-family: 'DefibeoMain', 'Civilprom', sans-serif !important;
        }
        
        #auth-main-card label, #popup-main-card label {
          color: #000000 !important;
          text-transform: none !important;
          letter-spacing: normal !important;
          font-weight: 500 !important;
          font-size: 18px !important;
          font-family: 'DefibeoMain', 'Civilprom', sans-serif !important;
        }
        
        #auth-toggle-capsule {
          border-radius: 14px !important;
        }
        #auth-toggle-capsule button {
          border-radius: 12px !important;
          font-size: 18px !important;
          font-family: 'DefibeoMain', 'Civilprom', sans-serif !important;
          text-transform: none !important;
          letter-spacing: normal !important;
          transition: none !important;
        }
        
        #role-toggle-capsule {
          border-radius: 14px !important;
        }
        #role-toggle-capsule button {
          border-radius: 12px !important;
          font-size: 18px !important;
          font-family: 'DefibeoMain', 'Civilprom', sans-serif !important;
          text-transform: none !important;
          letter-spacing: normal !important;
          transition: none !important;
        }
        
        #btn-login-return-to-site {
          font-size: 18px !important;
          font-family: 'DefibeoMain', 'Civilprom', sans-serif !important;
          text-transform: none !important;
          letter-spacing: normal !important;
        }
        
        #auth-main-card button, #auth-main-card a {
          font-family: 'DefibeoMain', 'Civilprom', sans-serif !important;
        }
      `}</style>

      {/* Decorative subtle background accents */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[10%] left-[20%] w-[30vw] h-[30vw] rounded-full bg-white/5 blur-[120px]" />
        <div className="absolute bottom-[10%] right-[20%] w-[35vw] h-[35vw] rounded-full bg-white/5 blur-[130px]" />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center z-10">
        <img
          src="https://datacenter64000pau.s3.eu-north-1.amazonaws.com/Defibeo_2026_Logo2.svg"
          alt="Défibeo"
          className="mx-auto object-contain font-sans"
          style={{ maxHeight: '140px', width: '100%' }}
          referrerPolicy="no-referrer"
          id="login-main-logo"
        />

        {/* Language selector below the logo */}
        <div className="mt-1 flex justify-center" id="connexion-lang-picker">
          <select
            value={selectedLang}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedLang(val);
              setReqLang(val);
              localStorage.setItem('defib_lang', val);
            }}
            className="font-sans text-white rounded-lg cursor-pointer focus:outline-hidden"
            style={{
              background: '#732c78',
              border: 'none',
              padding: '8px 10px',
            }}
          >
            <option value="Français">Français</option>
            <option value="English">English</option>
            <option value="Deutsch">Deutsch</option>
            <option value="Português">Português</option>
            <option value="Español">Español</option>
          </select>
        </div>
      </div>

      <div className="mt-2 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0 z-10">
        
        {/* Connection/Creation Toggle */}
        <div className="mb-6">
          <div className="flex w-full p-1 bg-black/25 backdrop-blur-md rounded-[14px] border border-white/10" id="auth-toggle-capsule">
            <button
              type="button"
              onClick={() => {
                setActiveTab('login');
              }}
              style={{ fontFamily: "DefibeoMain, Civilprom, sans-serif" }}
              className={`flex-1 text-center py-2.5 rounded-[12px] text-[18px] font-bold transition-all cursor-pointer ${
                activeTab === 'login'
                  ? 'bg-white text-[#36093a] shadow-xs'
                  : 'text-white/85 hover:text-white'
              }`}
            >
              {t.login}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('register');
              }}
              style={{ fontFamily: "DefibeoMain, Civilprom, sans-serif" }}
              className={`flex-1 text-center py-2.5 rounded-[12px] text-[18px] font-bold transition-all cursor-pointer ${
                activeTab === 'register'
                  ? 'bg-white text-[#36093a] shadow-xs'
                  : 'text-white/85 hover:text-white'
              }`}
            >
              {t.registerTab}
            </button>
          </div>
        </div>

        {/* Main Content Card */}
        <div className="bg-white py-8 px-4 shadow-xl border-0 rounded-2xl sm:px-10" id="auth-main-card">
          
          {activeTab === 'login' ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="block text-[18px] font-bold text-black font-sans">
                  {t.loginAs}
                </label>
                
                {/* Role selection selector */}
                <div className="flex w-full p-1 bg-transparent rounded-[14px] border border-slate-200" id="role-toggle-capsule">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginRole('admin');
                      setError('');
                    }}
                    style={{ 
                      fontFamily: "DefibeoMain, Civilprom, sans-serif",
                      ...(loginRole === 'admin' ? {
                        backgroundColor: '#3556ec',
                        color: '#fff',
                        boxShadow: 'inset 0 1px 1px #fff3, 0 1px 2px #08080833, 0 4px 4px #08080814, 0 7px 0 -12px #077ac7, inset 0 6px 12px #ffffff1f'
                      } : {
                        color: '#000'
                      })
                    }}
                    className={`flex-1 text-center py-2 rounded-[12px] text-[18px] font-bold transition-all cursor-pointer ${
                      loginRole === 'admin'
                        ? 'text-white font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t.admin}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginRole('client');
                      setError('');
                    }}
                    style={{ 
                      fontFamily: "DefibeoMain, Civilprom, sans-serif",
                      ...(loginRole === 'client' ? {
                        backgroundColor: '#3556ec',
                        color: '#fff',
                        boxShadow: 'inset 0 1px 1px #fff3, 0 1px 2px #08080833, 0 4px 4px #08080814, 0 7px 0 -12px #077ac7, inset 0 6px 12px #ffffff1f'
                      } : {
                        color: '#000'
                      })
                    }}
                    className={`flex-1 text-center py-2 rounded-[12px] text-[18px] font-bold transition-all cursor-pointer ${
                      loginRole === 'client'
                        ? 'text-white font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t.client}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginRole('technicien');
                      setError('');
                    }}
                    style={{ 
                      fontFamily: "DefibeoMain, Civilprom, sans-serif",
                      ...(loginRole === 'technicien' ? {
                        backgroundColor: '#3556ec',
                        color: '#fff',
                        boxShadow: 'inset 0 1px 1px #fff3, 0 1px 2px #08080833, 0 4px 4px #08080814, 0 7px 0 -12px #077ac7, inset 0 6px 12px #ffffff1f'
                      } : {
                        color: '#000'
                      })
                    }}
                    className={`flex-1 text-center py-2 rounded-[12px] text-[18px] font-bold transition-all cursor-pointer ${
                      loginRole === 'technicien'
                        ? 'text-white font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t.technicien}
                  </button>
                </div>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit} id="login-form">
                {error && (
                  <div className="text-[18px] text-red-600 font-bold font-sans" id="login-error-message">
                    {error}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="email" className="block text-[18px] font-bold text-black font-sans">
                    {t.email}
                  </label>
                  <input
                    id="email"
                    name="email"
                    type={(loginRole === 'technicien' || loginRole === 'client') ? 'text' : 'email'}
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full"
                    placeholder={t.emailPlace}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="password" className="block text-[18px] font-bold text-black font-sans">
                    {t.password}
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="text"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full"
                    placeholder={t.passwordPlace}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>

                <div className="pt-2 text-center">
                  <button
                    type="submit"
                    disabled={isLoading}
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
                      marginRight: '0px',
                      outline: 'none',
                      padding: '13px 20px',
                      outlineOffset: '0px',
                      marginLeft: '0px',
                    }}
                    className="w-full flex justify-center items-center transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {t.loginBtn}
                  </button>

                  <a
                    href="mailto:support@defibeo.com"
                    className="inline-block mt-3.5 transition-colors font-bold font-sans"
                    style={{
                      paddingTop: '16px',
                      fontSize: '18px',
                      color: 'rgb(53, 86, 236)'
                    }}
                    id="btn-forgot-password"
                  >
                    {t.forgotPassword}
                  </a>
                </div>
              </form>
            </div>
          ) : (
            /* Request New Environment Form (Créer un compte contact form) */
            <div className="space-y-5 animate-fadeIn">
              <div className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-black leading-normal" style={{ fontSize: '18px', fontFamily: "DefibeoMain, Civilprom, sans-serif", fontWeight: 100, color: '#000000', cursor: 'default' }}>
                      {t.configDesc} <a href="https://defibeo.com/help" target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-bold" style={{ fontWeight: 550 }}>{t.contactSupport}</a>.
                    </p>
                  </div>

                  <form className="space-y-3.5" onSubmit={handleRequestSubmit} id="request-env-form">
                    {reqError && (
                      <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-semibold flex items-center gap-2" id="req-error-message">
                        <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                        <span>{reqError}</span>
                      </div>
                    )}
                    
                    {/* Sélection langue */}
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-black font-sans">
                        {t.selectLang}
                      </label>
                      <div className="flex flex-wrap gap-2 pt-0.5" id="register-lang-radio-group">
                        {['Français', 'English', 'Deutsch', 'Português', 'Español'].map((lang) => {
                          const isSelected = reqLang === lang;
                          return (
                            <button
                              key={lang}
                              type="button"
                              onClick={() => {
                                setReqLang(lang);
                                setSelectedLang(lang);
                                localStorage.setItem('defib_lang', lang);
                              }}
                              className="flex items-center gap-2 cursor-pointer"
                              style={{
                                border: isSelected ? '2px solid rgb(53, 86, 236)' : '2px solid rgb(253, 240, 255)',
                                backgroundColor: isSelected ? 'transparent' : 'rgb(253, 240, 255)',
                                color: isSelected ? 'rgb(53, 86, 236)' : '#83358a',
                                borderRadius: '10px',
                                padding: '8px 15px',
                                fontSize: '18px',
                                fontWeight: 100,
                                transition: 'none',
                              }}
                            >
                              <span 
                                className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                                style={{
                                  border: isSelected ? '2px solid rgb(53, 86, 236)' : '2px solid rgb(226, 191, 232)',
                                  backgroundColor: 'rgb(255, 255, 255)',
                                  marginLeft: '-4px',
                                  transition: 'none',
                                }}
                              >
                                {isSelected && (
                                  <span 
                                    className="w-2 h-2 rounded-full"
                                    style={{
                                      backgroundColor: 'rgb(53, 86, 236)',
                                      transition: 'none',
                                    }}
                                  />
                                )}
                              </span>
                              <span className="font-sans leading-none" style={{ transition: 'none' }}>{lang}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Nom entreprise */}
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-black font-sans">
                        {t.companyName}
                      </label>
                      <input
                        type="text"
                        required
                        value={reqCompany}
                        onChange={(e) => setReqCompany(e.target.value)}
                        className="block w-full"
                        placeholder={t.companyNamePlace}
                      />
                    </div>

                    {/* Nom du logiciel */}
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-black font-sans">
                        {t.softwareName}
                      </label>
                      <input
                        type="text"
                        required
                        value={reqNomLogiciel}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '');
                          setReqNomLogiciel(val);
                        }}
                        className="block w-full"
                        placeholder={t.softwareNamePlace}
                      />
                    </div>

                    {/* Email entreprise */}
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-black font-sans">
                        {t.companyEmail}
                      </label>
                      <input
                        type="email"
                        required
                        value={reqCompanyEmail}
                        onChange={(e) => {
                          const val = e.target.value;
                          setReqCompanyEmail(val);
                          if (reqAdminEmail === reqCompanyEmail || reqAdminEmail === '') {
                            setReqAdminEmail(val);
                          }
                        }}
                        className="block w-full"
                        placeholder={t.companyEmailPlace}
                      />
                    </div>

                    {/* Téléphone Entreprise (mobile) */}
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-black font-sans">
                        {t.companyPhone}
                      </label>
                      <input
                        type="tel"
                        required
                        value={reqCompanyPhone}
                        onChange={(e) => setReqCompanyPhone(e.target.value)}
                        className="block w-full"
                        placeholder={t.companyPhonePlace}
                      />
                    </div>

                    {/* Information Super Administrateur */}
                    <div style={{ paddingTop: '24px', paddingBottom: '16px' }}>
                      <p className="text-black leading-normal" style={{ fontSize: '18px', fontFamily: "DefibeoMain, Civilprom, sans-serif", fontWeight: 100, color: '#000000', cursor: 'default' }}>
                        {t.superAdminInfo}
                      </p>
                    </div>

                    {/* SuperAdmin Nom & Prénom */}
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-black font-sans">
                        {t.adminName}
                      </label>
                      <input
                        type="text"
                        required
                        value={reqAdminName}
                        onChange={(e) => setReqAdminName(e.target.value)}
                        className="block w-full"
                        placeholder={t.adminNamePlace}
                      />
                    </div>

                    {/* SuperAdmin Email */}
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-black font-sans">
                        {t.adminEmail}
                      </label>
                      <input
                        type="email"
                        required
                        value={reqAdminEmail}
                        onChange={(e) => setReqAdminEmail(e.target.value)}
                        className="block w-full"
                        placeholder={t.adminEmailPlace}
                      />
                    </div>

                    {/* SuperAdmin Mot de Passe */}
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-black font-sans">
                        {t.adminPassword}
                      </label>
                      <input
                        type="text"
                        required
                        value={reqAdminPassword}
                        onChange={(e) => setReqAdminPassword(e.target.value)}
                        className="block w-full"
                        placeholder={t.adminPasswordPlace}
                      />
                    </div>

                    {/* Activer l'abonnement button leading to PayPal */}
                    <div className="pt-3 space-y-3">
                      <button
                        type="submit"
                        disabled={isReqLoading}
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
                          marginRight: '0px',
                          outline: 'none',
                          padding: '13px 20px',
                          outlineOffset: '0px',
                          marginLeft: '0px',
                        }}
                        className={`w-full flex justify-center items-center gap-2 transition-all cursor-pointer box-border ${isReqLoading ? 'opacity-80 cursor-not-allowed' : ''}`}
                      >
                        {isReqLoading ? (
                          <div className="flex items-center gap-2">
                            <ApplePetalsLoader />
                            <span>Configuration en cours...</span>
                          </div>
                        ) : (
                          t.activateSub
                        )}
                      </button>

                      {/* Small text disclaimer with terms and secure info */}
                      <p className="text-[14px] leading-relaxed text-center font-medium font-sans animate-fade-in" style={{ color: '#000000', cursor: 'default' }}>
                        {t.paymentDisclaimer}
                        <a 
                          href="https://civilprom.s3.eu-north-1.amazonaws.com/DEFIBEO+ACCORD+%EF%BD%9C+FRANCE%2C+FRANC%CC%A7AIS+%EF%BD%9C+2026.pdf" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="font-extrabold hover:underline" 
                          style={{ color: 'oklch(51.1% 0.262 276.966)' }}
                        >
                          {t.eula}
                        </a>
                        {(t as any).disclaimerMid1}
                        <a 
                          href="https://civilprom.s3.eu-north-1.amazonaws.com/Data_Process_France.pdf.pdf" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="font-extrabold hover:underline" 
                          style={{ color: 'oklch(51.1% 0.262 276.966)' }}
                        >
                          {(t as any).privacyPolicy}
                        </a>
                        {(t as any).disclaimerMid2}
                        <a 
                          href="https://civilprom.s3.eu-north-1.amazonaws.com/Addendum_Defibeo_5JL26.pdf.pdf" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="font-extrabold hover:underline" 
                          style={{ color: 'oklch(51.1% 0.262 276.966)' }}
                        >
                          {(t as any).hdsCertification}
                        </a>
                        .
                      </p>

                      {/* Payment Methods Logo Badge */}
                      <div className="flex justify-center pt-2" id="safe-payment-logos">
                        <img
                          src="https://civilprom.s3.eu-north-1.amazonaws.com/PaymentMethodsUXS.png"
                          alt="Mémodes de paiement acceptées: PayPal, Mastercard, Visa"
                          className="h-14 w-auto object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    </div>

                  </form>
                </div>
              </div>
            )}

        </div>

        {/* Retour au site button below the login/register card */}
        <div className="mt-4 text-center">
          <a
            href="https://defibeo.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex justify-center items-center gap-1.5 w-full py-2.5 px-4 bg-white/10 hover:bg-white/15 text-white font-bold text-xs rounded-xl transition-all cursor-pointer border border-white/15 shadow-xs"
            id="btn-login-return-to-site"
          >
            {t.returnToSite}
          </a>
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
                      // 1. Locate the correct tenant owning the defibrillator identification
                      const tenantInfo = await findTenantAndDefibGlobally(reportDefibId);
                      if (!tenantInfo) {
                        alert("Erreur: Impossible de localiser le propriétaire de ce défibrillateur.");
                        setIsReportSubmitting(false);
                        return;
                      }

                      const { tenantId, companyName, companyEmail } = tenantInfo;

                      // 2. Add the incident ticket to that specific tenant's dynamic partition in firestore
                      const key = tenantId === 'demo' ? 'tickets' : `${tenantId}_tickets`;
                      const existingTickets = await fetchRawCollectionFromFirestore<any[]>(key) || [];

                      const randomNum = Math.floor(100000 + Math.random() * 900000);
                      const ticketId = `#${randomNum}`;
                      const newTicket = {
                        id: ticketId,
                        identifiant: reportDefibId.trim().toUpperCase(),
                        objet: reportSubject,
                        message: reportMessage,
                        email: reportEmail.trim(),
                        phone: '',
                        date: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                        status: 'Nouveau'
                      };

                      const updatedList = [newTicket, ...existingTickets];

                      // Persist the updated tickets to Firestore under the correct tenant partition
                      const docRef = doc(db, 'appData', key);
                      await setDoc(docRef, { value: updatedList });

                      // Also synchronize local storage if that same tenant is active in cached/demo mode
                      const currentActiveTenant = localStorage.getItem('defib_tenant_id') || 'demo';
                      if (currentActiveTenant === tenantId) {
                        localStorage.setItem(`defib_${tenantId}_support_tickets`, JSON.stringify(updatedList));
                      }

                      // 3. Dispatch the Email 4 notification warns the tenant
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
                        Vérification de l'identifiant...
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
