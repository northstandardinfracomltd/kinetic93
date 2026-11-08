export function extractRefsFromToursAndReports(
  toursList?: any[],
  reportsList?: any[],
  targetSet: Set<string> = new Set<string>()
): Set<string> {
  if (Array.isArray(toursList)) {
    for (const t of toursList) {
      if (!t) continue;
      const items = Array.isArray(t.missions)
        ? t.missions
        : Array.isArray(t.passages)
        ? t.passages
        : [t];
      for (const m of items) {
        if (!m) continue;
        const raw =
          m.interventionReference ||
          m._rawSheetRow?.['Référence intervention'] ||
          m._rawSheetRow?.['Référence Intervention.'] ||
          '';
        const clean = String(raw || '').trim();
        if (clean && !clean.startsWith('fsm-m-')) {
          targetSet.add(clean.toUpperCase());
        }
      }
    }
  }

  if (Array.isArray(reportsList)) {
    for (const r of reportsList) {
      if (!r) continue;
      const candidates = [
        r.interventionReference,
        r.reportNumber,
        r._rawSheetRow?.['Section 0 - Référence intervention'],
        r._rawSheetRow?.['Référence intervention'],
      ];
      for (const c of candidates) {
        const clean = String(c || '').trim();
        if (clean && !clean.startsWith('fsm-m-')) {
          targetSet.add(clean.toUpperCase());
        }
      }
    }
  }

  return targetSet;
}

export function collectLocalInterventionReferences(
  tenantId?: string,
  extraTours?: any[],
  extraReports?: any[]
): Set<string> {
  const refs = new Set<string>();
  extractRefsFromToursAndReports(extraTours, extraReports, refs);

  if (typeof window !== 'undefined') {
    const tid = (tenantId || localStorage.getItem('defib_tenant_id') || 'demo').trim();
    const tourKeys = [
      `defib_${tid}_fsm_tours`,
      `defib_${tid}_tours`,
      'defib_fsm_tours',
      'defib_mobile_tours2',
    ];
    for (const key of tourKeys) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            extractRefsFromToursAndReports(parsed, undefined, refs);
          }
        }
      } catch (_) {}
    }

    const reportKeys = [
      `defib_${tid}_generated_reports`,
      `defib_${tid}_reports`,
      'defib_generated_reports',
    ];
    for (const key of reportKeys) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            extractRefsFromToursAndReports(undefined, parsed, refs);
          }
        }
      } catch (_) {}
    }
  }

  return refs;
}

/**
 * Computes the next sequential intervention reference (e.g. INT-2026-00003)
 * following the TOURNÉES ET MISSIONS numbering and skipping any duplicates.
 */
export function computeNextInterventionReference(
  existingRefs: Iterable<string | undefined | null>,
  offset = 0
): string {
  const normalizedSet = new Set<string>();
  let maxSeqBelow10k = 0;
  let maxSeqAny = 0;
  const intRegex = /^INT-(\d{4})-(\d+)$/i;

  for (const r of existingRefs) {
    const clean = String(r || '').trim().toUpperCase();
    if (!clean) continue;
    normalizedSet.add(clean);
    const m = clean.match(intRegex);
    if (m) {
      const num = parseInt(m[2], 10);
      if (!isNaN(num) && num > 0) {
        if (num < 10000 && num > maxSeqBelow10k) {
          maxSeqBelow10k = num;
        }
        if (num > maxSeqAny) {
          maxSeqAny = num;
        }
      }
    }
  }

  const baseMax = maxSeqBelow10k > 0 ? maxSeqBelow10k : maxSeqAny;
  let candidateNum = baseMax + 1 + Math.max(0, offset);
  let candidateRef = `INT-2026-${String(candidateNum).padStart(5, '0')}`;

  while (normalizedSet.has(candidateRef.toUpperCase())) {
    candidateNum += 1;
    candidateRef = `INT-2026-${String(candidateNum).padStart(5, '0')}`;
  }

  return candidateRef;
}

/**
 * Hidden background lookup against both Missions des Tournées and Rapports PDF
 * spreadsheets + local storage to guarantee sequential continuity and zero duplicates.
 */
export async function fetchAndComputeNextInterventionReference(
  tenantId?: string,
  extraTours?: any[],
  extraReports?: any[]
): Promise<string> {
  const activeTid =
    (tenantId || (typeof window !== 'undefined' ? localStorage.getItem('defib_tenant_id') : '') || 'demo').trim();
  const refs = collectLocalInterventionReferences(activeTid, extraTours, extraReports);

  try {
    const [missionsRes, reportsRes] = await Promise.all([
      fetch('/api/sheets/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: activeTid, type: 'missionsTournees' }),
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/sheets/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: activeTid, type: 'rapportsPdf' }),
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);

    if (missionsRes && Array.isArray(missionsRes.items)) {
      extractRefsFromToursAndReports(missionsRes.items, undefined, refs);
    }
    if (reportsRes && Array.isArray(reportsRes.items)) {
      extractRefsFromToursAndReports(undefined, reportsRes.items, refs);
    }
  } catch (_) {}

  return computeNextInterventionReference(refs);
}
