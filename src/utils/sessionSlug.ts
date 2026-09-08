/**
 * Utility to generate and auto-update the random session slug on access to the login page.
 * Format: /y26m8v105DRSHdatacentersession<3 digits><3 uppercase letters>
 * Examples: /y26m8v105DRSHdatacentersession826CFH, /y26m8v105DRSHdatacentersession000ABC
 */

export function generateRandomSessionSlug(): string {
  const digits = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  const lettersChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let letters = '';
  for (let i = 0; i < 3; i++) {
    letters += lettersChars.charAt(Math.floor(Math.random() * lettersChars.length));
  }
  return `/y26m8v105DRSHdatacentersession${digits}${letters}`;
}

export function updateLoginSessionSlug(): string {
  if (typeof window === 'undefined') return '';
  const newSlug = generateRandomSessionSlug();
  const search = window.location.search || '';
  const hash = window.location.hash || '';
  try {
    window.history.replaceState(null, '', `${newSlug}${search}${hash}`);
  } catch (e) {
    console.warn('Unable to replaceState for session slug:', e);
  }
  return newSlug;
}
