import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Member } from '../types';
import { SpontaneousEvent } from './PlanningTab';
import { fetchCollectionFromFirestore, saveCollectionToFirestore } from '../firebase';
import { getActiveTenantCountry, getHolidaysForYear, SupportedCountry } from '../utils/holidays';

interface PlanningExtendedViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  techniciansList: Member[];
  resolvedTours: any[];
  spontaneousEvents: SpontaneousEvent[];
  clients?: any[];
  defibrillateurs?: any[];
  otherEquipments?: any[];
  initialMonth?: number;
  initialYear?: number;
  onUpdateSpontaneousEvents?: (events: SpontaneousEvent[]) => void;
  onUpdateTours?: (tours: any[]) => void;
  onConsultMission?: (tour: any, mission: any) => void;
}

const MONTH_NAMES_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

const DAY_NAMES_SHORT_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

const normalizeName = (name?: string): string => {
  return (name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

const isUnassignedTechName = (name?: any): boolean => {
  const n = normalizeName(String(name || ''));
  return (
    !n ||
    n === 'non assigne' ||
    n === 'non renseigne' ||
    n === 'a trier' ||
    n === 'a-trier' ||
    n === 'nc' ||
    n === '-' ||
    n === '--' ||
    n === 'aucun'
  );
};

const getCleanTechName = (raw?: any): string => {
  const s = String(raw || '').trim();
  return isUnassignedTechName(s) ? '' : s;
};

const SYSTEM_CRENEAU_SLOTS = [
  '8:00am', '8:30am', '9:00am', '9:30am',
  '10:00am', '10:30am', '11:00am', '11:30am',
  '12:00pm', '12:30pm', '13:00pm', '13:30pm',
  '14:00pm', '14:30pm', '15:00pm', '15:30pm',
  '16:00pm', '16:30pm', '17:00pm',
];

const normalizeToSystemSlot = (raw: any): string => {
  const s = String(raw ?? '').trim();
  if (!s || s === '--:--') return '9:00am';
  if (SYSTEM_CRENEAU_SLOTS.includes(s)) return s;
  const match = s.match(/(\d{1,2})[:h](\d{2})\s*(am|pm)?/i);
  if (match) {
    let h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const suf = (match[3] || '').toLowerCase();
    if (suf === 'pm' && h < 12) h += 12;
    const totalMins = h * 60 + (isNaN(m) ? 0 : m);
    const clampedMins = Math.max(8 * 60, Math.min(17 * 60, Math.round(totalMins / 30) * 30));
    const finalH = Math.floor(clampedMins / 60);
    const finalM = clampedMins % 60;
    const finalSuffix = finalH >= 12 ? 'pm' : 'am';
    return `${finalH}:${String(finalM).padStart(2, '0')}${finalSuffix}`;
  }
  return '9:00am';
};

const formatSlotToAmPm = (raw: any): string => {
  const s = String(raw ?? '').trim();
  if (!s || s === '--:--') return '--:--';
  return normalizeToSystemSlot(s);
};

const toIsoDateStr = (rawDate?: any): string => {
  if (!rawDate || rawDate === 'A trier') return '';
  const s = String(rawDate).trim();
  if (s.includes('-')) {
    const parts = s.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
      if (parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
  }
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
      if (parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
  }
  return s;
};

const getMissionIsoDate = (m: any): string | null => {
  if (!m) return null;
  const raw = m.estimatedDate || m.date;
  if (!raw || (typeof raw !== 'string' && typeof raw !== 'number')) return null;
  const s = String(raw).trim();
  if (s === '' || s === 'A trier' || s === 'a-trier' || s === 'Non renseigné' || s === '--' || s === 'NC') {
    return null;
  }
  const iso = toIsoDateStr(s);
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return null;
  }
  return iso;
};

const isDraftTour = (tour: any): boolean => {
  if (!tour) return true;
  if (tour.id === 'a-trier' || tour.id === 'A trier') return true;
  const statusStr = String(tour.status || '').trim().toLowerCase();
  return statusStr === 'brouillon' || statusStr === 'draft' || statusStr === 'à trier' || statusStr === 'a trier';
};

const getISOWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

const parseTimeInMinutes = (raw: any): number | null => {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  const match = s.match(/(\d{1,2})[h:](\d{2})?/);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    if (s.includes('pm') && hours < 12) hours += 12;
    if (!isNaN(hours) && hours >= 0 && hours <= 24) {
      return hours * 60 + minutes;
    }
  }
  return null;
};

const getTimeOffsetPercent = (rawTime: any): number => {
  const mins = parseTimeInMinutes(rawTime);
  if (mins === null) return 0;
  // Standard workday scale: 07:30 (450 mins) to 18:30 (1110 mins)
  const startDayMins = 7.5 * 60; // 450
  const endDayMins = 18.5 * 60;  // 1110
  const clamped = Math.max(startDayMins, Math.min(endDayMins, mins));
  return (clamped - startDayMins) / (endDayMins - startDayMins); // 0 to 1
};

type DraggedPlanningItem =
  | {
      type: 'mission';
      missionId: string;
      sourceTourId: string;
      sourceTechName: string;
      missionObj: any;
    }
  | {
      type: 'event';
      eventId: string;
      sourceTechName: string;
      eventObj: SpontaneousEvent;
    };

interface DragOverTargetInfo {
  rowKey: string;
  tourId?: string;
  isoDate: string;
  techName: string;
  techEmail?: string;
  slot24h: string;
  slotAmPm: string;
  clientX: number;
  clientY: number;
}

const computeSlotFromDragEvent = (e: React.DragEvent<HTMLElement>) => {
  const rect = e.currentTarget.getBoundingClientRect();
  const relX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
  const ratio = rect.width > 0 ? relX / rect.width : 0.5;
  const slotIndex = Math.max(
    0,
    Math.min(SYSTEM_CRENEAU_SLOTS.length - 1, Math.round(ratio * (SYSTEM_CRENEAU_SLOTS.length - 1)))
  );
  const systemSlot = SYSTEM_CRENEAU_SLOTS[slotIndex];
  return {
    slot24h: systemSlot,
    slotAmPm: systemSlot,
    clientX: e.clientX,
    clientY: e.clientY,
  };
};

export const PlanningExtendedViewModal: React.FC<PlanningExtendedViewModalProps> = ({
  isOpen,
  onClose,
  techniciansList,
  resolvedTours: initialTours,
  spontaneousEvents: initialEvents,
  clients = [],
  defibrillateurs = [],
  otherEquipments = [],
  initialMonth,
  initialYear,
  onUpdateSpontaneousEvents,
  onUpdateTours,
  onConsultMission,
}) => {
  const today = useMemo(() => new Date(), []);
  const [currentMonth, setCurrentMonth] = useState<number>(() => {
    return typeof initialMonth === 'number' ? initialMonth : today.getMonth();
  });
  const [currentYear, setCurrentYear] = useState<number>(() => {
    return typeof initialYear === 'number' ? initialYear : today.getFullYear();
  });

  const [activeCountry, setActiveCountry] = useState<SupportedCountry>(() =>
    getActiveTenantCountry()
  );

  useEffect(() => {
    const handleUpdate = () => {
      setActiveCountry(getActiveTenantCountry());
    };
    handleUpdate();
    window.addEventListener('defib_lang_changed', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('defib_lang_changed', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const holidaysMap = useMemo(() => {
    return {
      ...getHolidaysForYear(currentYear - 1, activeCountry),
      ...getHolidaysForYear(currentYear, activeCountry),
      ...getHolidaysForYear(currentYear + 1, activeCountry),
    };
  }, [currentYear, activeCountry]);

  // Real-time clock for the vertical red cursor bar
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const todayCursorPercent = useMemo(() => {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    const currentTotalMins = hours * 60 + minutes;

    // Scale between 07:30 (450 mins) and 18:30 (1110 mins) -> 660 mins span
    const startDayMins = 7.5 * 60; // 450
    const endDayMins = 18.5 * 60;  // 1110
    const rawPct = ((currentTotalMins - startDayMins) / (endDayMins - startDayMins)) * 100;
    return Math.max(2, Math.min(98, rawPct));
  }, [currentTime]);

  // Local re-fetchable data states for live "Actualiser" button
  const [localTours, setLocalTours] = useState<any[]>(initialTours || []);
  const [localEvents, setLocalEvents] = useState<SpontaneousEvent[]>(initialEvents || []);
  const [lastRefreshedText, setLastRefreshedText] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Unified Drag & Drop state for missions and spontaneous events across technicians, days, and slots
  const [draggedItem, setDraggedItem] = useState<DraggedPlanningItem | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<DragOverTargetInfo | null>(null);
  const [openMissionMenuKey, setOpenMissionMenuKey] = useState<string | null>(null);

  useEffect(() => {
    if (!openMissionMenuKey) return;
    const handleClickOutside = () => setOpenMissionMenuKey(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [openMissionMenuKey]);

  // Effective technicians list (excludes any "Non assigné" placeholder and includes any real technician assigned on active tours)
  const effectiveTechniciansList = useMemo(() => {
    const map = new Map<string, Member>();
    (techniciansList || []).forEach((t) => {
      if (!t || !t.name) return;
      const clean = getCleanTechName(t.name);
      if (!clean) return;
      const key = normalizeName(clean);
      if (key && !map.has(key)) {
        map.set(key, { ...t, name: clean });
      }
    });

    (localTours || []).forEach((tour) => {
      if (!tour || isDraftTour(tour)) return;
      const rawTourTech = getCleanTechName(tour.techName || tour.technicien || tour.technicienNom || tour.tech);
      if (rawTourTech) {
        const key = normalizeName(rawTourTech);
        if (key && !map.has(key)) {
          map.set(key, {
            id: `tech-${key}`,
            name: rawTourTech,
            email: tour.techEmail || '',
            role: 'Technicien',
          } as Member);
        }
      } else {
        const tourMissions = Array.isArray(tour.missions || tour.passages) ? (tour.missions || tour.passages) : [];
        for (const m of tourMissions) {
          const mt = getCleanTechName(m?.techName || m?.technicien || m?.assignedTech || m?.technicienNom);
          if (mt) {
            const key = normalizeName(mt);
            if (key && !map.has(key)) {
              map.set(key, {
                id: `tech-${key}`,
                name: mt,
                email: '',
                role: 'Technicien',
              } as Member);
            }
            break;
          }
        }
      }
    });

    return Array.from(map.values());
  }, [techniciansList, localTours]);

  const handleDropItem = useCallback(
    (
      targetTourId: string | undefined,
      targetTechName: string,
      targetTechEmail: string | undefined,
      targetIsoDate: string,
      slot24h: string,
      slotAmPm: string
    ) => {
      if (!draggedItem) return;
      const currentDragged = draggedItem;
      setDraggedItem(null);
      setDragOverTarget(null);

      if (!targetIsoDate || !targetTechName) return;

      if (currentDragged.type === 'event') {
        const { eventId, eventObj } = currentDragged;
        if (!eventId) return;

        setLocalEvents((prevEvents) => {
          const nextEvents = prevEvents.map((evt) => {
            if (String(evt.id) !== String(eventId)) return evt;
            return {
              ...evt,
              techName: targetTechName,
              techEmail: targetTechEmail || evt.techEmail || targetTechName,
              date: targetIsoDate,
              creneau: slotAmPm || slot24h || evt.creneau,
            };
          });

          try {
            const tid = localStorage.getItem('defib_tenant_id') || 'demo';
            localStorage.setItem(`defib_${tid}_spontaneous_events`, JSON.stringify(nextEvents));
            localStorage.setItem('defib_spontaneous_events', JSON.stringify(nextEvents));
            window.dispatchEvent(new Event('defib_spontaneous_events_updated'));
            saveCollectionToFirestore('spontaneous_events', nextEvents).catch(() => {});

            const updatedEvt = nextEvents.find((e) => String(e.id) === String(eventId)) || {
              ...eventObj,
              techName: targetTechName,
              techEmail: targetTechEmail || eventObj.techEmail || targetTechName,
              date: targetIsoDate,
              creneau: slotAmPm || slot24h || eventObj.creneau,
            };
            const parts = targetIsoDate.split('-');
            const dateFr = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : targetIsoDate;
            const sheetUrl = localStorage.getItem(`defib_${tid}_spreadsheet_autres_events`) || '';
            const sessionTok = localStorage.getItem('defib_session_token') || '';
            if (sheetUrl) {
              fetch('/api/sheets/upsert', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(sessionTok ? { 'x-defibeo-session': sessionTok } : {}),
                  'x-defibeo-tenant': tid,
                },
                body: JSON.stringify({
                  tenantId: tid,
                  type: 'autresEvents',
                  spreadsheetUrl: sheetUrl,
                  records: [
                    {
                      ...updatedEvt,
                      techEmail: updatedEvt.techEmail || targetTechName,
                      date: dateFr,
                      'Email (technicien).': updatedEvt.techEmail || targetTechName,
                      'Date.': dateFr,
                      'Créneau.': updatedEvt.creneau,
                      'Intitulé.': updatedEvt.intitule || '',
                      'Commentaire.': updatedEvt.commentaire || '',
                    },
                  ],
                }),
              }).catch(() => {});
            }
          } catch (_) {}

          if (onUpdateSpontaneousEvents) {
            onUpdateSpontaneousEvents(nextEvents);
          }
          return nextEvents;
        });
        return;
      }

      // Mission drop (supports inter-tour, inter-technician, day change, and slot change)
      const { missionId, sourceTourId, missionObj } = currentDragged;
      if (!missionId) return;

      setLocalTours((prevTours) => {
        let movedMission: any = null;
        for (const t of prevTours) {
          if (String(t.id) === String(sourceTourId)) {
            const list = Array.isArray(t.missions) ? t.missions : Array.isArray(t.passages) ? t.passages : [];
            const found = list.find((m: any) => String(m.id) === String(missionId));
            if (found) {
              movedMission = { ...found };
              break;
            }
          }
        }
        if (!movedMission && missionObj) {
          movedMission = { ...missionObj };
        }
        if (!movedMission) return prevTours;

        // Resolve target tour ID:
        // Must be an existing non-draft tour assigned to targetTechName that covers targetIsoDate
        let resolvedTargetTourId = targetTourId || '';
        const normTargetTech = normalizeName(targetTechName);

        const isTourCoveringDateForTech = (t: any, checkTourId?: string) => {
          if (!t || isDraftTour(t)) return false;
          if (checkTourId && String(t.id) !== String(checkTourId)) return false;
          const tourMissions = Array.isArray(t.missions || t.passages) ? (t.missions || t.passages) : [];
          let cleanT = getCleanTechName(t.techName || t.technicien || t.technicienNom || t.tech);
          if (!cleanT) {
            for (const m of tourMissions) {
              const mt = getCleanTechName(m?.techName || m?.technicien || m?.assignedTech || m?.technicienNom);
              if (mt) {
                cleanT = mt;
                break;
              }
            }
          }
          const tEmailLower = String(t.techEmail || '').trim().toLowerCase();
          const targetEmailLower = String(targetTechEmail || '').trim().toLowerCase();
          const techMatches =
            (cleanT && normalizeName(cleanT) === normTargetTech) ||
            (tEmailLower && targetEmailLower && tEmailLower === targetEmailLower);
          if (!techMatches) return false;

          const rawStart = t.startDate !== 'A trier' && t.startDate !== 'a-trier' ? t.startDate : null;
          let startIso = toIsoDateStr(rawStart);
          let endIso = startIso;
          tourMissions.forEach((m: any) => {
            if (!m) return;
            const mStatus = String(m.status || '').trim().toLowerCase();
            if (mStatus === 'brouillon' || mStatus === 'draft') return;
            const mIso = getMissionIsoDate(m) || startIso;
            if (mIso) {
              if (!startIso || mIso < startIso) startIso = mIso;
              if (!endIso || mIso > endIso) endIso = mIso;
            }
          });
          if (!startIso) return false;
          if (!endIso) endIso = startIso;
          return targetIsoDate >= startIso && targetIsoDate <= endIso;
        };

        if (resolvedTargetTourId) {
          const explicitTour = prevTours.find((t) => isTourCoveringDateForTech(t, resolvedTargetTourId));
          if (!explicitTour) {
            resolvedTargetTourId = '';
          }
        }

        if (!resolvedTargetTourId) {
          const matchingTechTour = prevTours.find((t) => isTourCoveringDateForTech(t));
          if (matchingTechTour) {
            resolvedTargetTourId = String(matchingTechTour.id);
          }
        }

        // Do not allow dropping a mission on a day/technician without an existing tour covering that date
        if (!resolvedTargetTourId) {
          return prevTours;
        }

        const targetTourObj = prevTours.find((t) => String(t.id) === String(resolvedTargetTourId));
        const targetTourIdent = targetTourObj?.tourIdentifiant || targetTourObj?.id || resolvedTargetTourId;

        delete movedMission.resolvedIsoDate;
        const effectiveSlot = normalizeToSystemSlot(
          slotAmPm || slot24h || movedMission.estimatedSlot || movedMission.creneau || '9:00am'
        );

        const updatedMission = {
          ...movedMission,
          estimatedDate: targetIsoDate,
          date: targetIsoDate,
          estimatedSlot: effectiveSlot,
          creneau: effectiveSlot,
          time: effectiveSlot,
          techName: targetTechName,
          technicien: targetTechName,
          tourIdentifiant: targetTourIdent,
          tourId: resolvedTargetTourId,
          isManualDate: true,
          isManualSlot: true,
        };

        const nextTours = prevTours.map((t) => {
          const isSource = String(t.id) === String(sourceTourId);
          const isTarget = String(t.id) === String(resolvedTargetTourId);
          const listKey = Array.isArray(t.missions) ? 'missions' : Array.isArray(t.passages) ? 'passages' : 'missions';
          const currentList: any[] = Array.isArray(t[listKey]) ? t[listKey] : [];

          if (isSource && isTarget) {
            const nextList = currentList.map((m: any) =>
              String(m.id) === String(missionId) ? updatedMission : m
            );
            return {
              ...t,
              techName: getCleanTechName(t.techName) || targetTechName,
              [listKey]: nextList,
            };
          }
          if (isSource) {
            const nextList = currentList.filter((m: any) => String(m.id) !== String(missionId));
            return { ...t, [listKey]: nextList };
          }
          if (isTarget) {
            const nextList = [...currentList.filter((m: any) => String(m.id) !== String(missionId)), updatedMission];
            return {
              ...t,
              techName: getCleanTechName(t.techName) || targetTechName,
              [listKey]: nextList,
            };
          }
          return t;
        });

        try {
          const tid = localStorage.getItem('defib_tenant_id') || 'demo';
          localStorage.setItem(`defib_${tid}_fsm_tours`, JSON.stringify(nextTours));
          localStorage.setItem('defib_fsm_tours', JSON.stringify(nextTours));
          saveCollectionToFirestore('fsm_tours', nextTours, tid).catch(() => {});
        } catch (_) {}

        if (onUpdateTours) {
          onUpdateTours(nextTours);
        }
        return nextTours;
      });
    },
    [draggedItem, onUpdateTours, onUpdateSpontaneousEvents]
  );

  // Sync with initial props
  useEffect(() => {
    if (initialTours) setLocalTours(initialTours);
  }, [initialTours]);

  useEffect(() => {
    if (initialEvents) setLocalEvents(initialEvents);
  }, [initialEvents]);

  useEffect(() => {
    if (typeof initialMonth === 'number') setCurrentMonth(initialMonth);
    if (typeof initialYear === 'number') setCurrentYear(initialYear);
  }, [initialMonth, initialYear, isOpen]);

  // Actualiser function without full reload
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const tid = localStorage.getItem('defib_tenant_id') || 'demo';

      // 1. Refresh Tours from local storage
      const savedTours = localStorage.getItem(`defib_${tid}_fsm_tours`) || localStorage.getItem('defib_fsm_tours');
      if (savedTours) {
        try {
          const parsed = JSON.parse(savedTours);
          if (Array.isArray(parsed)) setLocalTours(parsed);
        } catch (_) {}
      }

      // 2. Refresh Spontaneous Events from local storage & firestore
      const savedEvents = localStorage.getItem(`defib_${tid}_spontaneous_events`) || localStorage.getItem('defib_spontaneous_events');
      if (savedEvents) {
        try {
          const parsedEvts = JSON.parse(savedEvents);
          if (Array.isArray(parsedEvts)) setLocalEvents(parsedEvts);
        } catch (_) {}
      }

      try {
        const remoteEvts = await fetchCollectionFromFirestore<SpontaneousEvent[]>('spontaneous_events');
        if (remoteEvts && Array.isArray(remoteEvts)) {
          setLocalEvents(remoteEvts);
          localStorage.setItem(`defib_${tid}_spontaneous_events`, JSON.stringify(remoteEvts));
          if (onUpdateSpontaneousEvents) onUpdateSpontaneousEvents(remoteEvts);
        }
      } catch (_) {}

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      setLastRefreshedText(`Actualisé à ${timeStr}`);
      setTimeout(() => setLastRefreshedText(''), 3500);
    } finally {
      setIsRefreshing(false);
    }
  }, [onUpdateSpontaneousEvents]);

  // Month navigation handlers
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft);
  };

  // Mouse drag-to-scroll support for horizontal panning
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea, [data-interactive="true"]')) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    isDraggingRef.current = true;
    startXRef.current = e.pageX - container.offsetLeft;
    scrollLeftRef.current = container.scrollLeft;
    container.style.cursor = 'grabbing';
    container.style.userSelect = 'none';
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    e.preventDefault();
    const x = e.pageX - container.offsetLeft;
    const walk = x - startXRef.current;
    container.scrollLeft = scrollLeftRef.current - walk;
    setScrollLeft(container.scrollLeft);
  };

  const handleMouseUpOrLeave = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const container = scrollContainerRef.current;
    if (container) {
      container.style.cursor = 'default';
      container.style.removeProperty('user-select');
    }
  };

  const scrollToToday = useCallback((smooth = true) => {
    setTimeout(() => {
      const container = scrollContainerRef.current;
      const todayEl = document.getElementById("extended-planning-today-col");
      if (container && todayEl) {
        const cursorOffset = todayEl.offsetLeft + (todayEl.offsetWidth * (todayCursorPercent / 100));
        const targetScrollLeft = cursorOffset - (container.clientWidth / 2);
        const finalLeft = Math.max(0, targetScrollLeft);
        container.scrollTo({
          left: finalLeft,
          behavior: smooth ? "smooth" : "auto"
        });
        setScrollLeft(finalLeft);
      }
    }, 60);
  }, [todayCursorPercent]);

  useEffect(() => {
    if (isOpen && currentMonth === today.getMonth() && currentYear === today.getFullYear()) {
      scrollToToday(false);
    }
  }, [isOpen, currentMonth, currentYear, scrollToToday, today]);

  const handleCurrentMonth = () => {
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
    scrollToToday(true);
  };

  // Days list for the viewed month
  const daysInMonth = useMemo(() => {
    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
    const list = [];
    for (let day = 1; day <= totalDays; day++) {
      const dateObj = new Date(currentYear, currentMonth, day);
      const isoDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeekNum = dateObj.getDay();
      const dayShort = DAY_NAMES_SHORT_FR[dayOfWeekNum];
      const isWeekend = dayOfWeekNum === 0 || dayOfWeekNum === 6;
      const isToday =
        dateObj.getFullYear() === today.getFullYear() &&
        dateObj.getMonth() === today.getMonth() &&
        dateObj.getDate() === today.getDate();
      const weekNum = getISOWeekNumber(dateObj);

      list.push({
        day,
        dateObj,
        isoDate,
        dayShort,
        isWeekend,
        isToday,
        weekNum
      });
    }
    return list;
  }, [currentYear, currentMonth, today]);

  // Weeks breakdown
  const weeksGroup = useMemo(() => {
    const groups: { weekNum: number; count: number }[] = [];
    daysInMonth.forEach(d => {
      const last = groups[groups.length - 1];
      if (last && last.weekNum === d.weekNum) {
        last.count++;
      } else {
        groups.push({ weekNum: d.weekNum, count: 1 });
      }
    });
    return groups;
  }, [daysInMonth]);

  // Helpers to retrieve values for mission details
  const getMissionDetails = useCallback((mission: any) => {
    if (!mission) {
      return {
        creneau: '--:--',
        identifiant: 'NC',
        clientName: 'NC',
        siteName: '',
        locationStr: '',
        villePostcode: 'NC',
        reasons: 'Maintenance',
        isDefib: true
      };
    }

    const defib = defibrillateurs.find(
      (d: any) =>
        d && (
          d.identifiant === mission.defibIdentifiant ||
          d.id === mission.defibIdentifiant ||
          (mission.identifiant && d.identifiant === mission.identifiant) ||
          (mission.defibId && d.id === mission.defibId)
        )
    );
    const other = otherEquipments.find(
      (o: any) =>
        o && (
          o.identifiant === mission.defibIdentifiant ||
          o.id === mission.defibIdentifiant ||
          (mission.identifiant && o.identifiant === mission.identifiant) ||
          (mission.defibId && o.id === mission.defibId)
        )
    );
    const clientObj = clients.find(
      c =>
        c && (
          c.id === mission.clientId ||
          c.id === defib?.clientId ||
          c.id === other?.clientId ||
          (c.denomination &&
            (mission.clientDenomination || mission.clientName || mission.client) &&
            String(c.denomination).toLowerCase() === String(mission.clientDenomination || mission.clientName || mission.client).toLowerCase())
        )
    );

    const creneau =
      mission.estimatedSlot ||
      mission.creneau ||
      mission.slot ||
      mission.creneauHoraire ||
      mission.estimatedTime ||
      mission.time ||
      '--:--';

    const identifiant = (() => {
      if (mission.formationId) return String(mission.formationId);
      if (mission.defibIdentifiant && mission.defibIdentifiant !== 'Formation') return String(mission.defibIdentifiant);
      if (mission.identifiant && !String(mission.identifiant).startsWith('fsm-m-')) return String(mission.identifiant);
      if (defib?.identifiant) return String(defib.identifiant);
      if (other?.identifiant) return String(other.identifiant);
      if (mission.defibId) return String(mission.defibId);
      if (mission.interventionReference) return String(mission.interventionReference);
      return 'NC';
    })();

    const clientName =
      mission.clientDenomination ||
      mission.clientName ||
      mission.client ||
      clientObj?.denomination ||
      defib?.client ||
      defib?.exploitant ||
      defib?.nomPrenomSite ||
      other?.client ||
      'NC';

    const mCity =
      mission.ville ||
      defib?.ville ||
      other?.ville ||
      clientObj?.ville ||
      '';
    const mPostcode =
      mission.cp ||
      mission.codePostal ||
      defib?.cp ||
      defib?.codePostal ||
      other?.codePostal ||
      other?.cp ||
      clientObj?.codePostal ||
      clientObj?.cp ||
      '';
    const villePostcode = [mCity, mPostcode].filter(Boolean).join(' ') || 'NC';

    const reasons =
      Array.isArray(mission.reasons) && mission.reasons.length > 0
        ? mission.reasons.join(', ')
        : mission.reason ||
          mission.motif ||
          mission.typePrestation ||
          mission.equipmentType ||
          'Maintenance';

    const siteName = (() => {
      let raw = '';
      if (defib?.nomSite) raw = defib.nomSite;
      else if (other?.nomPrenomSite || other?.nomSite) raw = other.nomPrenomSite || other.nomSite;
      else if (mission.site || mission.siteName) raw = mission.site || mission.siteName;
      if (
        !raw ||
        raw === 'Représentant Standard' ||
        raw === 'Représentant standard' ||
        raw === 'Non renseigné' ||
        raw === 'Nom du Site'
      ) {
        return '';
      }
      return raw;
    })();

    const locationStr = (() => {
      if (mission.ville) {
        return `${mission.ville}${mission.codePostal ? ` (${mission.codePostal})` : ''}`;
      }
      if (defib) {
        const parts = [defib.ville, defib.cp ? `(${defib.cp})` : ''].filter(Boolean);
        if (parts.length > 0) return parts.join(' ');
      }
      if (other) {
        const parts = [other.ville, other.codePostal ? `(${other.codePostal})` : ''].filter(Boolean);
        if (parts.length > 0) return parts.join(' ');
      }
      if (mission.address) return String(mission.address);
      if (clientObj?.ville) {
        return `${clientObj.ville}${clientObj.codePostal ? ` (${clientObj.codePostal})` : ''}`;
      }
      return '';
    })();

    const eqType = String(mission.equipmentType || '').toLowerCase();
    const isFormation = eqType.includes('formation') || Boolean(mission.formationId);
    let isDefib = true;
    if (isFormation) {
      isDefib = true;
    } else if (eqType.includes('défibrillateur') || eqType.includes('defibrillateur')) {
      isDefib = true;
    } else if (other) {
      isDefib = false;
    } else if (eqType && !eqType.includes('défibrillateur') && !eqType.includes('defibrillateur')) {
      isDefib = false;
    }

    return {
      creneau,
      identifiant,
      clientName,
      siteName,
      locationStr,
      villePostcode,
      reasons,
      isDefib
    };
  }, [clients, defibrillateurs, otherEquipments]);

  // Technicians dataset grouped (aligned with vertical view in PlanningTab.tsx)
  const techniciansData = useMemo(() => {
    const monthStartIso = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
    const lastDayNum = new Date(currentYear, currentMonth + 1, 0).getDate();
    const monthEndIso = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;

    return effectiveTechniciansList.map((tech) => {
      const normTech = normalizeName(tech.name);
      const techEmailLower = String(tech.email || '').trim().toLowerCase();

      // 1. Find Tournées assigned to this tech that intersect this month
      const techTours: any[] = [];

      localTours.forEach((tour, tIdx) => {
        if (!tour || isDraftTour(tour)) return;

        const tourMissions = Array.isArray(tour.missions || tour.passages) ? (tour.missions || tour.passages) : [];

        // Resolve the technician for this tour (ignoring "Non assigné" placeholders)
        let cleanTourTech = getCleanTechName(tour.techName || tour.technicien || tour.technicienNom || tour.tech);
        if (!cleanTourTech) {
          for (const m of tourMissions) {
            const mt = getCleanTechName(m?.techName || m?.technicien || m?.assignedTech || m?.technicienNom);
            if (mt) {
              cleanTourTech = mt;
              break;
            }
          }
        }

        const normTourTech = normalizeName(cleanTourTech);
        const tourEmailLower = String(tour.techEmail || '').trim().toLowerCase();

        const isTourAssignedToThisTech =
          (normTourTech && normTourTech === normTech) ||
          (techEmailLower && tourEmailLower && techEmailLower === tourEmailLower);

        if (!isTourAssignedToThisTech) {
          return;
        }

        // Determine date range of this tournée
        const rawStart = tour.startDate !== 'A trier' && tour.startDate !== 'a-trier' ? tour.startDate : null;
        let startIso = toIsoDateStr(rawStart);
        let endIso = startIso;

        // Include all non-draft missions of this tour (matching vertical view behavior)
        const validMissionsForTech: any[] = [];
        tourMissions.forEach((m: any) => {
          if (!m) return;
          const mStatus = String(m.status || '').trim().toLowerCase();
          if (mStatus === 'brouillon' || mStatus === 'draft') return;

          const mIso = getMissionIsoDate(m) || startIso;
          if (mIso) {
            if (!startIso || mIso < startIso) startIso = mIso;
            if (!endIso || mIso > endIso) endIso = mIso;
            validMissionsForTech.push({ ...m, resolvedIsoDate: mIso });
          }
        });

        if (!startIso) return;
        if (!endIso) endIso = startIso;

        // Intersects current month?
        if (endIso < monthStartIso || startIso > monthEndIso) {
          return;
        }

        techTours.push({
          tourId: tour.id || `tour-${tIdx}`,
          title: tour.title || tour.name || `Tournée #${tIdx + 1}`,
          startIso,
          endIso,
          rawTour: tour,
          missions: validMissionsForTech
        });
      });

      // 2. Find Spontaneous events for this tech in this month (matching by name or email)
      const techSpontaneous = localEvents.filter(evt => {
        if (!evt) return false;
        const evtIso = toIsoDateStr(evt.date);
        if (!evtIso || evtIso < monthStartIso || evtIso > monthEndIso) return false;

        const normEvtTech = normalizeName(evt.techName);
        if (normEvtTech && normEvtTech === normTech) return true;

        const evtEmailLower = String(
          evt.techEmail || (evt.techName?.includes('@') ? evt.techName : '') || ''
        )
          .trim()
          .toLowerCase();
        if (techEmailLower && evtEmailLower && techEmailLower === evtEmailLower) return true;

        return false;
      });

      return {
        tech,
        normTech,
        tours: techTours,
        spontaneousEvents: techSpontaneous
      };
    });
  }, [effectiveTechniciansList, localTours, localEvents, currentYear, currentMonth]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100000] bg-white flex flex-col overflow-hidden text-neutral-900 select-none animate-fadeIn"
      style={{
        fontFamily: "'DefibeoMain', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      }}
    >
      {/* Floating slot badge above cursor during drag & drop */}
      {draggedItem && dragOverTarget && (
        <div
          className="fixed pointer-events-none z-[999999] inline-flex items-center justify-center px-4 py-1.5 rounded-full font-bold shadow-lg select-none"
          style={{
            left: `${dragOverTarget.clientX + 12}px`,
            top: `${Math.max(8, dragOverTarget.clientY - 40)}px`,
            backgroundColor: 'rgb(210, 45, 11)',
            color: '#FFFFFF',
            fontSize: '18px',
            fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
            opacity: 1,
          }}
        >
          {dragOverTarget.slotAmPm}
        </div>
      )}

      {/* Header Bar */}
      <div
        className="px-3 py-2.5 sm:px-4 flex flex-wrap items-center justify-between gap-3 shrink-0"
        style={{ backgroundColor: '#365cfe' }}
      >
        {/* Left: Month 3-part Toggle + Maintenant pill */}
        <div className="flex flex-wrap items-center gap-2.5">
          {(() => {
            const prevMonthIdx = currentMonth === 0 ? 11 : currentMonth - 1;
            const prevMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
            const nextMonthIdx = currentMonth === 11 ? 0 : currentMonth + 1;
            const nextMonthYear = currentMonth === 11 ? currentYear + 1 : currentYear;

            return (
              <div
                className="inline-flex items-center gap-1.5 p-1.5"
                style={{
                  backgroundColor: '#4f6dff',
                  borderRadius: '10px',
                }}
              >
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="transition-opacity cursor-pointer hover:opacity-85 whitespace-nowrap"
                  style={{
                    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                    fontSize: '18px',
                    fontWeight: 400,
                    borderRadius: '8px',
                    padding: '10px 18px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: '#ffffff',
                  }}
                  title="Mois précédent"
                >
                  {MONTH_NAMES_FR[prevMonthIdx]} {prevMonthYear}
                </button>

                <button
                  type="button"
                  className="cursor-default whitespace-nowrap select-none"
                  style={{
                    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                    fontSize: '18px',
                    fontWeight: 400,
                    borderRadius: '8px',
                    padding: '10px 20px',
                    border: 'none',
                    backgroundColor: '#1c0244',
                    color: '#ffffff',
                  }}
                >
                  {MONTH_NAMES_FR[currentMonth]} {currentYear}
                </button>

                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="transition-opacity cursor-pointer hover:opacity-85 whitespace-nowrap"
                  style={{
                    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                    fontSize: '18px',
                    fontWeight: 400,
                    borderRadius: '8px',
                    padding: '10px 18px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: '#ffffff',
                  }}
                  title="Mois suivant"
                >
                  {MONTH_NAMES_FR[nextMonthIdx]} {nextMonthYear}
                </button>
              </div>
            );
          })()}

          <button
            type="button"
            onClick={handleCurrentMonth}
            className="transition-opacity cursor-pointer hover:opacity-90 rounded-full whitespace-nowrap"
            style={{
              fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
              fontSize: '18px',
              fontWeight: 400,
              borderRadius: '9999px',
              padding: '10px 24px',
              border: 'none',
              backgroundColor: '#ffffff',
              color: '#000000',
            }}
            title="Revenir au mois en cours"
          >
            Maintenant
          </button>
        </div>

        {/* Right: Actualiser & Fermer */}
        <div className="flex items-center gap-2.5">
          {lastRefreshedText && (
            <span className="text-[15px] font-medium text-white animate-fadeIn select-none mr-1">
              {lastRefreshedText}
            </span>
          )}

          <button
            type="button"
            disabled={isRefreshing}
            onClick={handleRefresh}
            className="transition-opacity cursor-pointer disabled:opacity-50 hover:opacity-90 whitespace-nowrap"
            style={{
              fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
              fontSize: '18px',
              fontWeight: 400,
              borderRadius: '8px',
              padding: '10px 20px',
              border: 'none',
              backgroundColor: '#4f6dff',
              color: '#ffffff',
            }}
            title="Recharger les données sans recharger la page"
          >
            {isRefreshing ? 'Actualisation...' : 'Actualiser'}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="transition-opacity cursor-pointer hover:opacity-90 whitespace-nowrap"
            style={{
              fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
              fontSize: '18px',
              fontWeight: 400,
              borderRadius: '8px',
              padding: '10px 20px',
              border: 'none',
              color: '#ffffff',
              backgroundColor: 'rgb(210, 45, 11)',
            }}
          >
            Fermer
          </button>
        </div>
      </div>

      {/* Sub-header / Legend Bar */}
      <div className="bg-neutral-50 border-b border-neutral-200 px-4 py-2 sm:px-6 flex flex-wrap items-center gap-5 text-xs font-medium shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-xs inline-block shrink-0" style={{ backgroundColor: 'rgb(230, 197, 255)' }} />
          <span className="text-neutral-800 font-semibold">Mission planifiée</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-xs bg-[#9333ea] inline-block shrink-0" />
          <span className="text-neutral-800 font-semibold">Événement spontané</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-1.5 rounded-full bg-[#2e54ff] inline-block shrink-0" />
          <span className="text-neutral-800 font-semibold">Période de tournée</span>
        </div>
      </div>

      {/* Main Matrix Gantt Container */}
      <div 
        ref={scrollContainerRef} 
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        className="flex-1 overflow-auto bg-white"
      >
        <div className="inline-block min-w-full align-top">
          {/* Timeline Table Grid */}
          <table className="border-separate border-spacing-0 text-left" style={{ minWidth: `${daysInMonth.length * 200}px`, width: '100%' }}>
            {/* Header: Weeks and Days (No left header column, day columns take full width) */}
            <thead className="sticky top-0 z-30 bg-white shadow-xs">
              {/* Row 1: Weeks */}
              <tr className="border-b border-neutral-200 bg-neutral-100 text-neutral-600 text-xs font-semibold">
                {weeksGroup.map((w, idx) => (
                  <th
                    key={`week-${w.weekNum}-${idx}`}
                    colSpan={w.count}
                    className="border-r border-neutral-300 px-2 py-1.5 text-center font-bold text-neutral-700 bg-neutral-100/95 text-xs"
                  >
                    <span
                      className="inline-flex items-center justify-center px-4 py-1.5 rounded-full font-bold select-none"
                      style={{
                        backgroundColor: 'rgb(61, 220, 132)',
                        color: 'rgb(19, 100, 55)',
                        fontSize: '18px',
                        fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                      }}
                    >
                      S{w.weekNum}
                    </span>
                  </th>
                ))}
              </tr>

              {/* Row 2: Days (1 to 31) */}
              <tr className="border-b border-neutral-300 bg-white text-neutral-800 text-xs">
                {daysInMonth.map((d) => {
                  const holidayName = holidaysMap[d.isoDate];
                  return (
                    <th
                      key={`day-header-${d.isoDate}`}
                      id={d.isToday ? "extended-planning-today-col" : undefined}
                      className={`relative border-r border-neutral-200 px-1 py-1.5 text-center font-semibold select-none w-[200px] min-w-[200px] max-w-[200px] align-bottom ${
                        d.isToday
                          ? 'bg-pink-100/80 text-[#2e54ff] border-b-2 border-b-[#2e54ff]'
                          : d.isWeekend
                          ? 'bg-neutral-100/60 text-neutral-400'
                          : 'bg-white text-neutral-700'
                      }`}
                    >
                      {holidayName && (
                        <div className="flex justify-center mb-1">
                          <span
                            className="px-2.5 py-0.5 rounded-full text-white font-medium text-[11px] inline-flex items-center max-w-full min-w-0 select-none"
                            style={{ backgroundColor: 'rgb(210, 45, 11)' }}
                            title={`Jour férié : ${holidayName}`}
                          >
                            <span className="shrink-0 whitespace-nowrap">Jour férié :&nbsp;</span>
                            <span className="truncate whitespace-nowrap">{holidayName}</span>
                          </span>
                        </div>
                      )}
                      <div className="text-[11px] uppercase tracking-wider">{d.dayShort}</div>
                      <div className={`text-sm font-bold ${d.isToday ? 'text-[#2e54ff]' : 'text-neutral-900'}`}>
                        {d.day}
                      </div>

                      {/* Red Pin for current time cursor on today's header */}
                      {d.isToday && (
                        <div
                          className="absolute bottom-0 w-2.5 h-2.5 -mb-1 -ml-1 rounded-full bg-[#ef4444] z-30 shadow-xs pointer-events-none"
                          style={{ left: `${todayCursorPercent}%` }}
                          title={`Curseur temps réel : ${String(currentTime.getHours()).padStart(2, '0')}:${String(currentTime.getMinutes()).padStart(2, '0')}`}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* Body: Technicians lanes */}
            <tbody className="divide-y divide-neutral-200 text-xs">
              {techniciansData.length === 0 && (
                <tr>
                  <td colSpan={daysInMonth.length} className="py-12 text-center text-neutral-500 font-medium text-sm">
                    Aucun technicien trouvé pour ce tenant.
                  </td>
                </tr>
              )}

              {techniciansData.map(({ tech, tours, spontaneousEvents: techEvts }, techIdx) => {
                const hasActivity = tours.length > 0 || techEvts.length > 0;

                return (
                  <React.Fragment key={`tech-row-group-${tech.name}-${techIdx}`}>
                    {/* TECHNICIAN HORIZONTAL INTERCALAIRE ROW */}
                    <tr className="bg-neutral-100 border-t-2 border-b border-neutral-300">
                      <td
                        colSpan={daysInMonth.length}
                        className="p-0 font-bold text-sm text-neutral-900 bg-neutral-100 select-none overflow-hidden"
                        style={{ backgroundColor: '#f5f5f5' }}
                      >
                        <div 
                          className="tech-intercalaire-label inline-flex items-center z-20"
                          style={{
                            transform: `translateX(${scrollLeft}px)`,
                            willChange: 'transform',
                            padding: '8px 16px',
                            backgroundColor: '#f5f5f5',
                            width: 'max-content'
                          }}
                        >
                          <span className="text-base text-neutral-950 font-bold tracking-tight">{tech.name}</span>
                        </div>
                      </td>
                    </tr>

                    {/* IF NO ACTIVITY THIS MONTH: Blank droppable row */}
                    {!hasActivity && (
                      <tr className="border-b border-neutral-200">
                        {daysInMonth.map((d) => {
                          const emptyRowKey = `empty-${tech.name}`;
                          const canDropOnEmptyRow = Boolean(draggedItem && draggedItem.type === 'event');
                          const isDropTarget =
                            canDropOnEmptyRow &&
                            dragOverTarget?.rowKey === emptyRowKey &&
                            dragOverTarget?.isoDate === d.isoDate &&
                            dragOverTarget?.techName === tech.name;

                          return (
                            <td
                              key={`empty-${tech.name}-${d.isoDate}`}
                              onDragOver={(e) => {
                                if (!draggedItem || draggedItem.type === 'mission') {
                                  if (dragOverTarget) setDragOverTarget(null);
                                  return;
                                }
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                const slotInfo = computeSlotFromDragEvent(e);
                                setDragOverTarget({
                                  rowKey: emptyRowKey,
                                  isoDate: d.isoDate,
                                  techName: tech.name,
                                  techEmail: tech.email,
                                  ...slotInfo,
                                });
                              }}
                              onDragLeave={(e) => {
                                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                                if (
                                  dragOverTarget?.rowKey === emptyRowKey &&
                                  dragOverTarget?.isoDate === d.isoDate &&
                                  dragOverTarget?.techName === tech.name
                                ) {
                                  setDragOverTarget(null);
                                }
                              }}
                              onDrop={(e) => {
                                if (!draggedItem || draggedItem.type === 'mission') return;
                                e.preventDefault();
                                e.stopPropagation();
                                const slotInfo = computeSlotFromDragEvent(e);
                                handleDropItem(
                                  undefined,
                                  tech.name,
                                  tech.email,
                                  d.isoDate,
                                  slotInfo.slot24h,
                                  slotInfo.slotAmPm
                                );
                              }}
                              className={`relative border-r border-neutral-200 p-1 w-[200px] min-w-[200px] max-w-[200px] min-h-[42px] transition-colors ${
                                isDropTarget
                                  ? 'bg-blue-100/70 ring-2 ring-inset ring-[#2e54ff]'
                                  : d.isToday
                                  ? 'bg-pink-50/30'
                                  : d.isWeekend
                                  ? 'bg-neutral-100/30'
                                  : 'bg-white'
                              }`}
                            >
                              {isDropTarget && dragOverTarget && (
                                <div className="pointer-events-none relative z-50 flex items-center justify-center mb-1">
                                  <span
                                    className="inline-flex items-center justify-center px-4 py-1.5 rounded-full font-bold shadow-md"
                                    style={{
                                      backgroundColor: 'rgb(210, 45, 11)',
                                      color: '#FFFFFF',
                                      fontSize: '18px',
                                      fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                                      opacity: 1,
                                    }}
                                  >
                                    {dragOverTarget.slotAmPm}
                                  </span>
                                </div>
                              )}
                              {d.isToday && (
                                <div
                                  className="absolute top-0 bottom-0 pointer-events-none z-20 w-[2px] bg-[#ef4444]"
                                  style={{ left: `${todayCursorPercent}%` }}
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    )}

                    {/* TOURNÉES & MISSIONS */}
                    {tours.map((tItem, tIdx) => {
                      const tourRowKey = `tour-${tItem.tourId}`;

                      return (
                        <tr
                          key={`tour-row-${tech.name}-${tItem.tourId}-${tIdx}`}
                          className="border-b border-neutral-200 hover:bg-neutral-50/30 transition-colors"
                        >
                          {/* Days Columns for this Tournée (Full Width) */}
                          {daysInMonth.map((d) => {
                            const isWithinTour = d.isoDate >= tItem.startIso && d.isoDate <= tItem.endIso;
                            const dayMissions = tItem.missions.filter((m: any) => m.resolvedIsoDate === d.isoDate);
                            const canDropInTourCell =
                              Boolean(draggedItem) && (draggedItem?.type !== 'mission' || isWithinTour);
                            const isDropTarget =
                              canDropInTourCell &&
                              dragOverTarget?.rowKey === tourRowKey &&
                              dragOverTarget?.isoDate === d.isoDate &&
                              dragOverTarget?.techName === tech.name;

                            return (
                              <td
                                key={`tour-day-${tItem.tourId}-${d.isoDate}`}
                                onDragOver={(e) => {
                                  if (!draggedItem) return;
                                  if (draggedItem.type === 'mission' && !isWithinTour) {
                                    if (dragOverTarget) setDragOverTarget(null);
                                    return;
                                  }
                                  e.preventDefault();
                                  e.dataTransfer.dropEffect = 'move';
                                  const slotInfo = computeSlotFromDragEvent(e);
                                  setDragOverTarget({
                                    rowKey: tourRowKey,
                                    tourId: tItem.tourId,
                                    isoDate: d.isoDate,
                                    techName: tech.name,
                                    techEmail: tech.email,
                                    ...slotInfo,
                                  });
                                }}
                                onDragLeave={(e) => {
                                  if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                                  if (
                                    dragOverTarget?.rowKey === tourRowKey &&
                                    dragOverTarget?.isoDate === d.isoDate &&
                                    dragOverTarget?.techName === tech.name
                                  ) {
                                    setDragOverTarget(null);
                                  }
                                }}
                                onDrop={(e) => {
                                  if (!draggedItem) return;
                                  if (draggedItem.type === 'mission' && !isWithinTour) return;
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const slotInfo = computeSlotFromDragEvent(e);
                                  handleDropItem(
                                    tItem.tourId,
                                    tech.name,
                                    tech.email,
                                    d.isoDate,
                                    slotInfo.slot24h,
                                    slotInfo.slotAmPm
                                  );
                                }}
                                className={`relative border-r border-neutral-200 p-1.5 align-top w-[200px] min-w-[200px] max-w-[200px] transition-colors ${
                                  isDropTarget
                                    ? 'bg-blue-100/70 ring-2 ring-inset ring-[#2e54ff]'
                                    : d.isToday
                                    ? 'bg-pink-50/50'
                                    : isWithinTour
                                    ? 'bg-pink-50/25'
                                    : d.isWeekend
                                    ? 'bg-neutral-100/40'
                                    : 'bg-white'
                                }`}
                              >
                                {/* Vertical red cursor bar advancing by time across the calendar height */}
                                {d.isToday && (
                                  <div
                                    className="absolute top-0 bottom-0 pointer-events-none z-20 w-[2px] bg-[#ef4444]"
                                    style={{ left: `${todayCursorPercent}%` }}
                                  />
                                )}

                                {/* Drop target preview gélule right on top */}
                                {isDropTarget && dragOverTarget && (
                                  <div className="pointer-events-none relative z-50 flex items-center justify-center mb-1.5">
                                    <span
                                      className="inline-flex items-center justify-center px-4 py-1.5 rounded-full font-bold shadow-md"
                                      style={{
                                        backgroundColor: 'rgb(210, 45, 11)',
                                        color: '#FFFFFF',
                                        fontSize: '18px',
                                        fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                                        opacity: 1,
                                      }}
                                    >
                                      {dragOverTarget.slotAmPm}
                                    </span>
                                  </div>
                                )}

                                {/* Tournée barrette: ALWAYS visible if within tour, regardless of missions count */}
                                {isWithinTour && (
                                  <div
                                    className="h-2 w-full rounded-full bg-[#2e54ff]/80 hover:bg-[#2e54ff] transition-colors mb-1.5 cursor-default shrink-0"
                                    title={tItem.title}
                                  />
                                )}

                                {/* Day missions: placed under the barrette with créneau gélule above */}
                                {dayMissions.length > 0 && (
                                  <div className="space-y-2">
                                    {dayMissions.map((m: any, mIdx: number) => {
                                      const details = getMissionDetails(m);
                                      const formattedSlot = formatSlotToAmPm(details.creneau);
                                      const mStatus = String(m.status || m.statut || m.situation || 'À faire').trim() || 'À faire';
                                      const fullMissionText = `Client : ${details.clientName}. Ville : ${details.villePostcode}. Raison(s) : ${details.reasons}. Matériel : ${details.identifiant || 'NC'}.`;
                                      const menuKey = `ext-${tItem.tourId}-${m.id || mIdx}-${d.isoDate}`;
                                      const isMenuOpen = openMissionMenuKey === menuKey;

                                      return (
                                        <div
                                          key={`mission-bar-${m.id || mIdx}`}
                                          data-interactive="true"
                                          draggable
                                          onDragStart={(e) => {
                                            e.stopPropagation();
                                            setOpenMissionMenuKey(null);
                                            setDraggedItem({
                                              type: 'mission',
                                              missionId: String(m.id),
                                              sourceTourId: String(tItem.tourId),
                                              sourceTechName: tech.name,
                                              missionObj: m,
                                            });
                                            e.dataTransfer.effectAllowed = 'move';
                                            try {
                                              e.dataTransfer.setData('text/plain', String(m.id));
                                            } catch (_) {}
                                          }}
                                          onDragEnd={() => {
                                            setDraggedItem(null);
                                            setDragOverTarget(null);
                                          }}
                                          className="relative space-y-1 select-none cursor-grab active:cursor-grabbing"
                                          style={{
                                            opacity: 1,
                                          }}
                                          title={`${fullMissionText} — Glisser-déposer pour changer de jour, de technicien ou de créneau`}
                                        >
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span
                                              className="inline-flex items-center justify-center px-4 py-1.5 rounded-full font-bold"
                                              style={{
                                                backgroundColor: 'rgb(210, 45, 11)',
                                                color: '#FFFFFF',
                                                fontSize: '18px',
                                                fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                                                boxShadow: 'none',
                                                opacity: 1,
                                              }}
                                            >
                                              {isDropTarget && dragOverTarget ? dragOverTarget.slotAmPm : formattedSlot}
                                            </span>
                                            <span
                                              className="inline-flex items-center justify-center px-4 py-1.5 rounded-full font-bold"
                                              style={{
                                                backgroundColor: 'rgb(247, 252, 192)',
                                                color: 'rgb(105, 114, 5)',
                                                fontSize: '18px',
                                                fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                                                boxShadow: 'none',
                                                opacity: 1,
                                              }}
                                            >
                                              {mStatus}
                                            </span>
                                          </div>
                                          <div
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setOpenMissionMenuKey((prev) => (prev === menuKey ? null : menuKey));
                                            }}
                                            className="w-full transition-all shadow-xs hover:brightness-95 whitespace-normal break-words cursor-pointer"
                                            style={{
                                              backgroundColor: 'rgb(230, 197, 255)',
                                              color: 'rgb(89, 22, 144)',
                                              borderRadius: '10px',
                                              padding: '8px 12px',
                                              fontSize: '13px',
                                              fontWeight: 600,
                                              lineHeight: '1.35',
                                              opacity: 1,
                                            }}
                                          >
                                            {fullMissionText}
                                          </div>

                                          {isMenuOpen && (
                                            <div
                                              onClick={(e) => e.stopPropagation()}
                                              className="absolute left-0 top-full mt-1 z-[100] w-max max-w-[260px] bg-white rounded-xl shadow-lg border border-neutral-200 p-1.5 animate-fadeIn"
                                            >
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setOpenMissionMenuKey(null);
                                                  onClose();
                                                  if (onConsultMission) {
                                                    onConsultMission(tItem.rawTour, m);
                                                  } else {
                                                    window.dispatchEvent(
                                                      new CustomEvent('defib_consult_mission', {
                                                        detail: { tour: tItem.rawTour, mission: m },
                                                      })
                                                    );
                                                  }
                                                }}
                                                className="w-full text-left px-3 py-2 rounded-lg text-[14px] font-bold text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer whitespace-nowrap"
                                                style={{ fontFamily: "'DefibeoMain', 'Civilprom', sans-serif" }}
                                              >
                                                Afficher la mission dans la tournée
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}

                    {/* SPONTANEOUS EVENTS ROW (Full Width, no left header, droppable & draggable) */}
                    {techEvts.length > 0 && (
                      <tr className="border-b border-neutral-200 bg-purple-50/15 hover:bg-purple-50/25 transition-colors">
                        {daysInMonth.map((d) => {
                          const matchingEvts = techEvts.filter(e => toIsoDateStr(e.date) === d.isoDate);
                          const matchingTourOnDay = tours.find(t => d.isoDate >= t.startIso && d.isoDate <= t.endIso);
                          const canDropOnSpontCell =
                            Boolean(draggedItem) && (draggedItem?.type !== 'mission' || Boolean(matchingTourOnDay));
                          const spontRowKey = `spont-${tech.name}`;
                          const isDropTarget =
                            canDropOnSpontCell &&
                            dragOverTarget?.rowKey === spontRowKey &&
                            dragOverTarget?.isoDate === d.isoDate &&
                            dragOverTarget?.techName === tech.name;

                          return (
                            <td
                              key={`spont-cell-${tech.name}-${d.isoDate}`}
                              onDragOver={(e) => {
                                if (!draggedItem) return;
                                if (draggedItem.type === 'mission' && !matchingTourOnDay) {
                                  if (dragOverTarget) setDragOverTarget(null);
                                  return;
                                }
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                const slotInfo = computeSlotFromDragEvent(e);
                                setDragOverTarget({
                                  rowKey: spontRowKey,
                                  tourId: matchingTourOnDay?.tourId,
                                  isoDate: d.isoDate,
                                  techName: tech.name,
                                  techEmail: tech.email,
                                  ...slotInfo,
                                });
                              }}
                              onDragLeave={(e) => {
                                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                                if (
                                  dragOverTarget?.rowKey === spontRowKey &&
                                  dragOverTarget?.isoDate === d.isoDate &&
                                  dragOverTarget?.techName === tech.name
                                ) {
                                  setDragOverTarget(null);
                                }
                              }}
                              onDrop={(e) => {
                                if (!draggedItem) return;
                                if (draggedItem.type === 'mission' && !matchingTourOnDay) return;
                                e.preventDefault();
                                e.stopPropagation();
                                const slotInfo = computeSlotFromDragEvent(e);
                                handleDropItem(
                                  matchingTourOnDay?.tourId,
                                  tech.name,
                                  tech.email,
                                  d.isoDate,
                                  slotInfo.slot24h,
                                  slotInfo.slotAmPm
                                );
                              }}
                              className={`relative border-r border-neutral-200 p-1.5 align-top w-[200px] min-w-[200px] max-w-[200px] transition-colors ${
                                isDropTarget
                                  ? 'bg-blue-100/70 ring-2 ring-inset ring-[#2e54ff]'
                                  : d.isToday
                                  ? 'bg-pink-50/50'
                                  : d.isWeekend
                                  ? 'bg-neutral-100/40'
                                  : 'bg-white'
                              }`}
                            >
                              {isDropTarget && dragOverTarget && (
                                <div className="pointer-events-none relative z-50 flex items-center justify-center mb-1.5">
                                  <span
                                    className="inline-flex items-center justify-center px-4 py-1.5 rounded-full font-bold shadow-md"
                                    style={{
                                      backgroundColor: 'rgb(210, 45, 11)',
                                      color: '#FFFFFF',
                                      fontSize: '18px',
                                      fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
                                      opacity: 1,
                                    }}
                                  >
                                    {dragOverTarget.slotAmPm}
                                  </span>
                                </div>
                              )}
                              {/* Red vertical cursor line */}
                              {d.isToday && (
                                <div
                                  className="absolute top-0 bottom-0 pointer-events-none z-20 w-[2px] bg-[#ef4444]"
                                  style={{ left: `${todayCursorPercent}%` }}
                                />
                              )}

                              {matchingEvts.length > 0 && (
                                <div className="space-y-1.5">
                                  {matchingEvts.map((evt) => {
                                    const formattedEvtSlot = formatSlotToAmPm(evt.creneau);
                                    const line1 = [formattedEvtSlot !== '--:--' ? formattedEvtSlot : evt.creneau, 'Spontané']
                                      .filter(Boolean)
                                      .join(' - ');
                                    const line2 = evt.intitule || '';
                                    const line3 = evt.commentaire || '';
                                    const timeOffset = getTimeOffsetPercent(evt.creneau);
                                    const marginLeftPx = Math.round(timeOffset * 40);

                                    return (
                                      <div
                                        key={evt.id}
                                        data-interactive="true"
                                        draggable
                                        onDragStart={(e) => {
                                          e.stopPropagation();
                                          setDraggedItem({
                                            type: 'event',
                                            eventId: String(evt.id),
                                            sourceTechName: tech.name,
                                            eventObj: evt,
                                          });
                                          e.dataTransfer.effectAllowed = 'move';
                                          try {
                                            e.dataTransfer.setData('text/plain', String(evt.id));
                                          } catch (_) {}
                                        }}
                                        onDragEnd={() => {
                                          setDraggedItem(null);
                                          setDragOverTarget(null);
                                        }}
                                        className="w-[150px] max-w-[150px] select-none cursor-grab active:cursor-grabbing overflow-hidden transition-all shadow-xs hover:brightness-95"
                                        style={{
                                          marginLeft: `${marginLeftPx}px`,
                                          backgroundColor: '#9333ea',
                                          borderRadius: '10px',
                                          padding: '8px 12px',
                                          fontSize: '12px',
                                          color: '#fff',
                                          lineHeight: '16px',
                                          opacity: 1,
                                        }}
                                        title={`Événement spontané : ${evt.creneau || 'Horaire libre'} — Glisser-déposer pour changer de jour, de technicien ou de créneau`}
                                      >
                                        <div
                                          className="truncate whitespace-nowrap overflow-hidden text-ellipsis block font-semibold"
                                          style={{ fontSize: '12px', lineHeight: '16px', color: '#fff' }}
                                        >
                                          {line1}
                                        </div>
                                        <div
                                          className="truncate whitespace-nowrap overflow-hidden text-ellipsis block"
                                          style={{ fontSize: '12px', lineHeight: '16px', color: '#fff' }}
                                        >
                                          {line2}
                                        </div>
                                        <div
                                          className="truncate whitespace-nowrap overflow-hidden text-ellipsis block"
                                          style={{ fontSize: '12px', lineHeight: '16px', color: '#fff' }}
                                        >
                                          {line3 || '-'}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
