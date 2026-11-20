/**
 * Module d'intégration complet avec l'API Nationale Géo'DAE — Atlasanté (API PRODIGE Ressources v2.0)
 * - Client HTTP GeoDaeClient (Authentification JWT Bearer + fallback Cookie PHPSESSID, gestion expiration mot de passe 6 mois, retry session)
 * - Validateur et Mapper strict GeoDaeMapper (Schéma Géo'DAE v2.0, WGS84 EPSG:4326, normalisation E.164, ISO 8601, SIREN 9 chiffres, nettoyage CSV BOM)
 * - Service de synchronisation sync_dae / syncBatchDae (Création POST / Mise à jour PATCH avec persistance silencieuse du gid)
 */

export const DEFAULT_GEODAE_UUID = process.env.GEODAE_UUID || 'b338c8fc-6e70-4bec-9381-03bc2c2afbd8';
export const DEFAULT_GEODAE_BASE_URL = process.env.GEODAE_BASE_URL || 'https://catalogue.atlasante.fr';

/**
 * Exception métier dédiée lorsque le mot de passe Géo'DAE a expiré (expiration tous les 6 mois sur Atlasanté)
 */
export class GeoDaePasswordExpiredError extends Error {
  public readonly statusCode: number = 401;
  public readonly code: string = 'GEODAE_PASSWORD_EXPIRED';

  constructor(message?: string) {
    super(
      message ||
        "Votre mot de passe Géo'DAE a expiré (validité de 6 mois sur Atlasanté). Veuillez le renouveler sur le portail https://catalogue.atlasante.fr puis mettre à jour vos identifiants dans Paramètres > Connecteurs."
    );
    this.name = 'GeoDaePasswordExpiredError';
  }
}

/**
 * Exception HTTP structurée pour les erreurs de l'API Géo'DAE (400, 401, 403, 422, 500)
 */
export class GeoDaeApiError extends Error {
  public readonly statusCode: number;
  public readonly details: string;
  public readonly endpoint: string;

  constructor(statusCode: number, message: string, details: string = '', endpoint: string = '') {
    super(message);
    this.name = 'GeoDaeApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.endpoint = endpoint;
  }
}

export interface GeoDaeProperties {
  gid?: number;
  nom: string;
  lat_coor1: number;
  long_coor1: number;
  adr_num?: string;
  adr_voie?: string;
  com_cp?: string;
  com_insee?: string;
  com_nom?: string;
  acc: 'Intérieur' | 'Extérieur';
  acc_lib: 'oui' | 'non' | boolean;
  acc_pcsec?: 'oui' | 'non' | boolean;
  acc_acc?: 'oui' | 'non' | boolean;
  acc_etg?: string;
  acc_complt?: string;
  photo1?: string;
  photo2?: string;
  dispo_horaires: string;
  disp_complt?: string;
  tel1: string;
  tel2: string;
  site_email?: string;
  date_instal?: string;
  etat_fonct:
    | 'En fonctionnement'
    | 'Hors service'
    | 'Supprimé définitivement'
    | 'Absent momentanément'
    | 'Inconnu';
  id_euro?: string;
  modele?: string;
  ic_ped?: 'oui' | 'non' | boolean;
  dtpr_icped?: string;
  dtpr_lcad?: string;
  dtpr_bat?: string;
  freq_mnt?: string;
  dispsurv?: 'oui' | 'non' | boolean;
  dermnt: string;
  expt_siren?: string;
  expt_rais?: string;
}

export interface GeoDaeFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: {
      type: 'Point';
      coordinates: [number, number]; // [long_coor1, lat_coor1] en WGS 84 (EPSG:4326)
    };
    properties: GeoDaeProperties;
  }>;
}

export interface GeoDaeValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  payload?: GeoDaeFeatureCollection;
  existingGid?: number;
}

const ALLOWED_ACC = new Set(['Intérieur', 'Extérieur']);
const ALLOWED_BOOL_TEXT = new Set(['oui', 'non']);
const ALLOWED_ETAT_FONCT = new Set([
  'En fonctionnement',
  'Hors service',
  'Supprimé définitivement',
  'Absent momentanément',
  'Inconnu',
]);

const ALLOWED_SCHEMA_KEYS = new Set([
  'gid',
  'nom',
  'lat_coor1',
  'long_coor1',
  'adr_num',
  'adr_voie',
  'com_cp',
  'com_insee',
  'com_nom',
  'acc',
  'acc_lib',
  'acc_pcsec',
  'acc_acc',
  'acc_etg',
  'acc_complt',
  'photo1',
  'photo2',
  'dispo_horaires',
  'disp_complt',
  'tel1',
  'tel2',
  'site_email',
  'date_instal',
  'etat_fonct',
  'id_euro',
  'modele',
  'ic_ped',
  'dtpr_icped',
  'dtpr_lcad',
  'dtpr_bat',
  'freq_mnt',
  'dispsurv',
  'dermnt',
  'expt_siren',
  'expt_rais',
]);

/**
 * Module de validation et de mapping (GeoDaeMapper)
 * Transforme les objets DAE internes ou lignes CSV en payload GeoJSON conforme au schéma Géo'DAE v2.0
 */
export class GeoDaeMapper {
  /**
   * Normalise un numéro de téléphone au format international E.164 (+33XXXXXXXXX)
   * Retourne null si le numéro est invalide.
   */
  public static normalizePhoneE164(rawPhone: string | undefined | null): string | null {
    if (!rawPhone) return null;
    let cleaned = String(rawPhone)
      .replace(/^\uFEFF/, '')
      .replace(/[\s.\-()\/]/g, '')
      .trim();
    if (!cleaned) return null;

    if (cleaned.startsWith('0033')) {
      cleaned = '+33' + cleaned.slice(4);
    } else if (cleaned.startsWith('33') && cleaned.length === 11) {
      cleaned = '+' + cleaned;
    } else if (cleaned.startsWith('0') && cleaned.length === 10) {
      cleaned = '+33' + cleaned.slice(1);
    } else if (/^[1-9]\d{8}$/.test(cleaned)) {
      cleaned = '+33' + cleaned;
    }

    // Format international E.164 strict : +33 suivi de 9 chiffres (ou format E.164 international +[1-9]\d{7,14})
    if (/^\+33[1-9]\d{8}$/.test(cleaned)) {
      return cleaned;
    }
    if (/^\+[1-9]\d{7,14}$/.test(cleaned)) {
      return cleaned;
    }
    return null;
  }

  /**
   * Convertit une date (JJ/MM/AAAA, JJ-MM-AAAA, ISO) au format strict ISO 8601 AAAA-MM-JJ
   * Retourne null si la date est invalide.
   */
  public static normalizeIsoDate(rawDate: string | undefined | null): string | null {
    if (!rawDate) return null;
    const trimmed = String(rawDate).replace(/^\uFEFF/, '').trim();
    if (!trimmed) return null;

    let year = '';
    let month = '';
    let day = '';

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      [year, month, day] = trimmed.split('-');
    } else if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
      [year, month, day] = trimmed.slice(0, 10).split('-');
    } else if (trimmed.includes('/')) {
      const parts = trimmed.split('/');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          [year, month, day] = parts;
        } else if (parts[2].length === 4) {
          [day, month, year] = parts;
        }
      }
    } else if (trimmed.includes('-')) {
      const parts = trimmed.split('-');
      if (parts.length === 3 && parts[2].length === 4) {
        [day, month, year] = parts;
      }
    }

    if (!year || !month || !day) return null;
    const yNum = parseInt(year, 10);
    const mNum = parseInt(month, 10);
    const dNum = parseInt(day, 10);
    if (isNaN(yNum) || isNaN(mNum) || isNaN(dNum)) return null;
    if (yNum < 1970 || yNum > 2100 || mNum < 1 || mNum > 12 || dNum < 1 || dNum > 31) return null;

    const iso = `${String(yNum).padStart(4, '0')}-${String(mNum).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
    const checkDate = new Date(`${iso}T00:00:00Z`);
    if (isNaN(checkDate.getTime()) || checkDate.toISOString().slice(0, 10) !== iso) {
      return null;
    }
    return iso;
  }

  /**
   * Valide et normalise un numéro SIREN sur 9 chiffres exactement.
   * Rejette les SIRET à 14 chiffres non tronqués si demandé en validation brute, ou extrait/valide les 9 chiffres hors suite de zéros.
   */
  public static normalizeSiren(rawSirenOrSiret: string | undefined | null, strict9Only = false): string | null {
    if (!rawSirenOrSiret) return null;
    const rawTrimmed = String(rawSirenOrSiret).replace(/^\uFEFF/, '').replace(/\s+/g, '').trim();
    if (!rawTrimmed) return null;

    if (strict9Only && !/^\d{9}$/.test(rawTrimmed)) {
      return null;
    }

    const digits = rawTrimmed.replace(/\D/g, '');
    if (!digits) return null;

    // Si un SIRET de 14 chiffres est fourni depuis la fiche Client/Société interne, on extrait les 9 premiers chiffres du SIREN
    // sauf si strict9Only est activé (validation directe du payload GeoJSON)
    const siren = strict9Only ? digits : (digits.length === 14 ? digits.slice(0, 9) : digits);
    if (!/^\d{9}$/.test(siren)) return null;
    if (/^0+$/.test(siren)) return null; // Rejeter les suites de zéros ("000000000")
    return siren;
  }

  /**
   * Sépare une adresse en numéro de voie (adr_num) et nom de voie (adr_voie)
   */
  public static splitAddress(rawAddr: string | undefined | null): { adr_num: string; adr_voie: string } {
    if (!rawAddr) return { adr_num: '', adr_voie: '' };
    const trimmed = String(rawAddr).replace(/^\uFEFF/, '').trim();
    const match = trimmed.match(/^(\d+\s*(?:bis|ter|quater|[a-zA-Z])?)\s*[,\s]\s*(.+)$/i);
    if (match) {
      return { adr_num: match[1].trim(), adr_voie: match[2].trim() };
    }
    return { adr_num: '', adr_voie: trimmed };
  }

  /**
   * Nettoie un objet issu d'un import CSV ou JSON brut :
   * - Supprime le caractère UTF-8 BOM (\ufeff) sur les clés et valeurs
   * - Mappe les anciens champs (tel_1 -> tel1, tel_2 -> tel2, expt_email -> site_email)
   * - Rejette les champs hors schéma Géo'DAE v2.0
   */
  public static sanitizeRawRecord(rawRecord: Record<string, any>): {
    cleaned: Record<string, any>;
    rejectedFields: string[];
  } {
    const cleaned: Record<string, any> = {};
    const rejectedFields: string[] = [];

    for (const [rawKey, rawVal] of Object.entries(rawRecord || {})) {
      let key = String(rawKey).replace(/^\uFEFF/, '').trim();
      if (!key) continue;

      // Mapping des anciens champs
      if (key === 'tel_1') key = 'tel1';
      if (key === 'tel_2') key = 'tel2';
      if (key === 'expt_email') key = 'site_email';

      if (!ALLOWED_SCHEMA_KEYS.has(key)) {
        rejectedFields.push(key);
        continue;
      }

      const val = typeof rawVal === 'string' ? rawVal.replace(/^\uFEFF/, '').trim() : rawVal;
      cleaned[key] = val;
    }

    return { cleaned, rejectedFields };
  }

  /**
   * Extrait un éventuel gid numérique depuis numeroAtlasante (ex: "12345" ou "GID:12345") ou gid explicite
   */
  public static extractExistingGid(dae: Record<string, any>): number | undefined {
    if (typeof dae.gid === 'number' && Number.isInteger(dae.gid) && dae.gid > 0) {
      return dae.gid;
    }
    if (typeof dae.gid === 'string' && /^\d+$/.test(dae.gid.trim())) {
      return parseInt(dae.gid.trim(), 10);
    }
    const numAtlas = String(dae.numeroAtlasante || dae.numero_atlasante || '').trim();
    if (/^\d+$/.test(numAtlas)) {
      const parsed = parseInt(numAtlas, 10);
      if (parsed > 0) return parsed;
    }
    const gidMatch = numAtlas.match(/^GID[-:\s]*(\d+)$/i);
    if (gidMatch) {
      return parseInt(gidMatch[1], 10);
    }
    return undefined;
  }

  /**
   * Transforme un objet DAE interne (avec son client, modèle et infos société optionnels)
   * en propriétés Géo'DAE v2.0 et valide strictement toutes les contraintes avant envoi.
   */
  public static mapAndValidateDae(
    daeInput: Record<string, any>,
    options: {
      useBooleanTypes?: boolean; // Adaptateur si /api/structure/{uuid} requiert boolean au lieu de "oui"/"non"
      isUpdate?: boolean;
      gid?: number;
    } = {}
  ): GeoDaeValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Support soit d'un objet DAE interne, soit d'un objet déjà au format plat Géo'DAE / CSV
    const isAlreadyGeoDaeProps =
      daeInput &&
      (daeInput.lat_coor1 !== undefined ||
        daeInput.long_coor1 !== undefined ||
        daeInput.dispo_horaires !== undefined ||
        daeInput.etat_fonct !== undefined);

    let rawProps: Record<string, any> = {};

    if (isAlreadyGeoDaeProps) {
      const { cleaned, rejectedFields } = this.sanitizeRawRecord(daeInput);
      rawProps = cleaned;
      if (rejectedFields.length > 0) {
        errors.push(`Champs hors schéma Géo'DAE v2.0 rejetés : ${rejectedFields.join(', ')}`);
      }
    } else {
      // Construction depuis le modèle interne Defibrillateur + Client + Variable + CompanyInfo
      const df = daeInput.defib || daeInput;
      const cl = daeInput.client || {};
      const modDef = daeInput.modeleVar || {};
      const companyInfo = daeInput.companyInfo || {};

      const clientDenom = String(cl?.denomination || df?.clientNom || '').trim();
      const identifiantVal = String(df?.identifiant || '').trim();
      const nomVal =
        String(df?.nomSite || '').trim() ||
        `${identifiantVal} ${clientDenom}`.trim() ||
        identifiantVal ||
        clientDenom;

      const rawLat = String(df?.latitude ?? '').trim().replace(',', '.');
      const rawLng = String(df?.longitude ?? '').trim().replace(',', '.');

      const { adr_num, adr_voie } = this.splitAddress(df?.numVoie || df?.numeroVoie || cl?.adresse || '');
      const com_cp = String(df?.cp || df?.codePostal || cl?.codePostal || '').trim();
      const com_insee = String(df?.com_insee || df?.codeInsee || '').trim();
      const com_nom = String(df?.ville || cl?.ville || '').trim();

      const isExt =
        df?.exterieur === true ||
        String(df?.installeExterieur || '').trim().toLowerCase() === 'oui';
      const acc = isExt ? 'Extérieur' : 'Intérieur';
      const acc_lib = df?.acces247 || isExt ? 'oui' : 'non';
      const acc_pcsec = 'non';
      const acc_acc = isExt ? 'non' : 'oui';
      const acc_etg = String(df?.etage ?? '0').trim() || '0';
      const acc_complt = String(df?.commentaireAdresse || df?.commentaire || '').trim();

      const dispo_horaires =
        df?.horaires && String(df.horaires).trim()
          ? String(df.horaires).trim()
          : df?.acces247
          ? '24h/24 7j/7'
          : 'Lundi au vendredi : 08h30-18h00 (heures ouvrables)';
      const disp_complt = String(df?.disp_complt || '').trim();

      const rawTel1 =
        df?.telephoneSite || cl?.telephoneSite || cl?.phone || companyInfo?.phone || '';
      const rawTel2 =
        df?.telephoneSiteSecondaire ||
        cl?.telephoneSite2 ||
        companyInfo?.phone ||
        rawTel1 ||
        '';

      const site_email = String(
        df?.emailSite || cl?.emailSite || cl?.email || companyInfo?.email || ''
      ).trim();

      const date_instal = df?.miseEnService || df?.fabrication || '';

      let etat_fonct = 'En fonctionnement';
      if (String(df?.archive || '').trim().toLowerCase() === 'oui') {
        etat_fonct = 'Supprimé définitivement';
      } else if (String(df?.conforme || '').trim().toLowerCase() === 'non') {
        etat_fonct = 'Hors service';
      } else if (df?.etat_fonct && String(df.etat_fonct).trim()) {
        etat_fonct = String(df.etat_fonct).trim();
      }

      const id_euro = String(df?.numeroAtlasante || df?.identifiant || '').trim();
      const modele =
        df?.modeleNom
          ? String(df.modeleNom).trim()
          : modDef?.nom
          ? (modDef.marque ? `${modDef.marque} ${modDef.nom}`.trim() : String(modDef.nom).trim())
          : String(df?.modele || '').trim();

      const hasPed = Boolean(
        (df?.modeleElectrodePId && String(df.modeleElectrodePId).trim()) ||
          (df?.lotElectrodeP && String(df.lotElectrodeP).trim()) ||
          (df?.peremptionElectrodeP && String(df.peremptionElectrodeP).trim()) ||
          String(df?.hasPadpakP || '').trim().toLowerCase() === 'oui'
      );
      const ic_ped = hasPed ? 'oui' : 'non';
      const dtpr_icped = hasPed ? (df?.peremptionElectrodeP || df?.peremptionPadpakP || '') : '';
      const dtpr_lcad = df?.peremptionElectrodeA || df?.peremptionPadpakA || '';
      const dtpr_bat = df?.peremptionBatterie || '';

      const freq_mnt = 'Annuelle';
      const dispsurv = 'non';
      const dermnt = df?.derniereMaintenance || df?.miseEnService || '';

      const rawSiretOrSiren = df?.expt_siren || cl?.siret || companyInfo?.siret || '';
      const expt_rais = String(clientDenom || companyInfo?.name || '').trim();

      rawProps = {
        nom: nomVal,
        lat_coor1: rawLat,
        long_coor1: rawLng,
        adr_num,
        adr_voie,
        com_cp,
        com_insee,
        com_nom,
        acc,
        acc_lib,
        acc_pcsec,
        acc_acc,
        acc_etg,
        acc_complt,
        photo1: String(df?.photo1 || '').trim(),
        photo2: String(df?.photo2 || '').trim(),
        dispo_horaires,
        disp_complt,
        tel1: rawTel1,
        tel2: rawTel2,
        site_email,
        date_instal,
        etat_fonct,
        id_euro,
        modele,
        ic_ped,
        dtpr_icped,
        dtpr_lcad,
        dtpr_bat,
        freq_mnt,
        dispsurv,
        dermnt,
        expt_siren: rawSiretOrSiren,
        expt_rais,
      };
    }

    // 1. Validation des champs obligatoires :
    // nom, lat_coor1, long_coor1, acc, acc_lib, dispo_horaires, tel1, tel2, etat_fonct, dermnt
    const nom = String(rawProps.nom ?? '').replace(/^\uFEFF/, '').trim();
    if (!nom) {
      errors.push("Le champ obligatoire 'nom' (Nom du site / DAE) est manquant.");
    }

    // 2. Coordonnées WGS84 (lat_coor1, long_coor1)
    const latStr = String(rawProps.lat_coor1 ?? '').replace(',', '.').trim();
    const lngStr = String(rawProps.long_coor1 ?? '').replace(',', '.').trim();
    const latNum = latStr !== '' ? Number(latStr) : NaN;
    const lngNum = lngStr !== '' ? Number(lngStr) : NaN;

    if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
      errors.push(
        `Le champ obligatoire 'lat_coor1' (Latitude WGS84) est manquant ou invalide (${rawProps.lat_coor1 ?? 'vide'}).`
      );
    }
    if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
      errors.push(
        `Le champ obligatoire 'long_coor1' (Longitude WGS84) est manquant ou invalide (${rawProps.long_coor1 ?? 'vide'}).`
      );
    }

    // 3. Environnement (acc) : Uniquement "Intérieur" ou "Extérieur" (sensible à la casse et aux accents)
    const acc = String(rawProps.acc ?? '').trim();
    if (!ALLOWED_ACC.has(acc)) {
      errors.push(
        `Le champ obligatoire 'acc' doit être exactement "Intérieur" ou "Extérieur" (reçu : "${acc}").`
      );
    }

    // 4. Champs booléens textuels (acc_lib, acc_pcsec, acc_acc, ic_ped, dispsurv)
    const adaptBool = (fieldName: string, rawVal: any, required: boolean): 'oui' | 'non' | boolean | undefined => {
      if (rawVal === undefined || rawVal === null || rawVal === '') {
        if (required) {
          errors.push(`Le champ obligatoire '${fieldName}' est manquant (attendu : "oui" ou "non").`);
        }
        return undefined;
      }
      let normText: string;
      if (typeof rawVal === 'boolean') {
        normText = rawVal ? 'oui' : 'non';
      } else {
        normText = String(rawVal).trim();
      }
      if (!ALLOWED_BOOL_TEXT.has(normText)) {
        errors.push(`Le champ '${fieldName}' doit valoir uniquement "oui" ou "non" (reçu : "${rawVal}").`);
        return undefined;
      }
      if (options.useBooleanTypes) {
        return normText === 'oui';
      }
      return normText as 'oui' | 'non';
    };

    const acc_lib = adaptBool('acc_lib', rawProps.acc_lib, true);
    const acc_pcsec = adaptBool('acc_pcsec', rawProps.acc_pcsec ?? 'non', false);
    const acc_acc = adaptBool('acc_acc', rawProps.acc_acc ?? 'oui', false);
    const ic_ped = adaptBool('ic_ped', rawProps.ic_ped ?? 'non', false);
    const dispsurv = adaptBool('dispsurv', rawProps.dispsurv ?? 'non', false);

    // 5. Horaires de disponibilité (dispo_horaires)
    const dispo_horaires = String(rawProps.dispo_horaires ?? '').trim();
    if (!dispo_horaires) {
      errors.push("Le champ obligatoire 'dispo_horaires' est manquant.");
    }

    // 6. Téléphones (tel1, tel2) au format international E.164 (+33XXXXXXXXX)
    const tel1 = this.normalizePhoneE164(rawProps.tel1);
    if (!tel1) {
      errors.push(
        `Le champ obligatoire 'tel1' est manquant ou invalide au format E.164 (+33XXXXXXXXX) (reçu : "${rawProps.tel1 ?? ''}").`
      );
    }

    const tel2 = this.normalizePhoneE164(rawProps.tel2 || rawProps.tel1);
    if (!tel2) {
      errors.push(
        `Le champ obligatoire 'tel2' est manquant ou invalide au format E.164 (+33XXXXXXXXX) (reçu : "${rawProps.tel2 ?? ''}").`
      );
    }

    // 7. État de fonctionnement (etat_fonct)
    const etat_fonct = String(rawProps.etat_fonct ?? '').trim();
    if (!ALLOWED_ETAT_FONCT.has(etat_fonct)) {
      errors.push(
        `Le champ obligatoire 'etat_fonct' doit être l'une des 5 valeurs autorisées ("En fonctionnement", "Hors service", "Supprimé définitivement", "Absent momentanément", "Inconnu") (reçu : "${etat_fonct}").`
      );
    }

    // 8. Dates (date_instal, dtpr_icped, dtpr_lcad, dtpr_bat, dermnt) au format strict ISO 8601 AAAA-MM-JJ
    const validateOptionalOrRequiredDate = (fieldName: string, rawVal: any, required: boolean): string | undefined => {
      const strVal = String(rawVal ?? '').trim();
      if (!strVal) {
        if (required) {
          errors.push(`Le champ obligatoire '${fieldName}' (Date ISO AAAA-MM-JJ) est manquant.`);
        }
        return undefined;
      }
      const iso = this.normalizeIsoDate(strVal);
      if (!iso) {
        errors.push(`Le champ '${fieldName}' doit être au format strict ISO 8601 AAAA-MM-JJ (reçu : "${strVal}").`);
        return undefined;
      }
      return iso;
    };

    const dermnt = validateOptionalOrRequiredDate('dermnt', rawProps.dermnt, true);
    const date_instal = validateOptionalOrRequiredDate('date_instal', rawProps.date_instal, false);
    const dtpr_icped = validateOptionalOrRequiredDate('dtpr_icped', rawProps.dtpr_icped, false);
    const dtpr_lcad = validateOptionalOrRequiredDate('dtpr_lcad', rawProps.dtpr_lcad, false);
    const dtpr_bat = validateOptionalOrRequiredDate('dtpr_bat', rawProps.dtpr_bat, false);

    // 9. SIREN (expt_siren) : 9 chiffres exactement (rejeter SIRET 14 chiffres si passé directement ou suites de zéros)
    let expt_siren: string | undefined = undefined;
    const rawSirenStr = String(rawProps.expt_siren ?? '').replace(/\s+/g, '').trim();
    if (rawSirenStr) {
      if (isAlreadyGeoDaeProps) {
        // Si fourni directement dans un payload GeoJSON ou CSV Géo'DAE, refuser strictement 14 chiffres ou zéros
        const strictSiren = this.normalizeSiren(rawSirenStr, true);
        if (!strictSiren) {
          errors.push(
            `Le champ 'expt_siren' doit contenir exactement 9 chiffres valides (les SIRET à 14 chiffres et les suites de zéros sont rejetés, reçu : "${rawSirenStr}").`
          );
        } else {
          expt_siren = strictSiren;
        }
      } else {
        // Depuis l'objet interne, on extrait les 9 chiffres du SIREN et on rejette s'il est invalide ou suite de zéros
        const extractedSiren = this.normalizeSiren(rawSirenStr, false);
        if (!extractedSiren) {
          if (/^0+$/.test(rawSirenStr.replace(/\D/g, ''))) {
            errors.push(`Le champ 'expt_siren' ne peut pas être une suite de zéros ("${rawSirenStr}").`);
          } else {
            errors.push(`Le champ 'expt_siren' doit comporter 9 chiffres valides (reçu : "${rawSirenStr}").`);
          }
        } else {
          expt_siren = extractedSiren;
        }
      }
    }

    const resolvedGid =
      options.gid ??
      this.extractExistingGid(daeInput.defib || daeInput) ??
      (typeof rawProps.gid === 'number' ? rawProps.gid : undefined);

    if (errors.length > 0) {
      return {
        valid: false,
        errors,
        warnings,
        existingGid: resolvedGid,
      };
    }

    const properties: GeoDaeProperties = {
      ...(options.isUpdate && resolvedGid ? { gid: resolvedGid } : {}),
      nom,
      lat_coor1: latNum,
      long_coor1: lngNum,
      adr_num: String(rawProps.adr_num ?? '').trim(),
      adr_voie: String(rawProps.adr_voie ?? '').trim(),
      com_cp: String(rawProps.com_cp ?? '').trim(),
      com_insee: String(rawProps.com_insee ?? '').trim(),
      com_nom: String(rawProps.com_nom ?? '').trim(),
      acc: acc as 'Intérieur' | 'Extérieur',
      acc_lib: acc_lib!,
      acc_pcsec: acc_pcsec ?? (options.useBooleanTypes ? false : 'non'),
      acc_acc: acc_acc ?? (options.useBooleanTypes ? true : 'oui'),
      acc_etg: String(rawProps.acc_etg ?? '0').trim() || '0',
      acc_complt: String(rawProps.acc_complt ?? '').trim(),
      ...(rawProps.photo1 ? { photo1: String(rawProps.photo1).trim() } : {}),
      ...(rawProps.photo2 ? { photo2: String(rawProps.photo2).trim() } : {}),
      dispo_horaires,
      disp_complt: String(rawProps.disp_complt ?? '').trim(),
      tel1: tel1!,
      tel2: tel2!,
      site_email: String(rawProps.site_email ?? '').trim(),
      ...(date_instal ? { date_instal } : {}),
      etat_fonct: etat_fonct as GeoDaeProperties['etat_fonct'],
      id_euro: String(rawProps.id_euro ?? '').trim(),
      modele: String(rawProps.modele ?? '').trim(),
      ic_ped: ic_ped ?? (options.useBooleanTypes ? false : 'non'),
      ...(dtpr_icped ? { dtpr_icped } : {}),
      ...(dtpr_lcad ? { dtpr_lcad } : {}),
      ...(dtpr_bat ? { dtpr_bat } : {}),
      freq_mnt: String(rawProps.freq_mnt ?? 'Annuelle').trim() || 'Annuelle',
      dispsurv: dispsurv ?? (options.useBooleanTypes ? false : 'non'),
      dermnt: dermnt!,
      ...(expt_siren ? { expt_siren } : {}),
      expt_rais: String(rawProps.expt_rais ?? '').trim(),
    };

    const payload: GeoDaeFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [lngNum, latNum], // Ordre GeoJSON WGS84 (EPSG:4326) : [longitude, latitude]
          },
          properties,
        },
      ],
    };

    return {
      valid: true,
      errors: [],
      warnings,
      payload,
      existingGid: resolvedGid,
    };
  }
}

/**
 * Client HTTP GeoDaeClient
 * Gère :
 * - L'authentification JWT Bearer (POST /api/jwt_login) avec fallback Session Cookie PHPSESSID (POST /api/login)
 * - La détection spécifique de l'expiration du mot de passe (6 mois) -> GeoDaePasswordExpiredError
 * - Le renouvellement automatique de la session en cas d'expiration (401 en cours de traitement)
 * - Les endpoints GET /api/structure/{uuid}, GET /api/enum/{uuid}, GET /api/data/{uuid}, POST /api/data/{uuid}, PATCH /api/data/{uuid}/gid
 */
export class GeoDaeClient {
  private readonly baseUrl: string;
  private readonly uuid: string;
  private readonly login: string;
  private readonly password: string;

  private jwtToken: string | null = null;
  private phpSessId: string | null = null;

  constructor(config: {
    login: string;
    password: string;
    uuid?: string;
    baseUrl?: string;
  }) {
    this.login = String(config.login || '').trim();
    this.password = String(config.password || '').trim();
    this.uuid = String(config.uuid || DEFAULT_GEODAE_UUID).trim();
    this.baseUrl = String(config.baseUrl || DEFAULT_GEODAE_BASE_URL)
      .trim()
      .replace(/\/+$/, '');
  }

  private getBasicAuthHeader(): string {
    // Si l'utilisateur a déjà collé un token Basic encodé ou login:password
    if (this.login.startsWith('Basic ')) {
      return this.login;
    }
    const rawCredentials = `${this.login}:${this.password}`;
    return `Basic ${Buffer.from(rawCredentials, 'utf-8').toString('base64')}`;
  }

  private checkPasswordExpired(status: number, responseBodyText: string): void {
    if (status === 401) {
      const normalized = responseBodyText
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (normalized.includes('mot de passe expire') || normalized.includes('password expired')) {
        throw new GeoDaePasswordExpiredError();
      }
    }
  }

  /**
   * Authentification auprès d'Atlasanté :
   * 1. Tente Méthode 1 : POST /api/jwt_login (JWT Bearer)
   * 2. Fallback Méthode 2 : POST /api/login (Cookie PHPSESSID)
   */
  public async authenticate(): Promise<void> {
    this.jwtToken = null;
    this.phpSessId = null;

    const basicHeader = this.getBasicAuthHeader();

    // Méthode 1 : JWT Bearer (POST /api/jwt_login)
    try {
      const jwtUrl = `${this.baseUrl}/api/jwt_login`;
      console.log(`[GeoDaeClient] Tentative d'authentification JWT sur ${jwtUrl}...`);
      const jwtRes = await fetch(jwtUrl, {
        method: 'POST',
        headers: {
          Authorization: basicHeader,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          username: this.login,
          login: this.login,
          password: this.password,
        }),
      });

      const jwtText = await jwtRes.text();
      this.checkPasswordExpired(jwtRes.status, jwtText);

      if (jwtRes.ok) {
        let parsed: any = null;
        try {
          parsed = JSON.parse(jwtText);
        } catch (_) {}

        const token =
          parsed?.token ||
          parsed?.jwt ||
          parsed?.access_token ||
          (typeof parsed === 'string' && parsed.split('.').length === 3 ? parsed : null);

        if (token) {
          this.jwtToken = String(token).trim();
          console.log(`[GeoDaeClient] Authentification JWT réussie.`);
          return;
        }
        // Si le serveur a renvoyé un Set-Cookie PHPSESSID même sur jwt_login
        const cookieFromJwt = this.extractPhpSessId(jwtRes);
        if (cookieFromJwt) {
          this.phpSessId = cookieFromJwt;
          console.log(`[GeoDaeClient] Session PHPSESSID obtenue via /api/jwt_login.`);
          return;
        }
      }
    } catch (err) {
      if (err instanceof GeoDaePasswordExpiredError) {
        throw err;
      }
      console.warn(`[GeoDaeClient] Fallback vers /api/login suite à erreur sur /api/jwt_login:`, (err as Error).message);
    }

    // Méthode 2 : Session Cookie PHPSESSID (POST /api/login)
    const loginUrl = `${this.baseUrl}/api/login`;
    console.log(`[GeoDaeClient] Authentification Basic / Session Cookie sur ${loginUrl}...`);
    const loginRes = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        Authorization: basicHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    const loginText = await loginRes.text();
    this.checkPasswordExpired(loginRes.status, loginText);

    if (!loginRes.ok) {
      throw new GeoDaeApiError(
        loginRes.status,
        `Échec de l'authentification Géo'DAE (HTTP ${loginRes.status}). Vérifiez votre identifiant de login et votre mot de passe Atlasanté.`,
        loginText,
        '/api/login'
      );
    }

    const sessId = this.extractPhpSessId(loginRes);
    if (sessId) {
      this.phpSessId = sessId;
      console.log(`[GeoDaeClient] Authentification Session Cookie (PHPSESSID) réussie.`);
      return;
    }

    // Vérifier si un token JWT est présent dans le corps de /api/login
    try {
      const parsed = JSON.parse(loginText);
      if (parsed?.token || parsed?.jwt) {
        this.jwtToken = parsed.token || parsed.jwt;
        return;
      }
    } catch (_) {}

    console.warn(`[GeoDaeClient] Réponse 200 OK sur /api/login sans cookie PHPSESSID ni JWT explicite.`);
  }

  private extractPhpSessId(res: Response): string | null {
    const getSetCookie = (res.headers as any).getSetCookie;
    if (typeof getSetCookie === 'function') {
      const cookies: string[] = getSetCookie.call(res.headers);
      for (const c of cookies) {
        const match = c.match(/PHPSESSID=([^;]+)/);
        if (match) return match[1];
      }
    }
    const setCookieHeader = res.headers.get('set-cookie');
    if (setCookieHeader) {
      const match = setCookieHeader.match(/PHPSESSID=([^;]+)/);
      if (match) return match[1];
    }
    return null;
  }

  private buildAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.jwtToken) {
      headers['Authorization'] = `Bearer ${this.jwtToken}`;
    } else if (this.phpSessId) {
      headers['Cookie'] = `PHPSESSID=${this.phpSessId}`;
    }
    return headers;
  }

  /**
   * Exécute une requête authentifiée avec renouvellement automatique de session en cas de 401
   */
  public async request(
    path: string,
    init: RequestInit = {},
    retryOn401 = true
  ): Promise<{ status: number; data: any; rawText: string }> {
    if (!this.jwtToken && !this.phpSessId) {
      await this.authenticate();
    }

    const url = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    const headers = {
      ...this.buildAuthHeaders(),
      ...(init.headers || {}),
    };

    const response = await fetch(url, {
      ...init,
      headers,
    });

    const rawText = await response.text();
    this.checkPasswordExpired(response.status, rawText);

    // Renouvellement automatique de la session si expirée (401 Unauthorized)
    if (response.status === 401 && retryOn401) {
      console.log(`[GeoDaeClient] Session expirée (401) sur ${path}, renouvellement automatique...`);
      await this.authenticate();
      return this.request(path, init, false);
    }

    let parsedData: any = null;
    if (rawText) {
      try {
        parsedData = JSON.parse(rawText);
      } catch (_) {
        parsedData = rawText;
      }
    }

    if (!response.ok) {
      const statusMessages: Record<number, string> = {
        400: 'Requête invalide (400 Bad Request) — Le format GeoJSON ou un champ est mal formé.',
        401: 'Non autorisé (401 Unauthorized) — Identifiants Géo\'DAE invalides ou session expirée.',
        403: 'Accès refusé (403 Forbidden) — Votre compte Atlasanté n\'a pas les droits d\'écriture sur cette ressource.',
        422: 'Entité non traitable (422 Unprocessable Entity) — Erreur métier ou contrainte de schéma Géo\'DAE non respectée.',
        500: 'Erreur interne du serveur Atlasanté (500 Internal Server Error).',
      };
      const baseMsg = statusMessages[response.status] || `Erreur HTTP ${response.status} sur l'API Géo'DAE`;
      const serverMsg =
        typeof parsedData === 'object' && parsedData !== null
          ? parsedData.message || parsedData.error || parsedData.detail || JSON.stringify(parsedData)
          : rawText;

      console.error(`[GeoDaeClient] Erreur HTTP ${response.status} sur ${path}:`, serverMsg);
      throw new GeoDaeApiError(response.status, baseMsg, String(serverMsg || ''), path);
    }

    return {
      status: response.status,
      data: parsedData,
      rawText,
    };
  }

  /**
   * GET /api/structure/{uuid}
   */
  public async getStructure(): Promise<any> {
    const res = await this.request(`/api/structure/${this.uuid}`, { method: 'GET' });
    return res.data;
  }

  /**
   * GET /api/enum/{uuid}
   */
  public async getEnums(): Promise<any> {
    const res = await this.request(`/api/enum/${this.uuid}`, { method: 'GET' });
    return res.data;
  }

  /**
   * Recherche un DAE existant sur Géo'DAE par son nom ou son id_euro afin de récupérer son `gid` s'il est inconnu localement.
   * Endpoint : GET /api/data/{uuid}?nature=edit&_where=eq(nom,<valeur>)
   */
  public async findExistingGid(params: { nom?: string; id_euro?: string }): Promise<number | null> {
    try {
      const extractGidFromData = (data: any): number | null => {
        if (!data) return null;
        if (Array.isArray(data.features) && data.features.length > 0) {
          const feat = data.features[0];
          const gidCand = feat?.properties?.gid ?? feat?.id ?? feat?.gid;
          if (gidCand && !isNaN(Number(gidCand))) return Number(gidCand);
        }
        if (Array.isArray(data) && data.length > 0) {
          const gidCand = data[0]?.gid ?? data[0]?.properties?.gid;
          if (gidCand && !isNaN(Number(gidCand))) return Number(gidCand);
        }
        return null;
      };

      if (params.id_euro && params.id_euro.trim()) {
        const cleanIdEuro = params.id_euro.trim();
        const whereIdEuro = encodeURIComponent(`eq(id_euro,${cleanIdEuro})`);
        const resId = await this.request(
          `/api/data/${this.uuid}?nature=edit&_where=${whereIdEuro}&limit=1`,
          { method: 'GET' }
        );
        const foundById = extractGidFromData(resId.data);
        if (foundById) return foundById;
      }

      if (params.nom && params.nom.trim()) {
        const cleanNom = params.nom.trim();
        const whereNom = encodeURIComponent(`eq(nom,${cleanNom})`);
        const resNom = await this.request(
          `/api/data/${this.uuid}?nature=edit&_where=${whereNom}&limit=1`,
          { method: 'GET' }
        );
        const foundByNom = extractGidFromData(resNom.data);
        if (foundByNom) return foundByNom;
      }
    } catch (err) {
      // Si la recherche échoue (ex: 404 ou filtre non supporté sur un caractère spécial), on loggue et on continue vers la création POST
      console.warn(`[GeoDaeClient] Recherche préalable de gid ignorée:`, (err as Error).message);
    }
    return null;
  }

  /**
   * Création d'un nouveau DAE : POST /api/data/{uuid}
   */
  public async createDae(payload: GeoDaeFeatureCollection): Promise<{ gid?: number; responseData: any }> {
    // S'assurer que gid est omis lors d'un POST
    const cleanPayload: GeoDaeFeatureCollection = {
      type: 'FeatureCollection',
      features: payload.features.map(f => {
        const { gid: _omitGid, ...restProps } = f.properties;
        return {
          ...f,
          properties: restProps as GeoDaeProperties,
        };
      }),
    };

    const res = await this.request(`/api/data/${this.uuid}`, {
      method: 'POST',
      body: JSON.stringify(cleanPayload),
    });

    const extractedGid = this.extractGidFromWriteResponse(res.data);
    return {
      gid: extractedGid,
      responseData: res.data,
    };
  }

  /**
   * Mise à jour d'un DAE existant : PATCH /api/data/{uuid}/gid (avec fallback PATCH /api/data_tabulaire/{uuid})
   */
  public async updateDae(gid: number, payload: GeoDaeFeatureCollection): Promise<{ gid: number; responseData: any }> {
    const patchPayload: GeoDaeFeatureCollection = {
      type: 'FeatureCollection',
      features: payload.features.map(f => ({
        ...f,
        properties: {
          ...f.properties,
          gid,
        },
      })),
    };

    try {
      const res = await this.request(`/api/data/${this.uuid}/gid`, {
        method: 'PATCH',
        body: JSON.stringify(patchPayload),
      });
      return {
        gid,
        responseData: res.data,
      };
    } catch (err) {
      if (err instanceof GeoDaeApiError && (err.statusCode === 404 || err.statusCode === 405)) {
        // Fallback sur /api/data_tabulaire/{uuid}
        const resTab = await this.request(`/api/data_tabulaire/${this.uuid}`, {
          method: 'PATCH',
          body: JSON.stringify(patchPayload),
        });
        return {
          gid,
          responseData: resTab.data,
        };
      }
      throw err;
    }
  }

  private extractGidFromWriteResponse(data: any): number | undefined {
    if (!data) return undefined;
    if (Array.isArray(data) && data[0]?.gid && !isNaN(Number(data[0].gid))) {
      return Number(data[0].gid);
    }
    if (typeof data === 'object') {
      if (data.gid && !isNaN(Number(data.gid))) return Number(data.gid);
      if (Array.isArray(data.features) && data.features[0]?.properties?.gid) {
        return Number(data.features[0].properties.gid);
      }
      if (Array.isArray(data.results) && data.results[0]?.gid) {
        return Number(data.results[0].gid);
      }
    }
    return undefined;
  }
}

export interface SyncDaeResult {
  id: string;
  identifiant: string;
  numeroSerie: string;
  nom: string;
  operation: 'CREATE' | 'UPDATE' | 'VALIDATION_ERROR' | 'API_ERROR';
  success: boolean;
  gid?: number;
  message: string;
  errors?: string[];
  details?: string;
  data?: any;
}

/**
 * Service de synchronisation unitaire : sync_dae(dae_data)
 * 1. Valide strictement les données selon le schéma Géo'DAE v2.0
 * 2. Vérifie si un `gid` existe déjà (ou le recherche via GET filtré sur Géo'DAE si absent)
 * 3. Exécute POST /api/data/{uuid} (création) ou PATCH /api/data/{uuid}/gid (mise à jour)
 * 4. Retourne le `gid` pour sauvegarde silencieuse dans la base locale
 */
export async function sync_dae(
  client: GeoDaeClient,
  daeData: Record<string, any>,
  options: { useBooleanTypes?: boolean } = {}
): Promise<SyncDaeResult> {
  const df = daeData.defib || daeData;
  const id = String(df?.id || daeData?.id || '').trim();
  const identifiant = String(df?.identifiant || daeData?.identifiant || 'Sans ID').trim();
  const numeroSerie = String(df?.numeroSerie || daeData?.numeroSerie || 'N/A').trim();

  // 1. Validation & Mapping GeoJSON
  const validation = GeoDaeMapper.mapAndValidateDae(daeData, {
    useBooleanTypes: options.useBooleanTypes,
  });

  const nom = validation.payload?.features?.[0]?.properties?.nom || identifiant;

  if (!validation.valid || !validation.payload) {
    return {
      id,
      identifiant,
      numeroSerie,
      nom,
      operation: 'VALIDATION_ERROR',
      success: false,
      message: 'Échec de validation Géo\'DAE v2.0',
      errors: validation.errors,
      details: validation.errors.join(' | '),
    };
  }

  try {
    // 2. Détermination du gid (local ou recherche distante sur Géo'DAE)
    let targetGid: number | undefined = validation.existingGid;
    const props = validation.payload.features[0].properties;

    if (!targetGid) {
      const foundRemoteGid = await client.findExistingGid({
        nom: props.nom,
        id_euro: props.id_euro,
      });
      if (foundRemoteGid) {
        targetGid = foundRemoteGid;
      }
    }

    // 3. Exécution de PATCH (si gid connu) ou POST (si nouveau DAE)
    if (targetGid) {
      const updateRes = await client.updateDae(targetGid, validation.payload);
      return {
        id,
        identifiant,
        numeroSerie,
        nom: props.nom,
        operation: 'UPDATE',
        success: true,
        gid: updateRes.gid,
        message: `Mis à jour sur Géo'DAE (gid: ${updateRes.gid})`,
        data: updateRes.responseData,
      };
    } else {
      const createRes = await client.createDae(validation.payload);
      return {
        id,
        identifiant,
        numeroSerie,
        nom: props.nom,
        operation: 'CREATE',
        success: true,
        gid: createRes.gid,
        message: createRes.gid
          ? `Créé sur Géo'DAE (gid: ${createRes.gid})`
          : `Créé sur Géo'DAE`,
        data: createRes.responseData,
      };
    }
  } catch (err: any) {
    if (err instanceof GeoDaePasswordExpiredError) {
      throw err; // Remonter immédiatement l'erreur d'expiration de mot de passe
    }
    const errMsg = err instanceof GeoDaeApiError ? err.message : (err?.message || 'Erreur inconnue');
    const errDetails = err instanceof GeoDaeApiError ? err.details : '';
    return {
      id,
      identifiant,
      numeroSerie,
      nom,
      operation: 'API_ERROR',
      success: false,
      message: errMsg,
      details: errDetails,
    };
  }
}
