/**
 * Date utility functions for timezone conversion and formatting.
 */

/**
 * Formats a given Date object or defaults to current date into Europe/Paris timezone.
 * Output format: dd/mm/yyyy HH:mm:ss
 */
export function getParisTimestamp(date: Date = new Date()): string {
  try {
    const dtf = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const parts = dtf.formatToParts(date);
    const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return `${partMap.day}/${partMap.month}/${partMap.year} ${partMap.hour}:${partMap.minute}:${partMap.second}`;
  } catch (e) {
    // Simple fallback using local formatting with Paris timezone
    try {
      return date.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
    } catch (err) {
      return date.toLocaleString('fr-FR');
    }
  }
}

/**
 * Normalizes and formats a notification's timestamp string to dd/mm/yyyy HH:mm:ss in Europe/Paris.
 */
export function formatNotificationTimestamp(ts: string): string {
  if (!ts) return '';
  // If already in dd/mm/yyyy format
  if (/^\d{2}\/\d{2}\/\d{4}/.test(ts)) {
    return ts;
  }
  // If in YYYY-MM-DD HH:mm:ss format (historically UTC from original toISOString)
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ts)) {
    const date = new Date(ts.replace(' ', 'T') + 'Z');
    if (!isNaN(date.getTime())) {
      return getParisTimestamp(date);
    }
  }
  // ISO or other formats
  const date = new Date(ts);
  if (!isNaN(date.getTime())) {
    return getParisTimestamp(date);
  }
  return ts;
}
