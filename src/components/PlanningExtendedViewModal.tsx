import React, { useState, useMemo, useEffect, useCallback } from 'react';
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

      // 1. Refresh Tours from local storage or remote
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

  const handleCurrentMonth = () => {
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
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

  // Mapping client / equipment helpers
  const getClientName = useCallback((mission: any) => {
    if (!mission) return '';
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

    return (
      mission.clientDenomination ||
      mission.client ||
      clientObj?.denomination ||
      mission.clientName ||
      defib?.exploitant ||
      defib?.nomPrenomSite ||
      'Client'
    );
  }, [clients, defibrillateurs, otherEquipments]);

  // Format mission status color
  const getMissionStatusColors = (statusRaw?: string) => {
    const s = String(statusRaw || '').toLowerCase().trim();
    if (s.includes('réalisé') || s.includes('effectué') || s.includes('terminé') || s.includes('clôturé') || s.includes('done')) {
      return {
        bg: '#059669', // Emerald 600
        border: '#047857',
        text: '#ffffff',
        badge: 'Réalisé'
      };
    }
    if (s.includes('en cours') || s.includes('démarré') || s.includes('started')) {
      return {
        bg: '#0284c7', // Sky 600
        border: '#0369a1',
        text: '#ffffff',
        badge: 'En cours'
      };
    }
    if (s.includes('annulé') || s.includes('refusé') || s.includes('annule')) {
      return {
        bg: '#dc2626', // Red 600
        border: '#b91c1c',
        text: '#ffffff',
        badge: 'Annulé'
      };
    }
    // Default: À faire / Planifié
    return {
      bg: '#4338ca', // Indigo 700
      border: '#3730a3',
      text: '#ffffff',
      badge: 'À faire'
    };
  };

  // Technicians dataset grouped
  const techniciansData = useMemo(() => {
    // Current month ISO bounds
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

        // Check if any missions in the tour are assigned to this technician
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
          status: tour.status || 'Planifiée',
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
        spontaneousEvents: techSpontaneous,
        totalMissionsCount: techTours.reduce((sum, t) => sum + t.missions.length, 0) + techSpontaneous.length
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
        {/* Left: Title & Subtitle */}
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-neutral-900">
                Planning vue étendue
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-700 border border-neutral-200">
                Vue mensuelle mixée
              </span>
            </div>
            <div className="text-xs text-neutral-500 font-medium mt-0.5">
              {techniciansList.length} technicien{techniciansList.length > 1 ? 's' : ''} • Vue consultative d'ensemble
            </div>
          </div>
        </div>

        {/* Center: Month Navigation Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="px-3 py-1.5 rounded-lg border border-neutral-300 text-neutral-800 text-sm font-semibold hover:bg-neutral-100 active:bg-neutral-200 transition-colors cursor-pointer"
            title="Mois précédent"
          >
            ← Précédent
          </button>

          <div className="px-4 py-1.5 text-base font-bold text-neutral-900 min-w-[150px] text-center">
            {MONTH_NAMES_FR[currentMonth]} {currentYear}
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            className="px-3 py-1.5 rounded-lg border border-neutral-300 text-neutral-800 text-sm font-semibold hover:bg-neutral-100 active:bg-neutral-200 transition-colors cursor-pointer"
            title="Mois suivant"
          >
            Suivant →
          </button>

          <button
            type="button"
            onClick={handleCurrentMonth}
            className="px-3 py-1.5 rounded-lg border border-neutral-300 text-neutral-700 text-sm font-medium hover:bg-neutral-100 transition-colors cursor-pointer ml-1"
            title="Revenir au mois en cours"
          >
            Aujourd'hui
          </button>
        </div>

        {/* Right: Actualiser & Fermer */}
        <div className="flex items-center gap-2">
          {lastRefreshedText && (
            <span className="text-xs text-emerald-700 font-semibold px-2 py-1 bg-emerald-50 rounded-md border border-emerald-200 animate-fadeIn">
              {lastRefreshedText}
            </span>
          )}

          <button
            type="button"
            disabled={isRefreshing}
            onClick={handleRefresh}
            className="px-3.5 py-1.5 rounded-lg border border-neutral-300 text-neutral-800 text-sm font-semibold hover:bg-neutral-100 active:bg-neutral-200 transition-colors cursor-pointer disabled:opacity-50"
            title="Recharger les données sans recharger la page"
          >
            {isRefreshing ? 'Actualisation...' : 'Actualiser'}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-black text-white text-sm font-bold hover:bg-neutral-800 active:bg-neutral-900 transition-colors cursor-pointer ml-2"
          >
            Fermer
          </button>
        </div>
      </div>

      {/* Sub-header / Legend Bar (Compact) */}
      <div className="bg-neutral-50 border-b border-neutral-200 px-4 py-1.5 sm:px-6 flex flex-wrap items-center justify-between gap-2 text-xs font-medium shrink-0">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-[#4338ca] inline-block" />
            <span className="text-neutral-700">Mission à faire</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-[#059669] inline-block" />
            <span className="text-neutral-700">Mission réalisée</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-[#0284c7] inline-block" />
            <span className="text-neutral-700">Mission en cours</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-[#9333ea] inline-block" />
            <span className="text-neutral-700">Événement spontané</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs border border-pink-400 bg-pink-100 inline-block" />
            <span className="text-neutral-700">Période de tournée</span>
          </div>
        </div>

        <div className="text-neutral-500 italic text-[11px]">
          Survolez un bâtonnet pour afficher les détails complets de la mission
        </div>
      </div>

      {/* Main Matrix Gantt Container */}
      <div className="flex-1 overflow-auto bg-white">
        <div className="inline-block min-w-full align-top">
          {/* Timeline Table Grid */}
          <table className="border-collapse text-left" style={{ minWidth: `${280 + daysInMonth.length * 68}px`, width: '100%' }}>
            {/* Header: Weeks and Days */}
            <thead className="sticky top-0 z-30 bg-white">
              {/* Row 1: Weeks */}
              <tr className="border-b border-neutral-200 bg-neutral-100 text-neutral-600 text-xs font-semibold">
                <th
                  className="sticky left-0 z-40 bg-neutral-100 border-r border-neutral-300 px-3 py-1.5 w-[280px] min-w-[280px]"
                >
                  Semaines
                </th>
                {weeksGroup.map((w, idx) => (
                  <th
                    key={`week-${w.weekNum}-${idx}`}
                    colSpan={w.count}
                    className="border-r border-neutral-300 px-2 py-1 text-center font-bold text-neutral-700 bg-neutral-100/90 text-xs"
                  >
                    Semaine {w.weekNum}
                  </th>
                ))}
              </tr>

              {/* Row 2: Days (1 to 31) */}
              <tr className="border-b border-neutral-300 bg-white text-neutral-800 text-xs">
                <th
                  className="sticky left-0 z-40 bg-white border-r border-neutral-300 px-3 py-2 w-[280px] min-w-[280px] font-bold text-neutral-900 shadow-xs"
                >
                  Technicien / Tournées & Missions
                </th>
                {daysInMonth.map((d) => (
                  <th
                    key={`day-header-${d.isoDate}`}
                    className={`border-r border-neutral-200 px-1 py-1.5 text-center font-semibold select-none w-[68px] min-w-[68px] max-w-[68px] ${
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
                  </th>
                ))}
              </tr>
            </thead>

            {/* Body: Technicians lanes */}
            <tbody className="divide-y divide-neutral-200 text-xs">
              {techniciansData.length === 0 && (
                <tr>
                  <td colSpan={1 + daysInMonth.length} className="py-12 text-center text-neutral-500 font-medium text-sm">
                    Aucun technicien trouvé pour ce tenant.
                  </td>
                </tr>
              )}

              {techniciansData.map(({ tech, tours, spontaneousEvents: techEvts, totalMissionsCount }, techIdx) => {
                const hasActivity = tours.length > 0 || techEvts.length > 0;

                return (
                  <React.Fragment key={`tech-row-group-${tech.name}-${techIdx}`}>
                    {/* TECHNICIAN HEADER ROW */}
                    <tr className="bg-neutral-50 border-t-2 border-neutral-300">
                      {/* Sticky Left: Technician Profile */}
                      <td
                        className="sticky left-0 z-20 bg-neutral-50 border-r border-neutral-300 px-3 py-2 w-[280px] min-w-[280px]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-neutral-900 truncate" title={tech.name}>
                              {tech.name}
                            </div>
                            <div className="text-[11px] text-neutral-500">
                              {tech.role || 'Technicien'}
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-200 text-neutral-800 shrink-0">
                            {totalMissionsCount} {totalMissionsCount > 1 ? 'act.' : 'act.'}
                          </span>
                        </div>
                      </td>

                      {/* Timeline Day background for Tech Header */}
                      {daysInMonth.map((d) => (
                        <td
                          key={`tech-cell-${tech.name}-${d.isoDate}`}
                          className={`border-r border-neutral-200 p-0 text-center w-[68px] min-w-[68px] max-w-[68px] ${
                            d.isToday ? 'bg-pink-50/40' : d.isWeekend ? 'bg-neutral-100/40' : 'bg-neutral-50/60'
                          }`}
                        />
                      ))}
                    </tr>

                    {/* IF NO ACTIVITY THIS MONTH */}
                    {!hasActivity && (
                      <tr className="border-b border-neutral-200">
                        <td className="sticky left-0 z-20 bg-white border-r border-neutral-300 px-3 py-2 text-neutral-400 italic text-[11px]">
                          Aucune tournée ou mission ce mois
                        </td>
                        {daysInMonth.map((d) => (
                          <td
                            key={`empty-${tech.name}-${d.isoDate}`}
                            className={`border-r border-neutral-200 p-1 w-[68px] min-w-[68px] max-w-[68px] ${
                              d.isToday ? 'bg-pink-50/30' : d.isWeekend ? 'bg-neutral-100/30' : 'bg-white'
                            }`}
                          />
                        ))}
                      </tr>
                    )}

                    {/* TOURNÉES PARENT ENCARTS & MISSIONS */}
                    {tours.map((tItem, tIdx) => {
                      return (
                        <tr
                          key={`tour-row-${tech.name}-${tItem.tourId}-${tIdx}`}
                          className="border-b border-neutral-200 hover:bg-neutral-50/40 transition-colors"
                        >
                          {/* Sticky Left: Tournée Parent Encart */}
                          <td className="sticky left-0 z-20 bg-white border-r border-neutral-300 px-3 py-2 w-[280px] min-w-[280px] align-top">
                            <div className="border-l-4 border-[#FD4EBB] pl-2 space-y-0.5">
                              <div className="font-bold text-xs text-neutral-900 truncate" title={tItem.title}>
                                {tItem.title}
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-neutral-500">
                                <span>
                                  {tItem.startIso === tItem.endIso
                                    ? tItem.startIso.split('-').reverse().slice(0, 2).join('/')
                                    : `${tItem.startIso.split('-').reverse().slice(0, 2).join('/')} → ${tItem.endIso.split('-').reverse().slice(0, 2).join('/')}`}
                                </span>
                                <span className="font-semibold text-neutral-700">
                                  {tItem.missions.length} mission{tItem.missions.length > 1 ? 's' : ''}
                                </span>
                              </div>
                              {tItem.status && (
                                <span className="inline-block text-[10px] font-medium px-1.5 py-0.2 rounded bg-neutral-100 text-neutral-700 border border-neutral-200">
                                  {tItem.status}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Days Columns for this Tournée */}
                          {daysInMonth.map((d) => {
                            // Check if this day is within the tournée period
                            const isWithinTour = d.isoDate >= tItem.startIso && d.isoDate <= tItem.endIso;
                            // Missions for this specific day
                            const dayMissions = tItem.missions.filter((m: any) => m.resolvedIsoDate === d.isoDate);

                            return (
                              <td
                                key={`tour-day-${tItem.tourId}-${d.isoDate}`}
                                className={`border-r border-neutral-200 p-1 align-top w-[68px] min-w-[68px] max-w-[68px] ${
                                  d.isToday
                                    ? 'bg-pink-50/50'
                                    : isWithinTour
                                    ? 'bg-pink-50/25'
                                    : d.isWeekend
                                    ? 'bg-neutral-100/40'
                                    : 'bg-white'
                                }`}
                              >
                                {dayMissions.length > 0 ? (
                                  <div className="space-y-1">
                                    {dayMissions.map((m: any, mIdx: number) => {
                                      const clientName = getClientName(m);
                                      const slot = m.estimatedSlot || m.creneau || m.slot || m.estimatedTime || '';
                                      const statusCfg = getMissionStatusColors(m.status || m.situation);
                                      const equipmentType = m.equipmentType || 'Défibrillateur';
                                      const address = m.ville || m.address || '';

                                      const tooltipText = [
                                        `Tournée : ${tItem.title}`,
                                        `Date : ${d.isoDate}${slot ? ` à ${slot}` : ''}`,
                                        `Client : ${clientName}`,
                                        address ? `Lieu : ${address}` : null,
                                        `Équipement : ${equipmentType}`,
                                        `Statut : ${statusCfg.badge}`
                                      ].filter(Boolean).join('\n');

                                      return (
                                        <div
                                          key={`mission-bar-${m.id || mIdx}`}
                                          title={tooltipText}
                                          className="px-1.5 py-1 rounded text-white text-[11px] font-semibold truncate shadow-xs cursor-help leading-tight"
                                          style={{
                                            backgroundColor: statusCfg.bg,
                                            borderLeft: `3px solid ${statusCfg.border}`
                                          }}
                                        >
                                          {slot ? `${slot} ` : ''}
                                          {clientName}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : isWithinTour ? (
                                  // Tournée parent visual marker bar if no mission on this exact day
                                  <div
                                    title={`Tournée ${tItem.title} en cours`}
                                    className="h-2 rounded-xs bg-pink-200/80 my-1 cursor-default"
                                  />
                                ) : null}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}

                    {/* SPONTANEOUS EVENTS ROW */}
                    {techEvts.length > 0 && (
                      <tr className="border-b border-neutral-200 bg-purple-50/20">
                        {/* Sticky Left */}
                        <td className="sticky left-0 z-20 bg-white border-r border-neutral-300 px-3 py-1.5 w-[280px] min-w-[280px] align-middle">
                          <div className="border-l-4 border-purple-600 pl-2">
                            <div className="font-bold text-xs text-purple-900">
                              Événements spontanés
                            </div>
                            <div className="text-[11px] text-purple-700">
                              {techEvts.length} événement{techEvts.length > 1 ? 's' : ''}
                            </div>
                          </div>
                        </td>

                        {/* Days Columns */}
                        {daysInMonth.map((d) => {
                          const matchingEvts = techEvts.filter(e => toIsoDateStr(e.date) === d.isoDate);

                          return (
                            <td
                              key={`spont-cell-${tech.name}-${d.isoDate}`}
                              className={`border-r border-neutral-200 p-1 align-top w-[68px] min-w-[68px] max-w-[68px] ${
                                d.isToday
                                  ? 'bg-pink-50/50'
                                  : d.isWeekend
                                  ? 'bg-neutral-100/40'
                                  : 'bg-white'
                              }`}
                            >
                              {matchingEvts.length > 0 && (
                                <div className="space-y-1">
                                  {matchingEvts.map((evt) => {
                                    const tooltipText = [
                                      `Événement spontané (${tech.name})`,
                                      `Date : ${d.isoDate} (${evt.creneau || 'Journée'})`,
                                      `Intitulé : ${evt.intitule}`,
                                      evt.commentaire ? `Commentaire : ${evt.commentaire}` : null
                                    ].filter(Boolean).join('\n');

                                    return (
                                      <div
                                        key={evt.id}
                                        title={tooltipText}
                                        className="px-1.5 py-1 rounded bg-[#9333ea] text-white text-[11px] font-semibold truncate shadow-xs cursor-help leading-tight"
                                      >
                                        {evt.creneau ? `${evt.creneau} ` : ''}
                                        {evt.intitule}
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
