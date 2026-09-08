import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Member } from '../types';
import { SpontaneousEvent } from './PlanningTab';
import { fetchCollectionFromFirestore } from '../firebase';

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
    const hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
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
  onUpdateSpontaneousEvents
}) => {
  const today = useMemo(() => new Date(), []);
  const [currentMonth, setCurrentMonth] = useState<number>(() => {
    return typeof initialMonth === 'number' ? initialMonth : today.getMonth();
  });
  const [currentYear, setCurrentYear] = useState<number>(() => {
    return typeof initialYear === 'number' ? initialYear : today.getFullYear();
  });

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

  const scrollToToday = useCallback((smooth = true) => {
    setTimeout(() => {
      const container = scrollContainerRef.current;
      const todayEl = document.getElementById("extended-planning-today-col");
      if (container && todayEl) {
        const cursorOffset = todayEl.offsetLeft + (todayEl.offsetWidth * (todayCursorPercent / 100));
        const targetScrollLeft = cursorOffset - (container.clientWidth / 2);
        container.scrollTo({
          left: Math.max(0, targetScrollLeft),
          behavior: smooth ? "smooth" : "auto"
        });
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

  // Helpers to retrieve values for mission 3 lines
  const getMissionDetails = useCallback((mission: any) => {
    if (!mission) {
      return {
        creneau: '',
        identifiant: '',
        clientName: '',
        siteName: '',
        locationStr: '',
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
          (c.denomination && mission.clientDenomination && String(c.denomination).toLowerCase() === String(mission.clientDenomination).toLowerCase())
        )
    );

    // Line 1: Creneau & Identifiant
    const creneau = mission.estimatedSlot || mission.creneau || mission.slot || mission.creneauHoraire || mission.estimatedTime || mission.time || '';
    const identifiant = (() => {
      if (mission.formationId) return String(mission.formationId);
      if (mission.defibIdentifiant && mission.defibIdentifiant !== 'Formation') return String(mission.defibIdentifiant);
      if (mission.identifiant) return String(mission.identifiant);
      if (mission.interventionReference) return String(mission.interventionReference);
      if (defib?.identifiant) return String(defib.identifiant);
      if (other?.identifiant) return String(other.identifiant);
      return '';
    })();

    // Line 2: Client & Site
    const clientName = (
      mission.clientDenomination ||
      mission.client ||
      clientObj?.denomination ||
      mission.clientName ||
      defib?.exploitant ||
      defib?.nomPrenomSite ||
      ''
    );

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

    // Line 3: Localisation
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

    // Determine if mission is Défibrillateur or Autre Matériel
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
      isDefib
    };
  }, [clients, defibrillateurs, otherEquipments]);

  // Technicians dataset grouped
  const techniciansData = useMemo(() => {
    const monthStartIso = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
    const lastDayNum = new Date(currentYear, currentMonth + 1, 0).getDate();
    const monthEndIso = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;

    return techniciansList.map((tech) => {
      const normTech = normalizeName(tech.name);

      // 1. Find Tournées assigned to this tech that intersect this month
      const techTours: any[] = [];

      localTours.forEach((tour, tIdx) => {
        if (!tour || isDraftTour(tour)) return;
        const normTourTech = normalizeName(tour.techName || tour.technicien || tour.technicienNom || tour.tech);

        const tourMissions = Array.isArray(tour.missions || tour.passages) ? (tour.missions || tour.passages) : [];

        const hasMissionsAssignedToTech = tourMissions.some((m: any) => {
          const normMissionTech = normalizeName(m.techName || m.technicien || m.assignedTech || m.technicienNom);
          if (normMissionTech && normMissionTech === normTech) return true;
          if (!normMissionTech && normTourTech === normTech) return true;
          return false;
        });

        if (!hasMissionsAssignedToTech && normTourTech !== normTech) {
          return;
        }

        // Determine date range of this tournée
        const rawStart = tour.startDate !== 'A trier' && tour.startDate !== 'a-trier' ? tour.startDate : null;
        let startIso = toIsoDateStr(rawStart);
        let endIso = startIso;

        // Valid missions assigned to this tech in this tour
        const validMissionsForTech: any[] = [];
        tourMissions.forEach((m: any) => {
          if (!m) return;
          const mStatus = String(m.status || '').trim().toLowerCase();
          if (mStatus === 'brouillon' || mStatus === 'draft') return;

          const normMissionTech = normalizeName(m.techName || m.technicien || m.assignedTech || m.technicienNom);
          const isForThisTech = normMissionTech ? normMissionTech === normTech : normTourTech === normTech;
          if (!isForThisTech) return;

          const mIso = getMissionIsoDate(m);
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

      // 2. Find Spontaneous events for this tech in this month
      const techSpontaneous = localEvents.filter(evt => {
        if (!evt) return false;
        const normEvtTech = normalizeName(evt.techName);
        if (normEvtTech !== normTech) return false;
        const evtIso = toIsoDateStr(evt.date);
        if (!evtIso) return false;
        return evtIso >= monthStartIso && evtIso <= monthEndIso;
      });

      return {
        tech,
        normTech,
        tours: techTours,
        spontaneousEvents: techSpontaneous
      };
    });
  }, [techniciansList, localTours, localEvents, currentYear, currentMonth]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100000] bg-white flex flex-col overflow-hidden text-neutral-900 select-none animate-fadeIn"
      style={{
        fontFamily: "'DefibeoMain', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      }}
    >
      {/* Header Bar */}
      <div className="bg-white border-b border-neutral-200 px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Left: Title */}
        <div className="flex items-center gap-3">
          <span
            style={{
              letterSpacing: '0px',
              color: '#000',
              cursor: 'default',
              fontSize: '22px',
              fontWeight: 'bold'
            }}
          >
            Planning vue étendue
          </span>
        </div>

        {/* Center: Month Navigation Controls */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="transition-colors cursor-pointer hover:opacity-80"
            style={{
              fontSize: '18px',
              borderRadius: '13px',
              padding: '10px 20px',
              border: 'none',
              background: '#edededa6',
              color: '#000'
            }}
            title="Mois précédent"
          >
            Précédent
          </button>

          <div
            className="px-4 py-0 text-neutral-950 min-w-[200px] text-center select-none"
            style={{
              fontFamily: "'Alternative', 'DefibeoAlternative', 'Gochi', cursive, sans-serif",
              fontSize: '24px',
              lineHeight: '1.2'
            }}
          >
            {MONTH_NAMES_FR[currentMonth]} {currentYear}
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            className="transition-colors cursor-pointer hover:opacity-80"
            style={{
              fontSize: '18px',
              borderRadius: '13px',
              padding: '10px 20px',
              border: 'none',
              background: '#edededa6',
              color: '#000'
            }}
            title="Mois suivant"
          >
            Suivant
          </button>

          <button
            type="button"
            onClick={handleCurrentMonth}
            className="transition-colors cursor-pointer hover:opacity-80 ml-1"
            style={{
              fontSize: '18px',
              borderRadius: '13px',
              padding: '10px 20px',
              border: 'none',
              background: '#edededa6',
              color: '#000'
            }}
            title="Revenir au mois en cours"
          >
            Aujourd'hui
          </button>
        </div>

        {/* Right: Actualiser & Fermer */}
        <div className="flex items-center gap-2">
          {lastRefreshedText && (
            <span className="text-[15px] font-semibold text-emerald-600 animate-fadeIn select-none mr-2">
              {lastRefreshedText}
            </span>
          )}

          <button
            type="button"
            disabled={isRefreshing}
            onClick={handleRefresh}
            className="transition-colors cursor-pointer disabled:opacity-50 hover:opacity-80"
            style={{
              fontSize: '18px',
              borderRadius: '13px',
              padding: '10px 20px',
              border: 'none',
              background: '#edededa6',
              color: '#000'
            }}
            title="Recharger les données sans recharger la page"
          >
            {isRefreshing ? 'Actualisation...' : 'Actualiser'}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="transition-colors cursor-pointer ml-2 hover:opacity-90"
            style={{
              fontSize: '18px',
              borderRadius: '13px',
              padding: '10px 20px',
              border: 'none',
              color: '#fff',
              background: '#000000'
            }}
          >
            Fermer
          </button>
        </div>
      </div>

      {/* Sub-header / Legend Bar */}
      <div className="bg-neutral-50 border-b border-neutral-200 px-4 py-2 sm:px-6 flex flex-wrap items-center gap-5 text-xs font-medium shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-xs bg-[#165dfc] inline-block shrink-0" />
          <span className="text-neutral-800 font-semibold">Mission Défibrillateur</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-xs bg-[#0891b2] inline-block shrink-0" />
          <span className="text-neutral-800 font-semibold">Autre Matériel</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-xs bg-[#9333ea] inline-block shrink-0" />
          <span className="text-neutral-800 font-semibold">Événement spontané</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-1.5 rounded-full bg-[#fe4eba] inline-block shrink-0" />
          <span className="text-neutral-800 font-semibold">Période de tournée</span>
        </div>
      </div>

      {/* Main Matrix Gantt Container */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-white">
        <div className="inline-block min-w-full align-top">
          {/* Timeline Table Grid */}
          <table className="border-collapse text-left" style={{ minWidth: `${daysInMonth.length * 200}px`, width: '100%' }}>
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
                    Semaine {w.weekNum}
                  </th>
                ))}
              </tr>

              {/* Row 2: Days (1 to 31) */}
              <tr className="border-b border-neutral-300 bg-white text-neutral-800 text-xs">
                {daysInMonth.map((d) => (
                  <th
                    key={`day-header-${d.isoDate}`}
                    id={d.isToday ? "extended-planning-today-col" : undefined}
                    className={`relative border-r border-neutral-200 px-1 py-1.5 text-center font-semibold select-none w-[200px] min-w-[200px] max-w-[200px] ${
                      d.isToday
                        ? 'bg-pink-100/80 text-[#FD4EBB] border-b-2 border-b-[#FD4EBB]'
                        : d.isWeekend
                        ? 'bg-neutral-100/60 text-neutral-400'
                        : 'bg-white text-neutral-700'
                    }`}
                  >
                    <div className="text-[11px] uppercase tracking-wider">{d.dayShort}</div>
                    <div className={`text-sm font-bold ${d.isToday ? 'text-[#FD4EBB]' : 'text-neutral-900'}`}>
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
                ))}
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
                    <tr className="bg-neutral-100/90 border-t-2 border-b border-neutral-300">
                      <td
                        colSpan={daysInMonth.length}
                        className="px-4 py-2 font-bold text-sm text-neutral-900 bg-neutral-100 select-none shadow-2xs"
                      >
                        <div className="flex items-center">
                          <span className="text-base text-neutral-950 font-bold tracking-tight">{tech.name}</span>
                        </div>
                      </td>
                    </tr>

                    {/* IF NO ACTIVITY THIS MONTH: Blank row */}
                    {!hasActivity && (
                      <tr className="border-b border-neutral-200">
                        {daysInMonth.map((d) => (
                          <td
                            key={`empty-${tech.name}-${d.isoDate}`}
                            className={`relative border-r border-neutral-200 p-1 w-[200px] min-w-[200px] max-w-[200px] ${
                              d.isToday ? 'bg-pink-50/30' : d.isWeekend ? 'bg-neutral-100/30' : 'bg-white'
                            }`}
                          >
                            {d.isToday && (
                              <div
                                className="absolute top-0 bottom-0 pointer-events-none z-20 w-[2px] bg-[#ef4444]"
                                style={{ left: `${todayCursorPercent}%` }}
                              />
                            )}
                          </td>
                        ))}
                      </tr>
                    )}

                    {/* TOURNÉES & MISSIONS */}
                    {tours.map((tItem, tIdx) => {
                      const startFormatted = tItem.startIso.split('-').reverse().slice(0, 2).join('/');
                      const endFormatted = tItem.endIso.split('-').reverse().slice(0, 2).join('/');

                      return (
                        <tr
                          key={`tour-row-${tech.name}-${tItem.tourId}-${tIdx}`}
                          className="border-b border-neutral-200 hover:bg-neutral-50/30 transition-colors"
                        >
                          {/* Days Columns for this Tournée (Full Width) */}
                          {daysInMonth.map((d) => {
                            const isWithinTour = d.isoDate >= tItem.startIso && d.isoDate <= tItem.endIso;
                            const dayMissions = tItem.missions.filter((m: any) => m.resolvedIsoDate === d.isoDate);

                            return (
                              <td
                                key={`tour-day-${tItem.tourId}-${d.isoDate}`}
                                className={`relative border-r border-neutral-200 p-1.5 align-top w-[200px] min-w-[200px] max-w-[200px] ${
                                  d.isToday
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

                                {/* Tournée pink barrette: ALWAYS visible if within tour, regardless of missions count */}
                                {isWithinTour && (
                                  <div
                                    className="h-2 w-full rounded-full bg-[#fe4eba]/80 hover:bg-[#fe4eba] transition-colors mb-1.5 cursor-default shrink-0"
                                    title={tItem.title}
                                  />
                                )}

                                {/* Day missions: placed under the pink barrette, horizontally shifted based on time */}
                                {dayMissions.length > 0 && (
                                  <div className="space-y-1.5">
                                    {dayMissions.map((m: any, mIdx: number) => {
                                      const details = getMissionDetails(m);

                                      // Line 1: Créneau - Identifiant
                                      const line1 = [details.creneau, details.identifiant].filter(Boolean).join(' - ');
                                      // Line 2: Client - Site
                                      const line2 = [details.clientName, details.siteName].filter(Boolean).join(' - ');
                                      // Line 3: Localisation
                                      const line3 = details.locationStr;

                                      const barColor = details.isDefib ? '#165dfc' : '#0891b2';
                                      const timeOffset = getTimeOffsetPercent(details.creneau);
                                      // Shift horizontally between 0px and 40px depending on time
                                      const marginLeftPx = Math.round(timeOffset * 40);

                                      return (
                                        <div
                                          key={`mission-bar-${m.id || mIdx}`}
                                          className="w-[150px] max-w-[150px] select-none cursor-default overflow-hidden transition-all shadow-xs"
                                          style={{
                                            marginLeft: `${marginLeftPx}px`,
                                            backgroundColor: barColor,
                                            borderRadius: '10px',
                                            padding: '8px 12px',
                                            fontSize: '12px',
                                            color: '#fff',
                                            lineHeight: '16px'
                                          }}
                                          title={`Créneau : ${details.creneau || 'Non spécifié'}`}
                                        >
                                          {/* Line 1: Créneau - Identifiant */}
                                          <div
                                            className="truncate whitespace-nowrap overflow-hidden text-ellipsis block font-semibold"
                                            style={{ fontSize: '12px', lineHeight: '16px', color: '#fff' }}
                                          >
                                            {line1 || 'Mission'}
                                          </div>
                                          {/* Line 2: Client - Site */}
                                          <div
                                            className="truncate whitespace-nowrap overflow-hidden text-ellipsis block"
                                            style={{ fontSize: '12px', lineHeight: '16px', color: '#fff' }}
                                          >
                                            {line2 || 'Client'}
                                          </div>
                                          {/* Line 3: Localisation */}
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
                      );
                    })}

                    {/* SPONTANEOUS EVENTS ROW (Full Width, no left header) */}
                    {techEvts.length > 0 && (
                      <tr className="border-b border-neutral-200 bg-purple-50/15 hover:bg-purple-50/25 transition-colors">
                        {daysInMonth.map((d) => {
                          const matchingEvts = techEvts.filter(e => toIsoDateStr(e.date) === d.isoDate);

                          return (
                            <td
                              key={`spont-cell-${tech.name}-${d.isoDate}`}
                              className={`relative border-r border-neutral-200 p-1.5 align-top w-[200px] min-w-[200px] max-w-[200px] ${
                                d.isToday
                                  ? 'bg-pink-50/50'
                                  : d.isWeekend
                                  ? 'bg-neutral-100/40'
                                  : 'bg-white'
                              }`}
                            >
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
                                    const line1 = [evt.creneau, 'Spontané'].filter(Boolean).join(' - ');
                                    const line2 = evt.intitule || '';
                                    const line3 = evt.commentaire || '';
                                    const timeOffset = getTimeOffsetPercent(evt.creneau);
                                    const marginLeftPx = Math.round(timeOffset * 40);

                                    return (
                                      <div
                                        key={evt.id}
                                        className="w-[150px] max-w-[150px] select-none cursor-default overflow-hidden transition-all shadow-xs"
                                        style={{
                                          marginLeft: `${marginLeftPx}px`,
                                          backgroundColor: '#9333ea',
                                          borderRadius: '10px',
                                          padding: '8px 12px',
                                          fontSize: '12px',
                                          color: '#fff',
                                          lineHeight: '16px'
                                        }}
                                        title={`Événement spontané : ${evt.creneau || 'Horaire libre'}`}
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
