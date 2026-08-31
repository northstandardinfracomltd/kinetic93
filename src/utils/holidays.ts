export type SupportedCountry =
  | 'France'
  | 'Belgique'
  | 'Luxembourg'
  | 'Monaco'
  | 'Suisse'
  | 'Royaume-Uni'
  | 'Espagne'
  | 'Portugal';

/**
 * Meeus/Jones/Butcher algorithm to compute Easter Sunday in the Gregorian calendar.
 * Returns 1-indexed month (3 = March, 4 = April) and day.
 */
export function getEasterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const L = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * L) / 451);
  const month = Math.floor((h + L - 7 * m + 114) / 31);
  const day = ((h + L - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function addDaysToDate(year: number, month: number, day: number, daysToAdd: number): { year: number; month: number; day: number } {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + daysToAdd);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function formatDateKey(year: number, month: number, day: number): string {
  const mStr = String(month).padStart(2, '0');
  const dStr = String(day).padStart(2, '0');
  return `${year}-${mStr}-${dStr}`;
}

function getFirstMondayOfMonth(year: number, month: number): number {
  const d = new Date(Date.UTC(year, month - 1, 1));
  const dayOfWeek = d.getUTCDay(); // 0 = Sunday, 1 = Monday...
  return ((1 - dayOfWeek + 7) % 7) + 1;
}

function getLastMondayOfMonth(year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const d = new Date(Date.UTC(year, month - 1, lastDay));
  const dayOfWeek = d.getUTCDay();
  const diff = (dayOfWeek - 1 + 7) % 7;
  return lastDay - diff;
}

/**
 * Detects the active tenant/environment country from localStorage, companyInfo, or language setting.
 */
export function getActiveTenantCountry(companyInfo?: any): SupportedCountry {
  if (typeof window !== 'undefined') {
    const rawLang = localStorage.getItem('defib_lang') || '';
    const rawLower = rawLang.toLowerCase().trim();

    if (rawLower.includes('belgique') || rawLower.includes('belgium')) return 'Belgique';
    if (rawLower.includes('luxembourg')) return 'Luxembourg';
    if (rawLower.includes('monaco')) return 'Monaco';
    if (rawLower.includes('switzerland') || rawLower.includes('suisse') || rawLower.includes('schweiz')) return 'Suisse';
    if (rawLower.includes('united kingdom') || rawLower.includes('royaume-uni') || rawLower.includes('uk') || rawLower.includes('great britain') || rawLower.includes('angleterre')) return 'Royaume-Uni';
    if (rawLower.includes('spain') || rawLower.includes('espagne') || rawLower.includes('españa')) return 'Espagne';
    if (rawLower.includes('portugal')) return 'Portugal';
    if (rawLower.includes('france')) return 'France';
  }

  const cp = (companyInfo?.pays || companyInfo?.country || '').toLowerCase().trim();
  if (cp.includes('belgique') || cp.includes('belgium')) return 'Belgique';
  if (cp.includes('luxembourg')) return 'Luxembourg';
  if (cp.includes('monaco')) return 'Monaco';
  if (cp.includes('switzerland') || cp.includes('suisse') || cp.includes('schweiz')) return 'Suisse';
  if (cp.includes('united kingdom') || cp.includes('royaume-uni') || cp.includes('uk') || cp.includes('espagne') || cp.includes('great britain')) return 'Royaume-Uni';
  if (cp.includes('spain') || cp.includes('espagne') || cp.includes('españa')) return 'Espagne';
  if (cp.includes('portugal')) return 'Portugal';

  return 'France';
}

/**
 * Computes all public holidays for a given country and year.
 * Returns a map from ISO date string (YYYY-MM-DD) to holiday name.
 */
export function getHolidaysForYear(year: number, country: SupportedCountry): Record<string, string> {
  const holidays: Record<string, string> = {};
  const easter = getEasterSunday(year);

  // Common relative dates
  const goodFriday = addDaysToDate(year, easter.month, easter.day, -2);
  const easterSunday = easter;
  const easterMonday = addDaysToDate(year, easter.month, easter.day, 1);
  const ascensionThursday = addDaysToDate(year, easter.month, easter.day, 39);
  const whitMonday = addDaysToDate(year, easter.month, easter.day, 50);
  const corpusChristi = addDaysToDate(year, easter.month, easter.day, 60);

  switch (country) {
    case 'France':
      // 11 jours fériés nationaux
      holidays[formatDateKey(year, 1, 1)] = "Jour de l'An";
      holidays[formatDateKey(easterMonday.year, easterMonday.month, easterMonday.day)] = "Lundi de Pâques";
      holidays[formatDateKey(year, 5, 1)] = "Fête du Travail";
      holidays[formatDateKey(year, 5, 8)] = "Victoire de 1945";
      holidays[formatDateKey(ascensionThursday.year, ascensionThursday.month, ascensionThursday.day)] = "Jeudi de l'Ascension";
      holidays[formatDateKey(whitMonday.year, whitMonday.month, whitMonday.day)] = "Lundi de Pentecôte";
      holidays[formatDateKey(year, 7, 14)] = "Fête nationale";
      holidays[formatDateKey(year, 8, 15)] = "Assomption";
      holidays[formatDateKey(year, 11, 1)] = "Toussaint";
      holidays[formatDateKey(year, 11, 11)] = "Armistice de 1918";
      holidays[formatDateKey(year, 12, 25)] = "Noël";
      break;

    case 'Belgique':
      // 10 jours fériés légaux
      holidays[formatDateKey(year, 1, 1)] = "Jour de l'An";
      holidays[formatDateKey(easterMonday.year, easterMonday.month, easterMonday.day)] = "Lundi de Pâques";
      holidays[formatDateKey(year, 5, 1)] = "Fête du Travail";
      holidays[formatDateKey(ascensionThursday.year, ascensionThursday.month, ascensionThursday.day)] = "Jeudi de l'Ascension";
      holidays[formatDateKey(whitMonday.year, whitMonday.month, whitMonday.day)] = "Lundi de Pentecôte";
      holidays[formatDateKey(year, 7, 21)] = "Fête nationale";
      holidays[formatDateKey(year, 8, 15)] = "Assomption";
      holidays[formatDateKey(year, 11, 1)] = "Toussaint";
      holidays[formatDateKey(year, 11, 11)] = "Armistice de 1918";
      holidays[formatDateKey(year, 12, 25)] = "Noël";
      break;

    case 'Luxembourg':
      // 11 jours fériés légaux
      holidays[formatDateKey(year, 1, 1)] = "Jour de l'An";
      holidays[formatDateKey(easterMonday.year, easterMonday.month, easterMonday.day)] = "Lundi de Pâques";
      holidays[formatDateKey(year, 5, 1)] = "Fête du Travail";
      holidays[formatDateKey(year, 5, 9)] = "Journée de l'Europe";
      holidays[formatDateKey(ascensionThursday.year, ascensionThursday.month, ascensionThursday.day)] = "Jeudi de l'Ascension";
      holidays[formatDateKey(whitMonday.year, whitMonday.month, whitMonday.day)] = "Lundi de Pentecôte";
      holidays[formatDateKey(year, 6, 23)] = "Fête nationale (Anniversaire du Grand-Duc)";
      holidays[formatDateKey(year, 8, 15)] = "Assomption";
      holidays[formatDateKey(year, 11, 1)] = "Toussaint";
      holidays[formatDateKey(year, 12, 25)] = "Noël";
      holidays[formatDateKey(year, 12, 26)] = "Saint-Étienne";
      break;

    case 'Monaco':
      // 12 jours fériés légaux
      holidays[formatDateKey(year, 1, 1)] = "Jour de l'An";
      holidays[formatDateKey(year, 1, 27)] = "Sainte-Dévote (Patronne de Monaco)";
      holidays[formatDateKey(easterMonday.year, easterMonday.month, easterMonday.day)] = "Lundi de Pâques";
      holidays[formatDateKey(year, 5, 1)] = "Fête du Travail";
      holidays[formatDateKey(ascensionThursday.year, ascensionThursday.month, ascensionThursday.day)] = "Jeudi de l'Ascension";
      holidays[formatDateKey(whitMonday.year, whitMonday.month, whitMonday.day)] = "Lundi de Pentecôte";
      holidays[formatDateKey(corpusChristi.year, corpusChristi.month, corpusChristi.day)] = "Fête-Dieu";
      holidays[formatDateKey(year, 8, 15)] = "Assomption";
      holidays[formatDateKey(year, 11, 1)] = "Toussaint";
      holidays[formatDateKey(year, 11, 19)] = "Fête du Prince (Fête nationale)";
      holidays[formatDateKey(year, 12, 8)] = "Immaculée Conception";
      holidays[formatDateKey(year, 12, 25)] = "Noël";
      break;

    case 'Suisse':
      // 1 jour férié fédéral obligatoire + jours communs aux cantons
      holidays[formatDateKey(year, 1, 1)] = "Nouvel An";
      holidays[formatDateKey(goodFriday.year, goodFriday.month, goodFriday.day)] = "Vendredi saint";
      holidays[formatDateKey(easterMonday.year, easterMonday.month, easterMonday.day)] = "Lundi de Pâques";
      holidays[formatDateKey(ascensionThursday.year, ascensionThursday.month, ascensionThursday.day)] = "Jeudi de l'Ascension";
      holidays[formatDateKey(whitMonday.year, whitMonday.month, whitMonday.day)] = "Lundi de Pentecôte";
      holidays[formatDateKey(year, 8, 1)] = "Fête nationale";
      holidays[formatDateKey(year, 12, 25)] = "Noël";
      holidays[formatDateKey(year, 12, 26)] = "Saint-Étienne";
      break;

    case 'Royaume-Uni': {
      // Bank Holidays (Angleterre et Pays de Galles)
      const earlyMayDay = getFirstMondayOfMonth(year, 5);
      const springBankDay = getLastMondayOfMonth(year, 5);
      const summerBankDay = getLastMondayOfMonth(year, 8);

      holidays[formatDateKey(year, 1, 1)] = "New Year's Day";
      holidays[formatDateKey(goodFriday.year, goodFriday.month, goodFriday.day)] = "Good Friday";
      holidays[formatDateKey(easterMonday.year, easterMonday.month, easterMonday.day)] = "Easter Monday";
      holidays[formatDateKey(year, 5, earlyMayDay)] = "Early May Bank Holiday";
      holidays[formatDateKey(year, 5, springBankDay)] = "Spring Bank Holiday";
      holidays[formatDateKey(year, 8, summerBankDay)] = "Summer Bank Holiday";
      holidays[formatDateKey(year, 12, 25)] = "Christmas Day";
      holidays[formatDateKey(year, 12, 26)] = "Boxing Day";
      break;
    }

    case 'Espagne':
      // Jours fériés nationaux non substituables
      holidays[formatDateKey(year, 1, 1)] = "Jour de l'An (Año Nuevo)";
      holidays[formatDateKey(year, 1, 6)] = "Épiphanie (Reyes)";
      holidays[formatDateKey(goodFriday.year, goodFriday.month, goodFriday.day)] = "Vendredi saint (Viernes Santo)";
      holidays[formatDateKey(year, 5, 1)] = "Fête du Travail (Fiesta del Trabajo)";
      holidays[formatDateKey(year, 8, 15)] = "Assomption (Asunción de la Virgen)";
      holidays[formatDateKey(year, 10, 12)] = "Fête nationale espagnole (Fiesta Nacional de España)";
      holidays[formatDateKey(year, 11, 1)] = "Toussaint (Todos los Santos)";
      holidays[formatDateKey(year, 12, 6)] = "Jour de la Constitution (Día de la Constitución)";
      holidays[formatDateKey(year, 12, 8)] = "Immaculée Conception (Inmaculada Concepción)";
      holidays[formatDateKey(year, 12, 25)] = "Noël (Navidad)";
      break;

    case 'Portugal':
      // 13 jours fériés nationaux obligatoires
      holidays[formatDateKey(year, 1, 1)] = "Jour de l'An (Ano Novo)";
      holidays[formatDateKey(goodFriday.year, goodFriday.month, goodFriday.day)] = "Vendredi saint (Sexta-feira Santa)";
      holidays[formatDateKey(year, easterSunday.month, easterSunday.day)] = "Dimanche de Pâques (Páscoa)";
      holidays[formatDateKey(year, 4, 25)] = "Fête de la Liberté (Dia da Liberdade)";
      holidays[formatDateKey(year, 5, 1)] = "Fête du Travail (Dia do Trabalhador)";
      holidays[formatDateKey(corpusChristi.year, corpusChristi.month, corpusChristi.day)] = "Fête-Dieu (Corpo de Deus)";
      holidays[formatDateKey(year, 6, 10)] = "Fête nationale (Dia de Portugal)";
      holidays[formatDateKey(year, 8, 15)] = "Assomption (Assunção de Nossa Senhora)";
      holidays[formatDateKey(year, 10, 5)] = "Implantation de la République (Implantação da República)";
      holidays[formatDateKey(year, 11, 1)] = "Toussaint (Todos os Santos)";
      holidays[formatDateKey(year, 12, 1)] = "Restauration de l'Indépendance (Restauração da Independência)";
      holidays[formatDateKey(year, 12, 8)] = "Immaculée Conception (Imaculada Conceição)";
      holidays[formatDateKey(year, 12, 25)] = "Noël (Natal)";
      break;

    default:
      break;
  }

  return holidays;
}

/**
 * Checks if a given date string or Date object is a public holiday in the specified (or detected) tenant country.
 */
export function isHolidayDate(
  dateStrOrObj: string | Date | null | undefined,
  country?: SupportedCountry,
  companyInfo?: any
): { isHoliday: boolean; holidayName?: string } {
  if (!dateStrOrObj) return { isHoliday: false };
  let dateStr = '';
  let year = 0;

  if (typeof dateStrOrObj === 'string') {
    const trimmed = dateStrOrObj.trim();
    if (!trimmed || trimmed === 'A trier' || trimmed === 'À venir') return { isHoliday: false };
    if (trimmed.includes('/')) {
      const parts = trimmed.split('/');
      if (parts.length === 3) {
        // DD/MM/YYYY
        dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        year = parseInt(parts[2], 10);
      }
    } else if (trimmed.includes('-')) {
      const parts = trimmed.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          // YYYY-MM-DD
          dateStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          year = parseInt(parts[0], 10);
        } else if (parts[2].length === 4) {
          // DD-MM-YYYY
          dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          year = parseInt(parts[2], 10);
        }
      }
    }
  } else if (dateStrOrObj instanceof Date && !isNaN(dateStrOrObj.getTime())) {
    year = dateStrOrObj.getFullYear();
    const m = String(dateStrOrObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateStrOrObj.getDate()).padStart(2, '0');
    dateStr = `${year}-${m}-${d}`;
  }

  if (!dateStr || isNaN(year) || year <= 0) return { isHoliday: false };

  const targetCountry = country || getActiveTenantCountry(companyInfo);
  const holidays = getHolidaysForYear(year, targetCountry);
  if (holidays[dateStr]) {
    return { isHoliday: true, holidayName: holidays[dateStr] };
  }
  return { isHoliday: false };
}
