import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Client, ClientContract, Defibrillateur, Variable, CompanyInfo } from '../types';
import { Plus, Search, Trash2, Edit2, X, Briefcase, Mail, Phone, FileText, Calendar, ShieldCheck, Download, ChevronDown } from 'lucide-react';
import { checkIfEmailExistsAnywhere } from '../firebase';
import { EmptyTablePlaceholder } from './EmptyTablePlaceholder';
import { generateRandomPin, formatDateToFR } from '../utils';
import { t } from '../utils/translate';

const TEMPLATE_1 = `CONTRAT DE MAINTENANCE DE DÉFIBRILLATEUR (DAE)

Accord Annuel : Maintenance Préventive & Curative (Pièces Incluses)
ENTRE LES SOUSSIGNÉS :
[Nom de votre entreprise / Votre Nom], [Forme juridique] au capital de [Montant] €, immatriculée au RCS de [Ville] sous le numéro [Numéro SIRET], dont le siège social est situé au [Adresse complète], représentée par [Nom du représentant], en qualité de [Fonction], Ci-après désignée « Le Prestataire », d’une part,
ET :
[Nom du Client / Raison sociale], [Forme juridique] au capital de [Montant] €, immatriculée au RCS de [Ville] sous le numéro [Numéro SIRET], dont le siège social est situé au [Adresse complète], représentée par [Nom du représentant], en qualité de [Fonction], Ci-après désignée « Le Client », d’autre part.
Il a été convenu et arrêté ce qui suit :

Article 1 — Objet du contrat
Le présent contrat a pour objet de définir les conditions dans lesquelles le Prestataire assure la maintenance préventive et curative du ou des défibrillateurs (DAE) du Client, afin de garantir leur parfait état de fonctionnement conformément à la réglementation en vigueur.
La liste et la localisation des équipements concernés sont détaillées ci-dessous et sur le portail du client.

[1- Identifiant - N° de série (lister le/s défibrillateur/s ]

Article 2 — Durée du contrat
Le présent contrat est conclu pour une durée de un (1) an à compter du [Date de début]. Il se renouvellera par tacite reconduction pour des périodes successives d’un an, sauf dénonciation par l’une ou l’autre des parties par lettre recommandée avec accusé de réception (LRAR), au moins deux (2) mois avant l'échéance de la période en cours.

Article 3 — Prestations de Maintenance Préventive
Le Prestataire s'engage à réaliser [une / deux] visite(s) de maintenance préventive par an. Cette visite comprend obligatoirement :
* La vérification visuelle de l'état général de l'appareil et de son boîtier/support.
* Le contrôle des indicateurs de statut et des autotests de l'appareil.
* Les tests de charge et de batterie (simulateur de scope).
* La mise à jour des logiciels internes (firmware) selon les recommandations du fabricant.
* L'apposition d'une étiquette de contrôle sur le dispositif.
* La rédaction et l'envoi d'un rapport de maintenance pour le registre de sécurité du Client.

Article 4 — Prestations de Maintenance Curative & Remplacement des consommables
En cas de panne, de dysfonctionnement ou d'utilisation du DAE lors d'un arrêt cardiaque, les conditions suivantes s'appliquent :
* Remplacement des consommables (Pièces incluses) : Le présent contrat inclut le remplacement périodique (à date de péremption) ou post-utilisation des consommables essentiels, à savoir :
    * Les électrodes (adultes et pédiatriques).
    * Les batteries / piles au lithium.
    * Le kit de premier secours joint au DAE (ciseaux, rasoir, masque de protection, etc.).
* Assistance technique : Le Prestataire met à disposition une assistance téléphonique du lundi au vendredi, de [Heures, ex: 9h00 à 18h00].
* Délai d'intervention : En cas de panne signalée, le Prestataire s'engage à intervenir sur site ou à organiser l'enlèvement de l'appareil sous [ex: 48 heures] ouvrées.
* Prêt de matériel : Si le DAE doit être immobilisé en atelier pour réparation pendant plus de 24 heures, le Prestataire s’engage à mettre gratuitement à disposition du Client un DAE de prêt de catégorie équivalente afin d'assurer la continuité de la sécurité du site.

Article 5 — Obligations du Client
Le Client s'engage à :
* Désigner un référent interne pour le suivi du DAE.
* Vérifier régulièrement (au moins une fois par mois) le témoin lumineux de bon fonctionnement de l'appareil et signaler sans délai au Prestataire toute anomalie.
* Faciliter l'accès aux équipements aux techniciens du Prestataire lors des visites programmées ou des interventions d'urgence.
* Conserver l'appareil dans les conditions environnementales (température, humidité) préconisées par le constructeur.

Article 6 — Conditions Financières et Modalités de Paiement
* Prix annuel : Le présent contrat est consenti et accepté moyennant une redevance annuelle forfaitaire de [Montant en chiffres] € HT (soit [Montant en lettres] euros Hors Taxes), par appareil.
* Facturation : La facturation est émise annuellement, à terme échoir (en début de période).
* Paiement : Le Client s'engage à régler les factures dans un délai de [30 jours] fin de mois à compter de la date d'émission de la facture, par [Virement / Chèque].
* Indexation : Le prix pourra être révisé à chaque date anniversaire selon l'indice [ex: Syntec ou INSEE spécifique], sous réserve d'en informer le Client un mois avant.

Article 7 — Responsabilité et Assurance
Le Prestataire est tenu à une obligation de moyens dans l'exécution de ses prestations. Il est titulaire d’une assurance de Responsabilité Civile Professionnelle garantissant les dommages corporels ou matériels qui pourraient survenir du fait de son intervention. Le Prestataire ne saurait être tenu responsable en cas de mauvaise utilisation du matériel par le Client ou des tiers, ou en cas de modification de l'appareil non autorisée.

Article 8 — Résiliation Anticipée
Le présent contrat pourra être résilié de plein droit par l’une des parties en cas de manquement grave de l’autre partie à ses obligations, non réparé dans un délai de 30 jours après mise en demeure restée infructueuse.

Article 9 — Litiges et Droit Applicable
Le présent contrat est soumis au droit français. En cas de litige relatif à l'interprétation ou à l'exécution du présent contrat, les parties s'efforceront de trouver une solution amiable. À défaut, compétence exclusive est attribuée aux tribunaux de [Ville du tribunal compétent].
Fait à [Ville], le [Date] En deux exemplaires originaux.`;

const TEMPLATE_2 = `CONTRAT DE MAINTENANCE DE DÉFIBRILLATEUR (DAE)

Accord Annuel : Maintenance Préventive & Curative (Hors Pièces)

ENTRE LES SOUSSIGNÉS :
[Nom de votre entreprise / Votre Nom], [Forme juridique], immatriculée au RCS de [Ville] sous le numéro [Numéro SIRET], dont le siège social est situé au [Adresse complète], représentée par [Nom], en qualité de [Fonction], Ci-après désignée « Le Prestataire », d’une part,
ET :
[Nom du Client / Raison sociale], [Forme juridique], immatriculée au RCS de [Ville] sous le numéro [Numéro SIRET], dont le siège social est situé au [Adresse complète], représentée par [Nom], en qualité de [Fonction], Ci-après désignée « Le Client », d’autre part.
Il a été convenu et arrêté ce qui suit :

Article 1 — Objet du contrat
Le présent contrat définit les conditions dans lesquelles le Prestataire assure la maintenance préventive et curative du ou des défibrillateurs (DAE) du Client.

Article 2 — Durée
Le présent contrat est conclu pour une durée de un (1) an à compter du [Date de début]. Il se renouvelle automatiquement chaque année à date anniversaire, sauf dénonciation par l'une ou l'autre des parties par lettre recommandée avec accusé de réception (LRAR) au moins deux (2) mois avant l'échéance.

Article 3 — Maintenance Préventive
Le Prestataire s'engage à réaliser une (1) visite de contrôle annuelle sur site comprenant :
* La vérification visuelle de l'état général de l'appareil et de son support/boîtier.
* Le contrôle des indicateurs d'autotest et du niveau de batterie.
* Les tests de simulation de choc (avec appareil de test dédié).
* La pose d'une étiquette de contrôle sur le DAE et la remise d'un rapport de visite pour le registre de sécurité du Client.

Article 4 — Maintenance Curative & Consommables (Hors Pièces)
En cas de panne, de dysfonctionnement ou après l'utilisation du DAE lors d'un arrêt cardiaque :
* Exclusion des pièces et consommables : Le présent contrat exclut la fourniture gratuite des pièces de rechange et des consommables. Les électrodes, les batteries / piles au lithium et le kit de premier secours périmés ou utilisés seront intégralement facturés au Client selon le tarif en vigueur au moment du remplacement. Le Prestataire effectuera ces remplacements obligatoires pour maintenir la conformité de l'appareil.
* Assistance & Délais : Le Prestataire fournit une assistance téléphonique du lundi au vendredi. En cas de panne signalée, il s'engage à intervenir ou à organiser l'enlèvement sous [ex: 48 heures] ouvrées.
* Prêt de matériel : Si le DAE doit être immobilisé plus de 24 heures pour réparation, le Prestataire met gratuitement à disposition du Client un appareil de prêt durant toute la durée de l'intervention.

Article 5 — Obligations du Client
Le Client s'engage à vérifier visuellement une fois par mois le voyant d'état du DAE et à signaler immédiatement toute anomalie (voyant rouge ou signal sonore). Il s'engage également à laisser libre accès aux appareils pour les techniciens du Prestataire.

Article 6 — Conditions Financières
Le contrat est conclu moyennant une redevance annuelle forfaitaire de [Montant] € HT par appareil. La facturation est émise annuellement à terme à échoir (en début de période) et payable sous [30 jours] par [Virement / Chèque].

Article 7 — Résiliation et Litiges
En cas de manquement grave d'une partie, le contrat peut être résilié après une mise en demeure restée infructueuse pendant 30 jours. Le contrat est soumis au droit français. Tout litige persistant sera porté devant le tribunal de [Ville].
Fait à [Ville], le [Date], en deux exemplaires originaux.
(Faire précéder la signature de la mention manuscrite « Lu et approuvé »)
ANNEXE 1 : Liste du matériel couvert
[1- Identifiant - N° de série (lister le/s défibrillateur/s ]`;

const TEMPLATE_3 = `CONTRAT DE MAINTENANCE DAE
Formule Simplifiée — Hors Pièces & Consommables
ENTRE LES SOUSSIGNÉS :
* Le Prestataire : [Nom Entreprise], [Adresse complète], SIRET : [Numéro]
* Le Client : [Nom / Raison Sociale], [Adresse complète], SIRET / Tel : [Numéro]

Article 1 — Objet & Durée
Le présent contrat confie au Prestataire la maintenance du ou des défibrillateurs (DAE) désignés en Annexe 1. Il est conclu pour un (1) an à compter du [Date], renouvelable par tacite reconduction, sauf dénonciation par écrit (LRAR ou email) 2 mois avant l'échéance.

Article 2 — Prestations
* Maintenance préventive : Une (1) visite annuelle sur site pour contrôler l'état général, vérifier les autotests de l'appareil, tester la charge et apposer une étiquette de contrôle.
* Maintenance curative : Assistance téléphonique et intervention sur site ou retour atelier sous [48h] ouvrées en cas de panne signalée.
* Prêt de matériel : Mise à disposition gratuite d’un DAE de prêt si l’appareil du Client doit être immobilisé plus de 24h.

Article 3 — Pièces et Consommables (Exclus)
Le coût des consommables et pièces de rechange n'est pas inclus dans le forfait annuel. Les électrodes (périmées ou après utilisation) ainsi que les batteries seront remplacées automatiquement par le Prestataire pour garantir la sécurité du site, et facturées en sus au tarif en vigueur.

Article 4 — Obligations du Client
Le Client s'engage à vérifier une fois par mois le voyant de bon fonctionnement du DAE et à signaler immédiatement toute anomalie (voyant rouge ou bip sonore). Il garantit le libre accès aux appareils au technicien.

Article 5 — Prix et Paiement
Le présent contrat est consenti au prix annuel forfaitaire de [Montant] € HT par appareil. La facturation est émise annuellement à terme à échoir (en début de période) et payable à réception.

Article 6 — Litiges
Le contrat est soumis au droit français. À défaut d'accord amiable, tout litige sera porté devant le tribunal de commerce de [Ville].
Fait à [Ville], le [Date], en deux exemplaires. (Mention manuscrite « Lu et approuvé » avant de signer)

ANNEXE 1 : Liste du matériel couvert
[1- Identifiant - N° de série (lister le/s défibrillateur/s ]`;

interface ClientTabProps {
  clients: Client[];
  defibrillateurs?: Defibrillateur[];
  variables?: Variable[];
  onAddClient: (client: Omit<Client, 'id'>) => void;
  onUpdateClient: (client: Client) => void;
  onDeleteClient: (id: string) => void;
  companyInfo: CompanyInfo;
  setActiveTab?: (tab: any, bypassBlock?: boolean) => void;
  isDeveloper?: boolean;
  isReadOnly?: boolean;
}

export default function ClientTab({
  clients,
  defibrillateurs = [],
  variables = [],
  onAddClient,
  onUpdateClient,
  onDeleteClient,
  companyInfo,
  setActiveTab,
  isDeveloper = false,
  isReadOnly = false,
}: ClientTabProps) {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  // Form State
  const [denomination, setDenomination] = useState('');
  const [siret, setSiret] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [signaturePin, setSignaturePin] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [payeurId, setPayeurId] = useState('');
  const [clientIdField, setClientIdField] = useState('');
  
  // Site Information
  const [nomPrenomSite, setNomPrenomSite] = useState('');
  const [telephoneSite, setTelephoneSite] = useState('');
  const [emailSite, setEmailSite] = useState('');

  // Contacts 1 to 5 extra State
  const [typeContact1, setTypeContact1] = useState('');

  const [typeContact2, setTypeContact2] = useState('');
  const [nomContact2, setNomContact2] = useState('');
  const [telephoneSite2, setTelephoneSite2] = useState('');
  const [emailSite2, setEmailSite2] = useState('');

  const [typeContact3, setTypeContact3] = useState('');
  const [nomContact3, setNomContact3] = useState('');
  const [telephoneSite3, setTelephoneSite3] = useState('');
  const [emailSite3, setEmailSite3] = useState('');

  const [typeContact4, setTypeContact4] = useState('');
  const [nomContact4, setNomContact4] = useState('');
  const [telephoneSite4, setTelephoneSite4] = useState('');
  const [emailSite4, setEmailSite4] = useState('');

  const [typeContact5, setTypeContact5] = useState('');
  const [nomContact5, setNomContact5] = useState('');
  const [telephoneSite5, setTelephoneSite5] = useState('');
  const [emailSite5, setEmailSite5] = useState('');
  
  // Contract Details
  const [contrat, setContrat] = useState<Client['contrat']>('Oui');
  const [nomContrat, setNomContrat] = useState('');
  const [referenceContrat, setReferenceContrat] = useState('');
  const [valeurContrat, setValeurContrat] = useState('');
  const [debutContrat, setDebutContrat] = useState('');
  const [finContrat, setFinContrat] = useState('');
  const [numeroMarche, setNumeroMarche] = useState('');
  const [autresContrats, setAutresContrats] = useState<ClientContract[]>([]);

  const handleAddAutresContrat = () => {
    if (autresContrats.length >= 3) return;
    const newContract: ClientContract = {
      id: 'contract_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
      intitule: '',
      reference: '',
      debut: '',
      expiration: '',
      fichierUrl: '',
      numeroMarche: '',
    };
    setAutresContrats([...autresContrats, newContract]);
  };

  const handleRemoveAutresContrat = (id: string) => {
    setAutresContrats(autresContrats.filter(c => c.id !== id));
  };

  const handleUpdateAutresContrat = (id: string, field: keyof ClientContract, value: string) => {
    setAutresContrats(autresContrats.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const contractModels = useMemo(() => {
    return variables.filter((v) => v.category === 'Modèle Contrat');
  }, [variables]);

  const [contractFile, setContractFile] = useState<File | null>(null);

  // New contract signature & redact fields
  const [redactionContrat, setRedactionContrat] = useState('');
  const [dateSignatureContrat, setDateSignatureContrat] = useState('');
  const [signeParContrat, setSigneParContrat] = useState('');
  const [signatureClientContratImage, setSignatureClientContratImage] = useState('');
  const [fakeAiTemplateIndex, setFakeAiTemplateIndex] = useState(0);
  const typingIntervalRef = useRef<any>(null);

  React.useEffect(() => {
    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
      }
    };
  }, []);

  const handleGenerateWithFakeAI = () => {
    // 1. Determine template index
    const index = fakeAiTemplateIndex;
    const nextIndex = (index + 1) % 3;
    setFakeAiTemplateIndex(nextIndex);

    // 2. Select the template text
    let rawText = '';
    if (index === 0) {
      rawText = TEMPLATE_1;
    } else if (index === 1) {
      rawText = TEMPLATE_2;
    } else {
      rawText = TEMPLATE_3;
    }

    // 3. Perform substitutions
    const prestName = companyInfo?.name || 'Défibeo';
    let processedText = rawText;
    
    // Replace [Nom de votre entreprise / Votre Nom] and [Nom Entreprise]
    processedText = processedText.replace(/\[Nom de votre entreprise \/ Votre Nom\]/g, prestName);
    processedText = processedText.replace(/\[Nom Entreprise\]/g, prestName);

    // Filter defibrillators associated with this client
    const clientDefibs = defibrillateurs.filter(d => d.clientId === (editingClient?.id || ''));
    const defibListText = clientDefibs.length > 0
      ? clientDefibs.map((d, idx) => {
          const v = variables.find(varItem => varItem.id === d.modeleId);
          const brandModel = v ? `${v.marque} ${v.nom}` : 'Défibrillateur';
          return `${idx + 1}- ${d.identifiant || 'DAE'} - N° de série : ${d.numeroSerie || 'Non renseigné'} - Marque/Modèle : ${brandModel}`;
        }).join('\n')
      : "1- [Identifiant DAE] - N° de série : [Numéro de série]";

    processedText = processedText.replace(/\[1- Identifiant - N° de série \(lister le\/s défibrillateur\/s \]/g, defibListText);

    // 4. Start typing effect (un peu plus lent, mais quand même rapide)
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
    }

    let currentPos = 0;
    const totalLen = processedText.length;
    // Smooth fast typing
    const step = Math.max(5, Math.floor(totalLen / 150));
    setRedactionContrat('');

    typingIntervalRef.current = setInterval(() => {
      currentPos += step;
      if (currentPos >= totalLen) {
        setRedactionContrat(processedText);
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      } else {
        setRedactionContrat(processedText.substring(0, currentPos));
      }
    }, 20);
  };

  const contractCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingContractSig = useRef(false);

  // Drawing helpers for contract canvas signature
  const startDrawingContractSig = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = contractCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    isDrawingContractSig.current = true;
    const pos = getEventCoordsContractSig(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const drawContractSig = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingContractSig.current) return;
    e.preventDefault();
    const canvas = contractCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getEventCoordsContractSig(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDrawingContractSig = () => {
    if (!isDrawingContractSig.current) return;
    isDrawingContractSig.current = false;
    const canvas = contractCanvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL();
      setSignatureClientContratImage(dataUrl);
    }
  };

  const clearContractSignature = () => {
    const canvas = contractCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    setSignatureClientContratImage('');
  };

  const handleDownloadContractPDF = () => {
    const compLogo = companyInfo.logo || '';
    const compName = companyInfo.name || 'Défibeo Solutions';
    const compEmail = companyInfo.email || '';
    const compPhone = companyInfo.phone || '';
    const compWebsite = companyInfo.website || '';

    // Format date beautifully under contract options
    const formattedDate = dateSignatureContrat ? new Date(dateSignatureContrat).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }) : '-';

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>Contrat de Maintenance - ${denomination || 'Client'}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @font-face {
            font-family: "Civilprom";
            src: url("https://civilprom.s3.eu-north-1.amazonaws.com/Civilprom1.otf") format("opentype");
            font-weight: 100 900;
            font-style: normal;
            font-display: swap;
          }
          
          @page {
            size: A4 portrait;
            margin: 4mm 4mm 6mm 4mm;
            @bottom-right {
              content: "Page " counter(page) " / " counter(pages);
              font-family: "Civilprom", sans-serif;
              font-size: 7.5px;
              color: #64748b;
            }
          }

          * {
            box-sizing: border-box;
          }
          
          body, select, input, textarea, div, p, span, h1, h2, h3, h4, table, tr, th, td, a {
            font-family: "Civilprom", sans-serif !important;
            font-weight: 100 !important;
            color: #000000 !important;
            letter-spacing: normal !important;
            text-transform: none !important;
            font-size: 7.5px !important;
            line-height: 1.25 !important;
          }

          .header-left-col, .header-left-col div, .header-left-col span, .header-left-col a {
            font-size: 9.5px !important;
            line-height: 1.25 !important;
          }

          .header-company-title {
            font-size: 11px !important;
            font-weight: bold !important;
          }
          
          .blue-link {
            color: #2563eb !important;
            text-decoration: underline !important;
            font-weight: 100 !important;
          }

          /* 2 COLUMNS COMPACT BODY (+2px font-size) */
          .contract-body-text {
            column-count: 2;
            column-gap: 16px;
            text-align: justify;
            white-space: pre-wrap;
            font-size: 9px !important;
            line-height: 1.32 !important;
            color: #111827 !important;
            padding: 0 !important;
            border: none !important;
            background: transparent !important;
            background-color: transparent !important;
            border-radius: 0 !important;
            margin-top: 6px;
            margin-bottom: 6px;
          }
          
          .avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          @media print {
            body {
              background: white !important;
              padding: 0 !important;
              margin: 2mm 3mm !important;
            }
            .print-wrapper {
              border: none !important;
              box-shadow: none !important;
              max-width: 100% !important;
              width: 100% !important;
              padding: 0 !important;
              gap: 4px !important;
            }
            .screen-pagination {
              display: none !important;
            }
          }

          @media screen {
            .screen-pagination {
              font-size: 8px !important;
              color: #64748b !important;
              text-align: right;
              margin-top: 6px;
              padding-top: 3px;
              border-top: 1px solid #f1f5f9;
            }
          }
        </style>
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </head>
      <body class="bg-white text-black p-2 md:p-3">
        <div class="print-wrapper max-w-4xl mx-auto" style="background-color: #ffffff; display: flex; flex-direction: column; gap: 4px; box-sizing: border-box;">
          
          <!-- HAUT DE PAGE / HEADER COMPACT -->
          <div class="flex justify-between items-start mb-2" style="gap: 12px;">
            <!-- GAUCHE: TITRE DU CONTRAT + INFOS DATE/EXPIRATION + INFOS PRESTATAIRE -->
            <div class="header-left-col" style="max-width: 48%; display: flex; flex-direction: column; gap: 2px;">
              ${compLogo ? `<img src="${compLogo}" style="max-width: 155px; max-height: 48px; object-fit: contain; margin-bottom: 4px; display: block;" referrerPolicy="no-referrer" />` : ''}
              <div>
                <div style="font-weight: bold; font-size: 11px !important; letter-spacing: 0.5px; text-transform: uppercase;">CONTRAT DE MAINTENANCE</div>
                <div style="color: #64748b; font-size: 8px !important;">Généré le ${new Date().toLocaleDateString('fr-FR')}</div>
                <div style="color: #334155; font-size: 8.5px !important; margin-top: 1px;">
                  Début : <strong>${formatDateToFR(debutContrat) || debutContrat || '-'}</strong> — Expiration : <strong>${formatDateToFR(finContrat) || finContrat || '-'}</strong>
                </div>
              </div>
              <div style="margin-top: 6px; font-size: 8px !important; color: #475569;">
                <span class="header-company-title" style="display: block; margin-bottom: 1px; font-size: 9.5px !important;">${compName}</span>
                <div>${compEmail} ${compPhone ? '— ' + compPhone : ''}</div>
                ${compWebsite ? `<div><a href="https://${compWebsite}" target="_blank" class="blue-link">${compWebsite}</a></div>` : ''}
              </div>
            </div>

            <!-- DROITE: CLIENT BENEFICIAIRE + SIGNATURE DU CLIENT DIRECTEMENT DEDANS -->
            <div style="max-width: 50%; width: 100%; display: flex; flex-direction: column; gap: 3px;">
              <!-- CARTE CLIENT BENEFICIAIRE COMPACTE -->
              <div style="width: 100%; border: 1px solid #e2e8f0; padding: 5px 8px; border-radius: 5px; background-color: #fafafa; font-size: 8px !important; text-align: left;">
                <div style="font-size: 10.5px !important; font-weight: bold !important; color: #0f172a; line-height: 1.15 !important; margin-bottom: 2px;">${denomination || 'Non renseigné'}</div>
                <div style="display: flex; flex-direction: column; gap: 1.5px; font-size: 8px !important; color: #334155;">
                  ${siret ? `<div>SIRET : <strong>${siret}</strong></div>` : ''}
                  ${numeroMarche ? `<div>Marché : <strong>${numeroMarche}</strong></div>` : ''}
                  ${payeurId ? `<div>Payeur ID : <strong>${payeurId}</strong></div>` : ''}
                  ${clientIdField ? `<div>Client ID : <strong>${clientIdField}</strong></div>` : ''}
                  ${nomPrenomSite ? `<div>Contact : <strong>${nomPrenomSite}</strong></div>` : ''}
                  ${phone ? `<div>Tél : <strong>${phone}</strong></div>` : ''}
                  ${email ? `<div>Email : <strong>${email}</strong></div>` : ''}
                </div>

                <!-- SIGNATURE CLIENT / STATUT DANS LE BLOC CLIENT DU HEADER -->
                <div style="margin-top: 6px;">
                  ${signatureClientContratImage ? `
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                      <div>
                        <div style="font-size: 7.5px !important; color: #475569; text-transform: uppercase; font-weight: bold;">Signature client :</div>
                        <div style="font-size: 8px !important; color: #0f172a;">Signé par : <strong>${signeParContrat || denomination || '-'}</strong></div>
                        <div style="font-size: 7.5px !important; color: #64748b;">Le : ${formattedDate}</div>
                      </div>
                      <div style="display: inline-block; padding: 2px; border: 1px solid #e2e8f0; border-radius: 4px; background-color: #fff;">
                        <img src="${signatureClientContratImage}" style="max-height: 38px; max-width: 120px; object-fit: contain;" alt="Signature Client" />
                      </div>
                    </div>
                  ` : `
                    <div style="color: #64748b; font-size: 8px !important; font-weight: normal;">
                      Contrat non signé.
                    </div>
                  `}
                </div>
              </div>
            </div>
          </div>

          <!-- CORPS DU CONTRAT EN GRID 2 COLONNES (COMPACT SANS PADDING/BORDER/BG/RADIUS) -->
          <div class="contract-body-text">
            ${redactionContrat || "Aucun détail contractuel n'est rédigé."}
          </div>

        </div>
      </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const getEventCoordsContractSig = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ('changedTouches' in e && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
      }
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  // Draw signature if loaded
  React.useEffect(() => {
    if (isModalOpen && signatureClientContratImage && contractCanvasRef.current) {
      const canvas = contractCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
        };
        img.src = signatureClientContratImage;
      }
    }
  }, [signatureClientContratImage, isModalOpen]);
  
  const [error, setError] = useState('');
  
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const searchInputStyle: React.CSSProperties = {
    border: '1px solid #dedede',
    borderRadius: '13px',
    padding: '9px 19px',
    fontSize: '18px',
    fontWeight: '100',
    color: '#000000',
    backgroundColor: '#ffffff',
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    outline: (isSearchHovered || isSearchFocused) ? '2.5px solid #fa53d5' : 'none',
    outlineOffset: (isSearchHovered || isSearchFocused) ? '2px' : '0px',
    transition: 'all 0s',
  };

  const customButtonStyle: React.CSSProperties = {
    backgroundColor: '#000',
    color: '#fff',
    boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
    borderRadius: '12px',
    fontSize: '18px',
    padding: '9px 19px',
    fontWeight: '100',
    transition: 'all 0s ease-in-out',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    border: 'none',
  };

  const rowActionButtonStyle: React.CSSProperties = {
    backgroundColor: '#000',
    color: '#fff',
    boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
    borderRadius: '10px',
    fontSize: '16px',
    padding: '8px 16px',
    fontWeight: '100',
    transition: 'all 0s ease-in-out',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    border: 'none',
  };

  const rowActionButton18Style: React.CSSProperties = {
    ...rowActionButtonStyle,
    fontSize: '18px',
    padding: '9px 19px',
  };

  const thStyle: React.CSSProperties = {
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    fontWeight: 100,
    letterSpacing: 'normal',
    textTransform: 'none',
    color: '#000000',
    cursor: 'default',
  };

  // Search filter
  const filteredClients = useMemo(() => {
    return clients.filter(
      (c) =>
        (c.denomination || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.siret || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.email || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.nomPrenomSite || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.nomContrat || '').toLowerCase().includes(search.toLowerCase())
    );
  }, [clients, search]);

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 100;

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / ITEMS_PER_PAGE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedClients = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredClients.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredClients, currentPage]);

  const openAddModal = () => {
    setEditingClient(null);
    setDenomination('');
    setSiret('');
    setEmail('');
    setPhone('');
    setAccessKey('');
    setSignaturePin(generateRandomPin());
    setCommentaire('');
    setPayeurId('');
    setClientIdField('');
    setNomPrenomSite('');
    setTelephoneSite('');
    setEmailSite('');
    setContrat('Non');
    setNomContrat('');
    setReferenceContrat('');
    setValeurContrat('');
    setDebutContrat('');
    setFinContrat('');
    setNumeroMarche('');
    setAutresContrats([]);
    setContractFile(null);
    setError('');

    setTypeContact1('');

    setTypeContact2('');
    setNomContact2('');
    setTelephoneSite2('');
    setEmailSite2('');

    setTypeContact3('');
    setNomContact3('');
    setTelephoneSite3('');
    setEmailSite3('');

    setTypeContact4('');
    setNomContact4('');
    setTelephoneSite4('');
    setEmailSite4('');

    setTypeContact5('');
    setNomContact5('');
    setTelephoneSite5('');
    setEmailSite5('');

    setRedactionContrat('');
    setDateSignatureContrat('');
    setSigneParContrat('');
    setSignatureClientContratImage('');

    setIsModalOpen(true);
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setDenomination(client.denomination);
    setSiret(client.siret);
    setEmail(client.email);
    setPhone(client.phone);
    setAccessKey(client.accessKey || '');
    setSignaturePin(client.signaturePin || generateRandomPin());
    setCommentaire(client.commentaire || '');
    setPayeurId(client.payeurId || '');
    setClientIdField(client.clientIdField || '');
    setNomPrenomSite(client.nomPrenomSite || '');
    setTelephoneSite(client.telephoneSite || '');
    setEmailSite(client.emailSite || '');
    setContrat(client.contrat || 'Non');
    setNomContrat(client.nomContrat === 'Sans contrat de maintenance' ? '' : (client.nomContrat || ''));
    setReferenceContrat(client.referenceContrat === '-' ? '' : (client.referenceContrat || ''));
    setValeurContrat(client.valeurContrat || '');
    setDebutContrat(client.debutContrat || '');
    setFinContrat(client.finContrat || '');
    setNumeroMarche(client.numeroMarche || '');
    setAutresContrats(client.autresContrats ? JSON.parse(JSON.stringify(client.autresContrats)) : []);
    setContractFile(null);
    setError('');

    setRedactionContrat(client.redactionContrat || '');
    setDateSignatureContrat(client.dateSignatureContrat || '');
    setSigneParContrat(client.signeParContrat || '');
    setSignatureClientContratImage(client.signatureClientContratImage || '');

    setTypeContact1(client.typeContact1 || '');

    setTypeContact2(client.typeContact2 || '');
    setNomContact2(client.nomContact2 || '');
    setTelephoneSite2(client.telephoneSite2 || '');
    setEmailSite2(client.emailSite2 || '');

    setTypeContact3(client.typeContact3 || '');
    setNomContact3(client.nomContact3 || '');
    setTelephoneSite3(client.telephoneSite3 || '');
    setEmailSite3(client.emailSite3 || '');

    setTypeContact4(client.typeContact4 || '');
    setNomContact4(client.nomContact4 || '');
    setTelephoneSite4(client.telephoneSite4 || '');
    setEmailSite4(client.emailSite4 || '');

    setTypeContact5(client.typeContact5 || '');
    setNomContact5(client.nomContact5 || '');
    setTelephoneSite5(client.telephoneSite5 || '');
    setEmailSite5(client.emailSite5 || '');

    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDeveloper || isReadOnly) {
      alert("Action non autorisée : Le rôle Développeur est en mode lecture seule.");
      return;
    }
    setError('');

    // Validations
    if (!denomination.trim()) {
      setError('La dénomination est obligatoire.');
      return;
    }
    if (!siret.trim()) {
      setError('Le numéro d\'enregistrement (SIRET) est obligatoire.');
      return;
    }

    const targetEmail = email.trim().toLowerCase();
    const targetEmailSite = emailSite.trim().toLowerCase();

    // Verification for client email
    if (targetEmail) {
      const emailChanged = !editingClient || editingClient.email?.trim().toLowerCase() !== targetEmail;
      if (emailChanged) {
        const option = editingClient ? { tenantId: localStorage.getItem('defib_tenant_id') || 'demo', excludeOption: 'client' as const, uniqueId: editingClient.id } : undefined;
        const checkResult = await checkIfEmailExistsAnywhere(targetEmail, option);
        if (checkResult.exists) {
          setError("Erreur: un utilisateur avec cet email est déjà existant.");
          return;
        }
      }
    }

    // Verification for client emailSite
    if (targetEmailSite && targetEmailSite !== targetEmail) {
      const emailSiteChanged = !editingClient || editingClient.emailSite?.trim().toLowerCase() !== targetEmailSite;
      if (emailSiteChanged) {
        const option = editingClient ? { tenantId: localStorage.getItem('defib_tenant_id') || 'demo', excludeOption: 'client' as const, uniqueId: editingClient.id } : undefined;
        const checkResult = await checkIfEmailExistsAnywhere(targetEmailSite, option);
        if (checkResult.exists) {
          setError("Erreur: un utilisateur avec cet email est déjà existant.");
          return;
        }
      }
    }

    const hasContract = (nomContrat && nomContrat.trim() !== '' && nomContrat.trim() !== 'Sans contrat de maintenance') ||
                        (referenceContrat && referenceContrat.trim() !== '' && referenceContrat.trim() !== '-') ||
                        (valeurContrat && valeurContrat.trim() !== '') ||
                        (debutContrat && debutContrat.trim() !== '') ||
                        (finContrat && finContrat.trim() !== '');
    const payload = {
      denomination: denomination.trim(),
      siret: siret.trim(),
      email: email.trim(),
      phone: phone.trim(),
      accessKey: accessKey.trim(),
      signaturePin: signaturePin.trim().toUpperCase(),
      commentaire: commentaire.trim(),
      payeurId: payeurId.trim(),
      clientIdField: clientIdField.trim(),
      nomPrenomSite: nomPrenomSite.trim() || 'Représentant Standard',
      telephoneSite: telephoneSite.trim() || phone.trim(),
      emailSite: emailSite.trim() || email.trim(),
      contrat: (hasContract ? 'Oui' : 'Non') as 'Oui' | 'Non',
      nomContrat: hasContract ? (nomContrat.trim() || 'Contrat actif') : 'Sans contrat de maintenance',
      referenceContrat: referenceContrat.trim() ? referenceContrat.trim() : '-',
      valeurContrat: valeurContrat.trim(),
      debutContrat: debutContrat,
      finContrat: finContrat,
      numeroMarche: numeroMarche.trim(),

      typeContact1: typeContact1,

      typeContact2: typeContact2,
      nomContact2: nomContact2,
      telephoneSite2: telephoneSite2,
      emailSite2: emailSite2,

      typeContact3: typeContact3,
      nomContact3: nomContact3,
      telephoneSite3: telephoneSite3,
      emailSite3: emailSite3,

      typeContact4: typeContact4,
      nomContact4: nomContact4,
      telephoneSite4: telephoneSite4,
      emailSite4: emailSite4,

      typeContact5: typeContact5,
      nomContact5: nomContact5,
      telephoneSite5: telephoneSite5,
      emailSite5: emailSite5,

      redactionContrat: redactionContrat,
      dateSignatureContrat: dateSignatureContrat,
      signeParContrat: signeParContrat,
      signatureClientContratImage: signatureClientContratImage,
      autresContrats: autresContrats,
    };

    if (editingClient) {
      onUpdateClient({
        id: editingClient.id,
        ...payload,
        signaturePins: editingClient.signaturePins,
      });
    } else {
      onAddClient(payload);
    }

    setIsModalOpen(false);
  };

  const handleSaveAndRedirectToVariables = async () => {
    if (denomination.trim()) {
      await handleSubmit({ preventDefault: () => {} } as any);
    } else {
      setIsModalOpen(false);
    }
    if (setActiveTab) {
      setActiveTab('variables', true);
    }
  };

  if (isModalOpen) {
    return (
      <div className="w-full space-y-6 font-sans animate-fadeIn max-w-[1000px] mx-auto" id="client-form-overlay">
        {/* Form Header */}
        <div 
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white"
          style={{ border: '1px solid #dadada', borderTop: 'none', borderRadius: '0px 0px 18px 18px', maxWidth: '98%', margin: 'auto', padding: '20px' }}
          id="client-form-header-box"
        >
          <div>
            <h3 className="text-2xl font-bold font-gochi" id="client-modal-title" style={{ color: '#000000', cursor: 'default' }}>
              {editingClient ? 'Modification Client' : 'Nouveau Client'}
            </h3>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              id="btn-close-client-modal"
              style={rowActionButton18Style}
              className="transition-colors cursor-pointer"
            >
              <span>Fermer</span>
            </button>

            <button
              type="submit"
              form="client-form"
              id="btn-submit-client-form"
              style={{
                ...rowActionButton18Style,
                backgroundColor: 'rgb(53, 86, 236)',
                color: '#ffffff',
                boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset'
              }}
              className="transition-all cursor-pointer"
            >
              Enregistrer
            </button>
          </div>
        </div>

        {/* Form Box */}
        <div
          className="w-full animate-fadeIn mt-6"
          style={{ marginTop: '24px' }}
          id="client-form-box"
        >
          <style>{`
             #client-form input:not([type="radio"]):not([type="checkbox"]),
             #client-form select,
             #client-form textarea {
               padding: 12px !important;
               border: 1px solid #dedede !important;
               border-radius: 13px !important;
               font-size: 16px !important;
               font-weight: 100 !important;
               background: #ffffff !important;
               color: #000000 !important;
               font-family: "DefibeoMain", "Civilprom", sans-serif !important;
               box-sizing: border-box !important;
               outline: none !important;
               transition: all 0s !important;
               width: 100% !important;
             }
             #client-form input:not([type="radio"]):not([type="checkbox"]):hover,
             #client-form input:not([type="radio"]):not([type="checkbox"]):focus,
             #client-form select:hover,
             #client-form select:focus,
             #client-form textarea:hover,
             #client-form textarea:focus {
               outline: 2.5px solid #fa53d5 !important;
               outline-offset: 2px !important;
               transition: all 0s !important;
             }
             #client-form input:not([type="radio"]):not([type="checkbox"])::placeholder,
             #client-form textarea::placeholder {
               color: #000000 !important;
               opacity: 1 !important;
               font-weight: 100 !important;
               font-family: "DefibeoMain", "Civilprom", sans-serif !important;
             }
             #client-form input:disabled,
             #client-form select:disabled,
             #client-form textarea:disabled {
               color: #000000 !important;
               -webkit-text-fill-color: #000000 !important;
               background-color: #f1f5f9 !important;
               opacity: 0.95 !important;
               font-family: "DefibeoMain", "Civilprom", sans-serif !important;
               cursor: not-allowed !important;
             }
             #client-form input:disabled:hover,
             #client-form input:disabled:focus,
             #client-form select:disabled:hover,
             #client-form select:disabled:focus,
             #client-form textarea:disabled:hover,
             #client-form textarea:disabled:focus {
               outline: none !important;
             }
             #client-form select {
               appearance: none !important;
               -webkit-appearance: none !important;
               -moz-appearance: none !important;
               background-image: none !important;
             }
             #client-form select option {
               color: #000000 !important;
               background: #ffffff !important;
               font-family: "DefibeoMain", "Civilprom", sans-serif !important;
             }
             #client-form input[type="date"]::-webkit-calendar-picker-indicator {
               display: none !important;
               -webkit-appearance: none !important;
               background: none !important;
               width: 0 !important;
               height: 0 !important;
             }
             #client-form label,
             #client-form .section-title-label,
             #client-form span.block.uppercase {
               letter-spacing: normal !important;
               text-transform: none !important;
               font-size: 16px !important;
               color: #000000 !important;
               font-weight: 600 !important;
             }
             #client-form input[type="radio"] {
               appearance: none !important;
               -webkit-appearance: none !important;
               width: 18px !important;
               height: 18px !important;
               border: 2px solid #cbd5e1 !important;
               border-radius: 50% !important;
               background-color: #ffffff !important;
               outline: none !important;
               cursor: pointer !important;
               display: inline-flex !important;
               align-items: center !important;
               justify-content: center !important;
               transition: all 0.2s ease !important;
               margin-right: 6px !important;
             }
             #client-form input[type="radio"]:hover {
               border-color: oklch(0.44 0.16 324.65) !important;
             }
             #client-form input[type="radio"]:checked {
               border-color: oklch(0.44 0.16 324.65) !important;
               background-color: oklch(0.44 0.16 324.65) !important;
             }
             #client-form input[type="radio"]:checked::after {
               content: "" !important;
               width: 8px !important;
               height: 8px !important;
               background-color: #ffffff !important;
               border-radius: 50% !important;
               display: block !important;
             }
             #client-form input[type="checkbox"] {
               appearance: none !important;
               -webkit-appearance: none !important;
               width: 18px !important;
               height: 18px !important;
               border: 2px solid #cbd5e1 !important;
               border-radius: 4px !important;
               background-color: #ffffff !important;
               outline: none !important;
               cursor: pointer !important;
               display: inline-flex !important;
               align-items: center !important;
               justify-content: center !important;
               transition: all 0.2s ease !important;
               margin-right: 6px !important;
             }
             #client-form input[type="checkbox"]:hover {
               border-color: oklch(0.44 0.16 324.65) !important;
             }
             #client-form input[type="checkbox"]:checked {
               border-color: oklch(0.44 0.16 324.65) !important;
               background-color: oklch(0.44 0.16 324.65) !important;
             }
             #client-form input[type="checkbox"]:checked::after {
               content: "✓" !important;
               color: #ffffff !important;
               font-size: 11px !important;
               font-weight: 900 !important;
               display: block !important;
             }
          `}</style>
          
          <form onSubmit={handleSubmit} id="client-form" className="space-y-6">
            {error && (
              <div
                className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-sans mb-4"
                id="client-form-error"
                style={{ maxWidth: '98%', margin: 'auto' }}
              >
                {error}
              </div>
            )}

            <div className="space-y-0" style={{ maxWidth: '98%', margin: 'auto' }}>
              {/* Section 1 - Informations Sociales / Entreprise */}
              <div 
                className="bg-white p-5 relative space-y-3"
                style={{
                  border: '1px solid rgb(218, 218, 218)',
                  borderRadius: '18px 18px 0px 0px',
                }}
              >
                <div className="mb-2 bg-transparent">
                  <span 
                    className="text-white px-3 py-1 text-[13px] inline-block font-sans"
                    style={{
                      backgroundColor: 'oklch(0.44 0.16 324.65)',
                      borderRadius: '1000px',
                      cursor: 'default',
                      fontWeight: 100,
                      textTransform: 'none',
                    }}
                  >
                    1 — Entreprise
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label htmlFor="input-client-denomination" className="block text-[11px] font-bold text-slate-500 uppercase">
                      Entreprise. *
                    </label>
                    <input
                      type="text"
                      id="input-client-denomination"
                      value={denomination}
                      onChange={(e) => setDenomination(e.target.value)}
                      placeholder="Entrez une dénomination."
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="input-client-siret" className="block text-[11px] font-bold text-slate-500 uppercase">
                      Identifiant fiscal. *
                    </label>
                    <input
                      type="text"
                      id="input-client-siret"
                      value={siret}
                      onChange={(e) => setSiret(e.target.value)}
                      placeholder="Entrez un identifiant fiscal."
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label htmlFor="input-client-email" className="block text-[11px] font-bold text-slate-500 uppercase">
                      Email. *
                    </label>
                    <input
                      type="email"
                      id="input-client-email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Entrez un email."
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="input-client-phone" className="block text-[11px] font-bold text-slate-500 uppercase">
                      Téléphone. *
                    </label>
                    <input
                      type="text"
                      id="input-client-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Entrez un téléphone."
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label htmlFor="input-client-access-key" className="block text-[11px] font-bold text-slate-500 uppercase">
                      Mot de passe.
                    </label>
                    <input
                      type="text"
                      id="input-client-access-key"
                      value={accessKey}
                      onChange={(e) => setAccessKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                      placeholder="Entrez un mot de passe."
                      className="font-mono font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="input-client-signature-pin" className="block text-[11px] font-bold text-slate-500 uppercase">
                      Code PIN de signature unique.
                    </label>
                    <input
                      type="text"
                      id="input-client-signature-pin"
                      value={signaturePin}
                      onChange={(e) => setSignaturePin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                      maxLength={6}
                      placeholder="Entrez un code PIN de signature."
                      className="font-mono font-bold text-indigo-600 text-center"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label htmlFor="input-client-payeur-id" className="block text-[11px] font-bold text-slate-500 uppercase">
                      {t("Payeur ID.")}
                    </label>
                    <input
                      type="text"
                      id="input-client-payeur-id"
                      value={payeurId}
                      onChange={(e) => setPayeurId(e.target.value)}
                      placeholder={t("Entrez le Payeur ID.")}
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="input-client-id-field" className="block text-[11px] font-bold text-slate-500 uppercase">
                      {t("Client ID.")}
                    </label>
                    <input
                      type="text"
                      id="input-client-id-field"
                      value={clientIdField}
                      onChange={(e) => setClientIdField(e.target.value)}
                      placeholder={t("Entrez le Client ID.")}
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="input-client-unique-id" className="block text-[11px] font-bold text-slate-500 uppercase">
                      {t("Identifiant unique.")}
                    </label>
                    <input
                      type="text"
                      id="input-client-unique-id"
                      value={editingClient ? editingClient.id : 'Nouveau (généré automatiquement)'}
                      disabled
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="input-client-commentaire" className="block text-[11px] font-bold text-slate-500 uppercase">
                    Commentaire.
                  </label>
                  <textarea
                    id="input-client-commentaire"
                    value={commentaire}
                    onChange={(e) => setCommentaire(e.target.value)}
                    placeholder="Entrez un commentaire."
                    rows={3}
                    className="font-sans"
                  />
                </div>
              </div>

              {/* Section 2 - Responsable / Contact Physique sur Site */}
              <div 
                className="bg-white p-5 relative space-y-3"
                style={{
                  border: '1px solid rgb(218, 218, 218)',
                  borderTop: 'none',
                  borderRadius: '0px',
                }}
              >
                <div className="mb-2 bg-transparent">
                  <span 
                    className="text-white px-3 py-1 text-[13px] inline-block font-sans"
                    style={{
                      backgroundColor: 'oklch(0.44 0.16 324.65)',
                      borderRadius: '1000px',
                      cursor: 'default',
                      fontWeight: 100,
                      textTransform: 'none',
                    }}
                  >
                    2 — Contact
                  </span>
                </div>

                <div className="space-y-6">
                  {/* Contact 1 */}
                  <div className="pb-5 last:border-b-0 last:pb-0 space-y-2">
                    <div className="font-bold text-black font-sans" style={{ fontSize: '18px' }}>Contact 1.</div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <label htmlFor="input-client-site-type-1" className="block text-[11px] font-bold text-slate-500 uppercase">
                          Type.
                        </label>
                        <select
                          id="input-client-site-type-1"
                          value={typeContact1}
                          onChange={(e) => setTypeContact1(e.target.value)}
                          className="font-sans cursor-pointer focus:outline-none"
                        >
                          <option value="">Sélectionnez</option>
                          <option value="Direction">Direction</option>
                          <option value="Responsable">Responsable</option>
                          <option value="Commercial">Commercial</option>
                          <option value="Technique">Technique</option>
                          <option value="Acheteur">Acheteur</option>
                          <option value="Planification">Planification</option>
                          <option value="Autre">Autre</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label htmlFor="input-client-site-nom-1" className="block text-[11px] font-bold text-slate-500 uppercase">
                          Contact 1.
                        </label>
                        <input
                          type="text"
                          id="input-client-site-nom-1"
                          value={nomPrenomSite}
                          onChange={(e) => setNomPrenomSite(e.target.value)}
                          placeholder="Nom et prénom."
                        />
                      </div>

                      <div className="space-y-1">
                        <label htmlFor="input-client-site-tel-1" className="block text-[11px] font-bold text-slate-500 uppercase">
                          Téléphone du contact 1.
                        </label>
                        <input
                          type="text"
                          id="input-client-site-tel-1"
                          value={telephoneSite}
                          onChange={(e) => setTelephoneSite(e.target.value)}
                          placeholder="Téléphone."
                        />
                      </div>

                      <div className="space-y-1">
                        <label htmlFor="input-client-site-mail-1" className="block text-[11px] font-bold text-slate-500 uppercase">
                          Email du contact 1.
                        </label>
                        <input
                          type="email"
                          id="input-client-site-mail-1"
                          value={emailSite}
                          onChange={(e) => setEmailSite(e.target.value)}
                          placeholder="Email."
                        />
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const isContact1Completed = (typeContact1 || '').trim() !== '' && (nomPrenomSite || '').trim() !== '' && (telephoneSite || '').trim() !== '' && (emailSite || '').trim() !== '';
                    const hasContact2Data = (typeContact2 || '').trim() !== '' || (nomContact2 || '').trim() !== '' || (telephoneSite2 || '').trim() !== '' || (emailSite2 || '').trim() !== '';
                    const showContact2 = isContact1Completed || hasContact2Data;

                    if (!showContact2) return null;

                    return (
                      /* Contact 2 */
                      <div className="py-5 last:border-b-0 last:pb-0 space-y-2">
                        <div className="font-bold text-black font-sans" style={{ fontSize: '18px' }}>Contact 2.</div>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                          <div className="space-y-1">
                            <label htmlFor="input-client-site-type-2" className="block text-[11px] font-bold text-slate-500 uppercase">
                              Type.
                            </label>
                            <select
                              id="input-client-site-type-2"
                              value={typeContact2}
                              onChange={(e) => setTypeContact2(e.target.value)}
                              className="font-sans cursor-pointer focus:outline-none"
                            >
                              <option value="">Sélectionnez</option>
                              <option value="Direction">Direction</option>
                              <option value="Responsable">Responsable</option>
                              <option value="Commercial">Commercial</option>
                              <option value="Technique">Technique</option>
                              <option value="Acheteur">Acheteur</option>
                              <option value="Planification">Planification</option>
                              <option value="Autre">Autre</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label htmlFor="input-client-site-nom-2" className="block text-[11px] font-bold text-slate-500 uppercase">
                              Contact 2.
                            </label>
                            <input
                              type="text"
                              id="input-client-site-nom-2"
                              value={nomContact2}
                              onChange={(e) => setNomContact2(e.target.value)}
                              placeholder="Nom et prénom."
                            />
                          </div>

                          <div className="space-y-1">
                            <label htmlFor="input-client-site-tel-2" className="block text-[11px] font-bold text-slate-500 uppercase">
                              Téléphone du contact 2.
                            </label>
                            <input
                              type="text"
                              id="input-client-site-tel-2"
                              value={telephoneSite2}
                              onChange={(e) => setTelephoneSite2(e.target.value)}
                              placeholder="Téléphone."
                            />
                          </div>

                          <div className="space-y-1">
                            <label htmlFor="input-client-site-mail-2" className="block text-[11px] font-bold text-slate-500 uppercase">
                              Email du contact 2.
                            </label>
                            <input
                              type="email"
                              id="input-client-site-mail-2"
                              value={emailSite2}
                              onChange={(e) => setEmailSite2(e.target.value)}
                              placeholder="Email."
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {(() => {
                    const isContact1Completed = (typeContact1 || '').trim() !== '' && (nomPrenomSite || '').trim() !== '' && (telephoneSite || '').trim() !== '' && (emailSite || '').trim() !== '';
                    const hasContact2Data = (typeContact2 || '').trim() !== '' || (nomContact2 || '').trim() !== '' || (telephoneSite2 || '').trim() !== '' || (emailSite2 || '').trim() !== '';
                    const showContact2 = isContact1Completed || hasContact2Data;
                    const isContact2Completed = (typeContact2 || '').trim() !== '' && (nomContact2 || '').trim() !== '' && (telephoneSite2 || '').trim() !== '' && (emailSite2 || '').trim() !== '';
                    
                    const hasContact3Data = (typeContact3 || '').trim() !== '' || (nomContact3 || '').trim() !== '' || (telephoneSite3 || '').trim() !== '' || (emailSite3 || '').trim() !== '';
                    const showContact3 = (showContact2 && isContact2Completed) || hasContact3Data;

                    if (!showContact3) return null;

                    return (
                      /* Contact 3 */
                      <div className="py-5 last:border-b-0 last:pb-0 space-y-2">
                        <div className="font-bold text-black font-sans" style={{ fontSize: '18px' }}>Contact 3.</div>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                          <div className="space-y-1">
                            <label htmlFor="input-client-site-type-3" className="block text-[11px] font-bold text-slate-500 uppercase">
                              Type.
                            </label>
                            <select
                              id="input-client-site-type-3"
                              value={typeContact3}
                              onChange={(e) => setTypeContact3(e.target.value)}
                              className="font-sans cursor-pointer focus:outline-none"
                            >
                              <option value="">Sélectionnez</option>
                              <option value="Direction">Direction</option>
                              <option value="Responsable">Responsable</option>
                              <option value="Commercial">Commercial</option>
                              <option value="Technique">Technique</option>
                              <option value="Acheteur">Acheteur</option>
                              <option value="Planification">Planification</option>
                              <option value="Autre">Autre</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label htmlFor="input-client-site-nom-3" className="block text-[11px] font-bold text-slate-500 uppercase">
                              Contact 3.
                            </label>
                            <input
                              type="text"
                              id="input-client-site-nom-3"
                              value={nomContact3}
                              onChange={(e) => setNomContact3(e.target.value)}
                              placeholder="Nom et prénom."
                            />
                          </div>

                          <div className="space-y-1">
                            <label htmlFor="input-client-site-tel-3" className="block text-[11px] font-bold text-slate-500 uppercase">
                              Téléphone du contact 3.
                            </label>
                            <input
                              type="text"
                              id="input-client-site-tel-3"
                              value={telephoneSite3}
                              onChange={(e) => setTelephoneSite3(e.target.value)}
                              placeholder="Téléphone."
                            />
                          </div>

                          <div className="space-y-1">
                            <label htmlFor="input-client-site-mail-3" className="block text-[11px] font-bold text-slate-500 uppercase">
                              Email du contact 3.
                            </label>
                            <input
                              type="email"
                              id="input-client-site-mail-3"
                              value={emailSite3}
                              onChange={(e) => setEmailSite3(e.target.value)}
                              placeholder="Email."
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {(() => {
                    const isContact1Completed = (typeContact1 || '').trim() !== '' && (nomPrenomSite || '').trim() !== '' && (telephoneSite || '').trim() !== '' && (emailSite || '').trim() !== '';
                    const hasContact2Data = (typeContact2 || '').trim() !== '' || (nomContact2 || '').trim() !== '' || (telephoneSite2 || '').trim() !== '' || (emailSite2 || '').trim() !== '';
                    const showContact2 = isContact1Completed || hasContact2Data;
                    const isContact2Completed = (typeContact2 || '').trim() !== '' && (nomContact2 || '').trim() !== '' && (telephoneSite2 || '').trim() !== '' && (emailSite2 || '').trim() !== '';
                    
                    const hasContact3Data = (typeContact3 || '').trim() !== '' || (nomContact3 || '').trim() !== '' || (telephoneSite3 || '').trim() !== '' || (emailSite3 || '').trim() !== '';
                    const showContact3 = (showContact2 && isContact2Completed) || hasContact3Data;
                    const isContact3Completed = (typeContact3 || '').trim() !== '' && (nomContact3 || '').trim() !== '' && (telephoneSite3 || '').trim() !== '' && (emailSite3 || '').trim() !== '';

                    const hasContact4Data = (typeContact4 || '').trim() !== '' || (nomContact4 || '').trim() !== '' || (telephoneSite4 || '').trim() !== '' || (emailSite4 || '').trim() !== '';
                    const showContact4 = (showContact3 && isContact3Completed) || hasContact4Data;

                    if (!showContact4) return null;

                    return (
                      /* Contact 4 */
                      <div className="py-5 last:border-b-0 last:pb-0 space-y-2">
                        <div className="font-bold text-black font-sans" style={{ fontSize: '18px' }}>Contact 4.</div>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                          <div className="space-y-1">
                            <label htmlFor="input-client-site-type-4" className="block text-[11px] font-bold text-slate-500 uppercase">
                              Type.
                            </label>
                            <select
                              id="input-client-site-type-4"
                              value={typeContact4}
                              onChange={(e) => setTypeContact4(e.target.value)}
                              className="font-sans cursor-pointer focus:outline-none"
                            >
                              <option value="">Sélectionnez</option>
                              <option value="Direction">Direction</option>
                              <option value="Responsable">Responsable</option>
                              <option value="Commercial">Commercial</option>
                              <option value="Technique">Technique</option>
                              <option value="Acheteur">Acheteur</option>
                              <option value="Planification">Planification</option>
                              <option value="Autre">Autre</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label htmlFor="input-client-site-nom-4" className="block text-[11px] font-bold text-slate-500 uppercase">
                              Contact 4.
                            </label>
                            <input
                              type="text"
                              id="input-client-site-nom-4"
                              value={nomContact4}
                              onChange={(e) => setNomContact4(e.target.value)}
                              placeholder="Nom et prénom."
                            />
                          </div>

                          <div className="space-y-1">
                            <label htmlFor="input-client-site-tel-4" className="block text-[11px] font-bold text-slate-500 uppercase">
                              Téléphone du contact 4.
                            </label>
                            <input
                              type="text"
                              id="input-client-site-tel-4"
                              value={telephoneSite4}
                              onChange={(e) => setTelephoneSite4(e.target.value)}
                              placeholder="Téléphone."
                            />
                          </div>

                          <div className="space-y-1">
                            <label htmlFor="input-client-site-mail-4" className="block text-[11px] font-bold text-slate-500 uppercase">
                              Email du contact 4.
                            </label>
                            <input
                              type="email"
                              id="input-client-site-mail-4"
                              value={emailSite4}
                              onChange={(e) => setEmailSite4(e.target.value)}
                              placeholder="Email."
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {(() => {
                    const isContact1Completed = (typeContact1 || '').trim() !== '' && (nomPrenomSite || '').trim() !== '' && (telephoneSite || '').trim() !== '' && (emailSite || '').trim() !== '';
                    const hasContact2Data = (typeContact2 || '').trim() !== '' || (nomContact2 || '').trim() !== '' || (telephoneSite2 || '').trim() !== '' || (emailSite2 || '').trim() !== '';
                    const showContact2 = isContact1Completed || hasContact2Data;
                    const isContact2Completed = (typeContact2 || '').trim() !== '' && (nomContact2 || '').trim() !== '' && (telephoneSite2 || '').trim() !== '' && (emailSite2 || '').trim() !== '';
                    
                    const hasContact3Data = (typeContact3 || '').trim() !== '' || (nomContact3 || '').trim() !== '' || (telephoneSite3 || '').trim() !== '' || (emailSite3 || '').trim() !== '';
                    const showContact3 = (showContact2 && isContact2Completed) || hasContact3Data;
                    const isContact3Completed = (typeContact3 || '').trim() !== '' && (nomContact3 || '').trim() !== '' && (telephoneSite3 || '').trim() !== '' && (emailSite3 || '').trim() !== '';

                    const hasContact4Data = (typeContact4 || '').trim() !== '' || (nomContact4 || '').trim() !== '' || (telephoneSite4 || '').trim() !== '' || (emailSite4 || '').trim() !== '';
                    const showContact4 = (showContact3 && isContact3Completed) || hasContact4Data;
                    const isContact4Completed = (typeContact4 || '').trim() !== '' && (nomContact4 || '').trim() !== '' && (telephoneSite4 || '').trim() !== '' && (emailSite4 || '').trim() !== '';

                    const hasContact5Data = (typeContact5 || '').trim() !== '' || (nomContact5 || '').trim() !== '' || (telephoneSite5 || '').trim() !== '' || (emailSite5 || '').trim() !== '';
                    const showContact5 = (showContact4 && isContact4Completed) || hasContact5Data;

                    if (!showContact5) return null;

                    return (
                      /* Contact 5 */
                      <div className="py-5 last:border-b-0 last:pb-0 space-y-2">
                        <div className="font-bold text-black font-sans" style={{ fontSize: '18px' }}>Contact 5.</div>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                          <div className="space-y-1">
                            <label htmlFor="input-client-site-type-5" className="block text-[11px] font-bold text-slate-500 uppercase">
                              Type.
                            </label>
                            <select
                              id="input-client-site-type-5"
                              value={typeContact5}
                              onChange={(e) => setTypeContact5(e.target.value)}
                              className="font-sans cursor-pointer focus:outline-none"
                            >
                              <option value="">Sélectionnez</option>
                              <option value="Direction">Direction</option>
                              <option value="Responsable">Responsable</option>
                              <option value="Commercial">Commercial</option>
                              <option value="Technique">Technique</option>
                              <option value="Acheteur">Acheteur</option>
                              <option value="Planification">Planification</option>
                              <option value="Autre">Autre</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label htmlFor="input-client-site-nom-5" className="block text-[11px] font-bold text-slate-500 uppercase">
                              Contact 5.
                            </label>
                            <input
                              type="text"
                              id="input-client-site-nom-5"
                              value={nomContact5}
                              onChange={(e) => setNomContact5(e.target.value)}
                              placeholder="Nom et prénom."
                            />
                          </div>

                          <div className="space-y-1">
                            <label htmlFor="input-client-site-tel-5" className="block text-[11px] font-bold text-slate-500 uppercase">
                              Téléphone du contact 5.
                            </label>
                            <input
                              type="text"
                              id="input-client-site-tel-5"
                              value={telephoneSite5}
                              onChange={(e) => setTelephoneSite5(e.target.value)}
                              placeholder="Téléphone."
                            />
                          </div>

                          <div className="space-y-1">
                            <label htmlFor="input-client-site-mail-5" className="block text-[11px] font-bold text-slate-500 uppercase">
                              Email du contact 5.
                            </label>
                            <input
                              type="email"
                              id="input-client-site-mail-5"
                              value={emailSite5}
                              onChange={(e) => setEmailSite5(e.target.value)}
                              placeholder="Email."
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Section 3 - Contrat de Maintenance du Client */}
              <div 
                className="bg-white p-5 relative space-y-3"
                style={{
                  border: '1px solid rgb(218, 218, 218)',
                  borderTop: 'none',
                  borderRadius: '0px 0px 18px 18px',
                }}
              >
                <div className="mb-2 bg-transparent flex flex-wrap items-center justify-between gap-4">
                  <span 
                    className="text-white px-3 py-1 text-[13px] inline-block font-sans"
                    style={{
                      backgroundColor: 'oklch(0.44 0.16 324.65)',
                      borderRadius: '1000px',
                      cursor: 'default',
                      fontWeight: 100,
                      textTransform: 'none',
                    }}
                  >
                    3 — Contrat
                  </span>
                </div>

                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label htmlFor="input-client-contract-name" className="block text-[11px] font-bold text-slate-500 uppercase">
                          Catégorie du contrat.
                        </label>
                        {setActiveTab && (
                          <button
                            type="button"
                            onClick={handleSaveAndRedirectToVariables}
                            className="text-[16px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer normal-case no-underline hover:no-underline"
                            style={{ textDecoration: 'none' }}
                          >
                            Nouvelle variable
                          </button>
                        )}
                      </div>
                      <select
                        id="input-client-contract-name"
                        value={nomContrat}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNomContrat(val);
                          const selectedModel = contractModels.find(v => v.nom === val);
                          if (selectedModel) {
                            setRedactionContrat(selectedModel.description || '');
                          } else {
                            setRedactionContrat('');
                          }
                        }}
                        className="font-sans cursor-pointer focus:outline-none"
                      >
                        <option value="">Sélectionnez une catégorie.</option>
                        {contractModels.map((v) => (
                          <option key={v.id} value={v.nom}>
                            {v.nom}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="input-client-contract-ref" className="block text-[11px] font-bold text-slate-500 uppercase">
                        Référence du contrat.
                      </label>
                      <input
                        type="text"
                        id="input-client-contract-ref"
                        value={referenceContrat}
                        onChange={(e) => setReferenceContrat(e.target.value)}
                        placeholder="Entrez une référence."
                        className="font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="input-client-contract-value" className="block text-[11px] font-bold text-slate-500 uppercase">
                        Valeur du contrat (€).
                      </label>
                      <input
                        type="text"
                        id="input-client-contract-value"
                        value={valeurContrat}
                        onChange={(e) => setValeurContrat(e.target.value)}
                        placeholder="Exemple : €123.00 /an"
                        className="font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label htmlFor="input-client-contract-start" className="block text-[11px] font-bold text-slate-500 uppercase">
                        Début.
                      </label>
                      <input
                        type="date"
                        id="input-client-contract-start"
                        value={debutContrat}
                        onChange={(e) => setDebutContrat(e.target.value)}
                        placeholder="dd/mm/yyyy"
                      />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="input-client-contract-end" className="block text-[11px] font-bold text-slate-500 uppercase">
                        Expiration.
                      </label>
                      <input
                        type="date"
                        id="input-client-contract-end"
                        value={finContrat}
                        onChange={(e) => setFinContrat(e.target.value)}
                        placeholder="dd/mm/yyyy"
                      />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="input-client-contract-marche" className="block text-[11px] font-bold text-slate-500 uppercase">
                        Numéro de marché.
                      </label>
                      <input
                        type="text"
                        id="input-client-contract-marche"
                        value={numeroMarche}
                        onChange={(e) => setNumeroMarche(e.target.value)}
                        placeholder="N° de marché"
                        className="font-mono"
                      />
                    </div>
                  </div>

                  {/* Rédaction du contrat */}
                  <div className="space-y-1 pt-2">
                    <div className="flex items-center gap-2 select-none">
                      <label htmlFor="input-client-contract-redac" className="block text-[11px] font-bold text-slate-500 uppercase">
                        Rédaction du contrat.
                      </label>
                      <span
                        onClick={handleGenerateWithFakeAI}
                        className="font-bold text-blue-600 hover:text-blue-800 cursor-pointer hover:underline transition-colors select-none"
                        style={{ fontSize: '16px' }}
                        id="btn-generate-contract-ia"
                      >
                        Générer le texte avec l'IA Textelp.
                      </span>
                    </div>
                    <textarea
                      id="input-client-contract-redac"
                      value={redactionContrat}
                      onChange={(e) => setRedactionContrat(e.target.value)}
                      placeholder="Entrez le texte du contrat."
                      rows={5}
                      className="font-sans"
                    />
                  </div>

                  {/* Date, Signé Par, Signature en 3 colonnes */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 items-start">
                    {/* Date de signature */}
                    <div className="space-y-1">
                      <label htmlFor="input-client-contract-sig-date" className="block text-[11px] font-bold text-slate-500 uppercase">
                        Date de signature.
                      </label>
                      <input
                        type="date"
                        id="input-client-contract-sig-date"
                        value={dateSignatureContrat}
                        onChange={(e) => setDateSignatureContrat(e.target.value)}
                        disabled
                        className="bg-slate-100 cursor-not-allowed opacity-70 font-sans"
                        style={{ backgroundColor: '#f1f5f9' }}
                      />
                    </div>

                    {/* Signé par */}
                    <div className="space-y-1">
                      <label htmlFor="input-client-contract-sig-by" className="block text-[11px] font-bold text-slate-500 uppercase">
                        Signé par.
                      </label>
                      <input
                        type="text"
                        id="input-client-contract-sig-by"
                        value={signeParContrat}
                        onChange={(e) => setSigneParContrat(e.target.value)}
                        placeholder="Nom du signataire"
                        disabled
                        className="bg-slate-100 cursor-not-allowed opacity-70 font-sans"
                        style={{ backgroundColor: '#f1f5f9' }}
                      />
                    </div>

                    {/* Signature du client */}
                    <div className="space-y-1 flex flex-col">
                      <label className="block text-[11px] font-bold text-slate-500 uppercase">
                        Signature du client.
                      </label>
                      <div 
                        className="bg-slate-50/50 flex flex-col items-center justify-center p-2"
                        style={{
                          border: '1px solid rgb(218, 218, 218)',
                          borderRadius: '13px',
                          minHeight: '120px',
                          boxSizing: 'border-box'
                        }}
                      >
                        {signatureClientContratImage ? (
                          <img 
                            src={signatureClientContratImage} 
                            alt="Signature du client" 
                            className="max-h-[100px] object-contain"
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Bouton Télécharger le contrat PDF */}
                  <div className="flex mt-4 w-full">
                    <button
                      type="button"
                      onClick={handleDownloadContractPDF}
                      disabled={!redactionContrat || !redactionContrat.trim()}
                      className={`w-full py-3 text-white font-bold transition-all font-sans border-0 ${
                        (!redactionContrat || !redactionContrat.trim()) ? 'cursor-not-allowed opacity-50 bg-slate-400' : 'cursor-pointer hover:bg-slate-800'
                      }`}
                      style={{
                        backgroundColor: (!redactionContrat || !redactionContrat.trim()) ? '#94a3b8' : '#000000',
                        borderRadius: '13px',
                        fontSize: '18px'
                      }}
                    >
                      Télécharger le contrat PDF
                    </button>
                  </div>

                  {/* Section 3 Autres Contrats (Jusqu'à 3 contrats supplémentaires) */}
                  <div className="space-y-4 mt-6" id="section-autres-contrats">
                    {autresContrats.length > 0 && (
                      <div className="space-y-4">
                        {autresContrats.map((ctr, idx) => (
                          <div 
                            key={ctr.id || idx} 
                            className="bg-white p-4 space-y-3 relative"
                            style={{
                              border: '1px solid #dedede',
                              borderRadius: '13px',
                            }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-black font-sans text-[16px]">
                                Autre contrat {idx + 1}.
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveAutresContrat(ctr.id)}
                                style={{
                                  backgroundColor: '#000000',
                                  borderRadius: '13px',
                                  fontSize: '18px',
                                  color: '#ffffff',
                                  padding: '6px 16px',
                                }}
                                className="font-bold cursor-pointer border-0 outline-none hover:bg-slate-800 transition-colors"
                              >
                                Supprimer
                              </button>
                            </div>

                            {/* Fields Grid 1 */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              <div className="space-y-1">
                                <label className="block text-[11px] font-bold text-slate-500 uppercase">
                                  Intitulé du contrat.
                                </label>
                                <input
                                  type="text"
                                  value={ctr.intitule}
                                  onChange={(e) => handleUpdateAutresContrat(ctr.id, 'intitule', e.target.value)}
                                  placeholder="Entrez un intitulé."
                                  className="font-sans"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="block text-[11px] font-bold text-slate-500 uppercase">
                                  Référence du contrat.
                                </label>
                                <input
                                  type="text"
                                  value={ctr.reference}
                                  onChange={(e) => handleUpdateAutresContrat(ctr.id, 'reference', e.target.value)}
                                  placeholder="Entrez une référence."
                                  className="font-mono"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="block text-[11px] font-bold text-slate-500 uppercase">
                                  Numéro de marché.
                                </label>
                                <input
                                  type="text"
                                  value={ctr.numeroMarche || ''}
                                  onChange={(e) => handleUpdateAutresContrat(ctr.id, 'numeroMarche', e.target.value)}
                                  placeholder="N° de marché"
                                  className="font-mono"
                                />
                              </div>
                            </div>

                            {/* Fields Grid 2 */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              <div className="space-y-1">
                                <label className="block text-[11px] font-bold text-slate-500 uppercase">
                                  Début.
                                </label>
                                <input
                                  type="date"
                                  value={ctr.debut}
                                  onChange={(e) => handleUpdateAutresContrat(ctr.id, 'debut', e.target.value)}
                                  placeholder="dd/mm/yyyy"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="block text-[11px] font-bold text-slate-500 uppercase">
                                  Expiration.
                                </label>
                                <input
                                  type="date"
                                  value={ctr.expiration}
                                  onChange={(e) => handleUpdateAutresContrat(ctr.id, 'expiration', e.target.value)}
                                  placeholder="dd/mm/yyyy"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="block text-[11px] font-bold text-slate-500 uppercase">
                                  Fichier (URL source).
                                </label>
                                <input
                                  type="text"
                                  value={ctr.fichierUrl || ''}
                                  onChange={(e) => handleUpdateAutresContrat(ctr.id, 'fichierUrl', e.target.value)}
                                  placeholder="https://..."
                                  className="font-sans"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {autresContrats.length < 3 && (
                      <button
                        type="button"
                        onClick={handleAddAutresContrat}
                        className="w-full py-3 text-white font-bold transition-all font-sans border-0 cursor-pointer hover:bg-slate-800 mt-2"
                        style={{
                          backgroundColor: '#000000',
                          borderRadius: '13px',
                          fontSize: '18px'
                        }}
                      >
                        Ajouter un autre contrat
                      </button>
                    )}
                  </div>

                </div>
              </div>

            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="client-tab-container">
      {/* Upper Action Block & Search metrics */}
      <div 
        className="bg-white space-y-4"
        style={{ border: '1px solid #dadada', borderTop: 'none', borderRadius: '0px 0px 18px 18px', maxWidth: '98%', margin: 'auto', padding: '20px', backgroundColor: '#ffffff' }}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold tracking-tight font-gochi" id="client-tab-title" style={{ color: '#000000', cursor: 'default' }}>Clients</h2>
          </div>

          {/* Both search and buttons are placed directly next to the title */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Field recherche (Search input) with size reduced */}
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                id="search-clients-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Recherche."
                className="w-full text-black placeholder-[#747474] placeholder:font-light outline-none"
                style={searchInputStyle}
                onMouseEnter={() => setIsSearchHovered(true)}
                onMouseLeave={() => setIsSearchHovered(false)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={openAddModal}
                id="btn-add-client"
                style={{
                  ...customButtonStyle,
                  backgroundColor: 'rgb(53, 86, 236)',
                  boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset'
                }}
              >
                Nouveau
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Records Sheet */}
      <div className="bg-white overflow-hidden mt-6 rounded-none" style={{ border: 'none', borderRadius: '0px', boxShadow: 'none' }}>
        <div className="overflow-x-auto">
          {filteredClients.length === 0 ? (
            <EmptyTablePlaceholder className="p-16 text-center font-sans lg:py-24" />
          ) : (
            <table className="w-full text-left font-sans border-collapse text-xs" id="clients-table" style={{ borderTop: '1px solid rgb(218, 218, 218)', borderBottom: '1px solid rgb(218, 218, 218)' }}>
              <thead>
                <tr className="bg-transparent border-b border-slate-100">
                  <th className="px-4 py-3.5 w-12 text-center" style={thStyle}>Volume.</th>
                  <th className="px-4 py-3.5" style={thStyle}>Entreprise.</th>
                  <th className="px-4 py-3.5" style={thStyle}>Numéro fiscal.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Contrat.</th>
                  <th className="px-4 py-3.5 text-right w-12" style={thStyle}>Actions.</th>
                </tr>
              </thead>
              <tbody className="text-slate-700 text-xs">
                {paginatedClients.map((client) => (
                  <tr
                    key={client.id}
                    id={`client-row-${client.id}`}
                    onClick={() => openEditModal(client)}
                    className="group hover:bg-[#ffecf8] transition-all cursor-pointer"
                  >
                    {/* Defib count pill */}
                    <td className="px-4 py-5 text-center whitespace-nowrap">
                      {(() => {
                        const count = defibrillateurs.filter(d => d.clientId === client.id).length;
                        return (
                          <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1 text-[11px] font-black text-white bg-[#fe4eba] rounded-full font-sans">
                            {count}
                          </span>
                        );
                      })()}
                    </td>

                    {/* Denomination */}
                    <td className="px-4 py-5 font-sans" style={{ fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                      <div className="font-semibold text-slate-950 whitespace-nowrap truncate max-w-[200px]" title={client.denomination}>
                        {client.denomination.length > 20 ? client.denomination.substring(0, 20) + '...' : client.denomination}
                      </div>
                    </td>

                    {/* SIRET */}
                    <td className="px-4 py-5 font-sans whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100 }}>
                      <div 
                        style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '8px',
                          border: '1px solid rgb(231, 231, 231)',
                          borderRadius: '1000px',
                          padding: '4px 12px',
                          backgroundColor: '#ffffff'
                        }} 
                        className="whitespace-nowrap"
                      >
                        {client.siret}
                      </div>
                    </td>

                    {/* Nom et Ref Contrat */}
                    <td className="px-4 py-5 font-sans whitespace-nowrap" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, whiteSpace: 'nowrap' }}>
                      {client.contrat === 'Oui' ? (
                        <p className="font-semibold text-slate-800 whitespace-nowrap inline-block" style={{ whiteSpace: 'nowrap' }}>{client.nomContrat}</p>
                      ) : null}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const defibCount = defibrillateurs.filter(d => d.clientId === client.id).length;
                        const isDeleteDisabled = defibCount > 0;
                        return (
                          <div className="inline-flex gap-2">
                            <button
                              onClick={() => openEditModal(client)}
                              id={`btn-edit-client-${client.id}`}
                              style={rowActionButton18Style}
                              className="cursor-pointer"
                            >
                              Modifier
                            </button>
                            <button
                              onClick={() => {
                                if (isDeleteDisabled) return;
                                onDeleteClient(client.id);
                              }}
                              disabled={isDeleteDisabled}
                              id={`btn-delete-client-${client.id}`}
                              style={{
                                ...rowActionButton18Style,
                                opacity: isDeleteDisabled ? 0.4 : 1,
                                cursor: isDeleteDisabled ? 'not-allowed' : 'pointer'
                              }}
                              className={isDeleteDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                            >
                              Supprimer
                            </button>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div 
        className="p-4 font-sans flex flex-col sm:flex-row items-center justify-between gap-4" 
        id="client-tab-total-summary"
      >
        <div style={{ fontSize: '18px', color: '#000000', fontWeight: 'bold', cursor: 'default' }}>
          Total clients (Tous) : {clients.length} ({paginatedClients.length} sur cette page).
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center gap-2">
          <select
            value={currentPage}
            onChange={(e) => setCurrentPage(Number(e.target.value))}
            id="select-client-page"
            className="appearance-none cursor-pointer focus:outline-none px-5 py-2"
            style={{
              fontSize: '18px',
              borderRadius: '13px',
              boxShadow: 'none',
              backgroundColor: '#000000',
              borderColor: '#000000',
              borderWidth: '1px',
              borderStyle: 'solid',
              color: '#ffffff',
              textAlign: 'center',
              textAlignLast: 'center',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <option key={p} value={p} style={{ backgroundColor: '#000000', color: '#ffffff', textAlign: 'center' }}>
                Page {p}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
