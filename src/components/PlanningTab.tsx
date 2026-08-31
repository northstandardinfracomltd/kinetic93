import React, { useState, useMemo, useEffect } from 'react';
import { X, Columns3 } from 'lucide-react';
import { CompanyInfo, Member, MemberSchedule, MemberAbsence } from '../types';
import { saveCollectionToFirestore, fetchCollectionFromFirestore } from '../firebase';
import { getActiveTenantCountry, getHolidaysForYear, isHolidayDate, SupportedCountry } from '../utils/holidays';

export interface SpontaneousEvent {
  id: string;
  techName: string;
  date: string;
  creneau: string;
  intitule: string;
  commentaire: string;
  createdAt?: string;
}

const CRENEAU_OPTIONS = [
  "8:00am", "8:30am", "9:00am", "9:30am",
  "10:00am", "10:30am", "11:00am", "11:30am",
  "12:00pm", "12:30pm", "13:00pm", "13:30pm",
  "14:00pm", "14:30pm", "15:00pm", "15:30pm",
  "16:00pm", "16:30pm", "17:00pm", "17:30pm",
  "18:00pm", "18:30pm", "19:00pm"
];

interface PlanningTabProps {
  companyInfo?: CompanyInfo;
  fsmTours?: any[];
  authenticatedUser?: any;
  defibrillateurs?: any[];
  otherEquipments?: any[];
  clients?: any[];
  variables?: any[];
  members?: Member[];
  t: (key: string) => string;
  initialTech?: string;
  isSidePane?: boolean;
}

const MONTH_NAMES_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

const DAY_NAMES_FR = [
  'Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'
];

const getFormattedDateFR = (dateStr?: any): string => {
  if (!dateStr || dateStr === 'A trier') return '';
  const s = String(dateStr);
  if (s.includes('-')) {
    const parts = s.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      } else if (parts[2].length === 4) {
        return `${parts[0]}/${parts[1]}/${parts[2]}`;
      }
    }
  }
  return s;
};

const toIsoDateStr = (rawDate?: any): string => {
  if (!rawDate || rawDate === 'A trier') return '';
  const s = String(rawDate);
  if (s.includes('-')) {
    const parts = s.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) return s;
      if (parts[2].length === 4) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  return s;
};

const getISOWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

export const PlanningTab: React.FC<PlanningTabProps> = ({
  companyInfo,
  fsmTours = [],
  authenticatedUser,
  defibrillateurs = [],
  otherEquipments = [],
  clients = [],
  variables = [],
  members = [],
  t,
  initialTech,
  isSidePane = false,
}) => {
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth());
  const [horizontalModalWeek, setHorizontalModalWeek] = useState<{
    weekNum: number;
    days: any[];
  } | null>(null);

  useEffect(() => {
    if (!horizontalModalWeek) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHorizontalModalWeek(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [horizontalModalWeek]);

  // Detect active tenant country (France, Belgique, Luxembourg, Monaco, Suisse, Royaume-Uni, Espagne, Portugal)
  const [activeCountry, setActiveCountry] = useState<SupportedCountry>(() =>
    getActiveTenantCountry(companyInfo)
  );

  useEffect(() => {
    const handleUpdate = () => {
      setActiveCountry(getActiveTenantCountry(companyInfo));
    };
    handleUpdate();
    window.addEventListener('defib_lang_changed', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('defib_lang_changed', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [companyInfo]);

  // Compute public holidays for current viewed year (& adjacent boundaries)
  const holidaysMap = useMemo(() => {
    return {
      ...getHolidaysForYear(selectedYear - 1, activeCountry),
      ...getHolidaysForYear(selectedYear, activeCountry),
      ...getHolidaysForYear(selectedYear + 1, activeCountry),
    };
  }, [selectedYear, activeCountry]);

  // Mini Form Spontaneous Event states
  const [isSpontaneousFormOpen, setIsSpontaneousFormOpen] = useState<boolean>(false);
  const [formDate, setFormDate] = useState<string>('');
  const [formCreneau, setFormCreneau] = useState<string>('');
  const [formIntitule, setFormIntitule] = useState<string>('');
  const [formCommentaire, setFormCommentaire] = useState<string>('');
  const [formError, setFormError] = useState<string>('');

  const [spontaneousEvents, setSpontaneousEvents] = useState<SpontaneousEvent[]>(() => {
    try {
      const tid = localStorage.getItem('defib_tenant_id') || 'demo';
      const saved = localStorage.getItem(`defib_${tid}_spontaneous_events`) || localStorage.getItem('defib_spontaneous_events');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const tid = localStorage.getItem('defib_tenant_id') || 'demo';
        const saved = localStorage.getItem(`defib_${tid}_spontaneous_events`) || localStorage.getItem('defib_spontaneous_events');
        if (saved) {
          setSpontaneousEvents(JSON.parse(saved));
        }
        const remote = await fetchCollectionFromFirestore<SpontaneousEvent[]>('spontaneous_events');
        if (remote && Array.isArray(remote)) {
          setSpontaneousEvents(remote);
          localStorage.setItem(`defib_${tid}_spontaneous_events`, JSON.stringify(remote));
          localStorage.setItem('defib_spontaneous_events', JSON.stringify(remote));
        }
      } catch (e) {
        console.error(e);
      }
    };

    loadEvents();
    window.addEventListener('storage', loadEvents);
    window.addEventListener('defib_spontaneous_events_updated', loadEvents);
    return () => {
      window.removeEventListener('storage', loadEvents);
      window.removeEventListener('defib_spontaneous_events_updated', loadEvents);
    };
  }, []);

  const saveSpontaneousEvents = (updated: SpontaneousEvent[]) => {
    setSpontaneousEvents(updated);
    try {
      const tid = localStorage.getItem('defib_tenant_id') || 'demo';
      localStorage.setItem(`defib_${tid}_spontaneous_events`, JSON.stringify(updated));
      localStorage.setItem('defib_spontaneous_events', JSON.stringify(updated));
      window.dispatchEvent(new Event('defib_spontaneous_events_updated'));
      saveCollectionToFirestore('spontaneous_events', updated).catch(() => {});
    } catch (e) {
      console.error(e);
    }
  };

  const [expandedMissions, setExpandedMissions] = useState<Record<string, boolean>>({});

  const toggleMissionExpanded = (key: string) => {
    setExpandedMissions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // List of technician members only (strictly tenant-isolated)
  const techniciansList = useMemo(() => {
    const rawAll = (members && members.length > 0) ? members : (companyInfo?.members || []);
    const activeTenantId = (
      authenticatedUser?.tenantId ||
      authenticatedUser?.envId ||
      localStorage.getItem('defib_tenant_id') ||
      'demo'
    ).trim().toLowerCase();
    const isDemo = activeTenantId === 'demo';

    let filtered = rawAll.filter((m: any) => {
      if (!m || typeof m !== 'object' || !m.name) return false;
      const mEnv = (m.envId || m.tenantId || '').trim().toLowerCase();

      if (isDemo) {
        if (mEnv && mEnv !== 'demo') return false;
        return true;
      }

      if (mEnv) {
        return mEnv === activeTenantId;
      }

      // Member has no explicit envId/tenantId:
      // If in custom env, strictly reject demo members!
      if (m.email === 'techniciendemo1@demo.com' || m.name === 'Jakub Démo' || m.name === 'Jakub Demo') {
        return false;
      }
      return true;
    });

    // Ensure authenticated user is included
    if (authenticatedUser && authenticatedUser.name) {
      const exists = filtered.some(m => m.name.trim().toLowerCase() === authenticatedUser.name.trim().toLowerCase());
      if (!exists) {
        filtered = [authenticatedUser, ...filtered];
      }
    }

    const techOnly = filtered.filter(m => {
      const r = (m.role || '').toLowerCase();
      return r.includes('tech') || r.includes('technicien');
    });

    const result = techOnly.length > 0 ? techOnly : (filtered.length > 0 ? filtered : (authenticatedUser ? [authenticatedUser] : []));

    // Deduplicate by name
    const uniqueMap = new Map<string, Member>();
    result.forEach(m => {
      if (m && m.name) {
        const key = m.name.trim().toLowerCase();
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, m);
        }
      }
    });

    return Array.from(uniqueMap.values());
  }, [members, companyInfo, authenticatedUser]);

  // Selected technician state - auto select logged-in technician
  const [selectedTech, setSelectedTech] = useState<string>(() => {
    if (authenticatedUser?.name && authenticatedUser.name.trim() !== '') {
      return authenticatedUser.name;
    }
    if (initialTech && initialTech.trim() !== '') {
      return initialTech;
    }
    try {
      const activeUserRaw = localStorage.getItem("defib_active_tech_session");
      if (activeUserRaw) {
        const u = JSON.parse(activeUserRaw);
        if (u?.name) return u.name;
      }
    } catch (_) {}
    return '';
  });

  // Default selected technician: auto-select logged-in technician
  useEffect(() => {
    if (authenticatedUser?.name && authenticatedUser.name.trim() !== '') {
      setSelectedTech(authenticatedUser.name);
    } else if (initialTech && initialTech.trim() !== '') {
      setSelectedTech(initialTech);
    } else if (!selectedTech || selectedTech === 'Tous' || selectedTech === 'Sélectionner un technicien' || selectedTech === '') {
      try {
        const activeUserRaw = localStorage.getItem("defib_active_tech_session");
        if (activeUserRaw) {
          const u = JSON.parse(activeUserRaw);
          if (u?.name) {
            setSelectedTech(u.name);
            return;
          }
        }
      } catch (_) {}
      if (techniciansList.length > 0 && techniciansList[0]?.name) {
        setSelectedTech(techniciansList[0].name);
      }
    }
  }, [authenticatedUser?.name, initialTech, techniciansList]);

  // Active member object
  const activeMember = useMemo(() => {
    if (selectedTech === 'Tous' || !selectedTech) {
      return authenticatedUser || (techniciansList.length > 0 ? techniciansList[0] : null);
    }
    const found = techniciansList.find(m => m.name.trim().toLowerCase() === selectedTech.trim().toLowerCase());
    return found || authenticatedUser || null;
  }, [selectedTech, techniciansList, authenticatedUser]);

  // Days list for selected month/year
  const daysInMonthList = useMemo(() => {
    const totalDays = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const daysArr = [];

    for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
      const dateObj = new Date(selectedYear, selectedMonth, dayNum);
      const yearStr = dateObj.getFullYear();
      const monthStr = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dayStr = String(dayNum).padStart(2, '0');
      const isoDate = `${yearStr}-${monthStr}-${dayStr}`;
      const dayName = DAY_NAMES_FR[dateObj.getDay()];
      const isToday =
        dateObj.getFullYear() === today.getFullYear() &&
        dateObj.getMonth() === today.getMonth() &&
        dateObj.getDate() === today.getDate();
      const weekNum = getISOWeekNumber(dateObj);

      daysArr.push({
        dayNum,
        dateObj,
        isoDate,
        dayName,
        isToday,
        weekNum
      });
    }

    return daysArr;
  }, [selectedYear, selectedMonth]);

  // Group days into contiguous weeks
  const weeksList = useMemo(() => {
    const weeks: { weekNum: number; days: typeof daysInMonthList }[] = [];
    daysInMonthList.forEach((day) => {
      const lastWeek = weeks[weeks.length - 1];
      if (lastWeek && lastWeek.weekNum === day.weekNum) {
        lastWeek.days.push(day);
      } else {
        weeks.push({
          weekNum: day.weekNum,
          days: [day],
        });
      }
    });
    return weeks;
  }, [daysInMonthList]);

  // Retrieve assigned missions
  const missionsByDate = useMemo(() => {
    const map: Record<string, { tour: any; mission: any }[]> = {};

    if (!selectedTech || selectedTech.trim() === '') {
      return map;
    }

    if (Array.isArray(fsmTours)) {
      fsmTours.forEach(tour => {
        if (!tour) return;
        if (selectedTech !== 'Tous') {
          const tourTech = String(tour.techName || '').trim().toLowerCase();
          const selTech = selectedTech.trim().toLowerCase();
          if (tourTech !== selTech) return;
        }

        const tourMissions = tour.missions || tour.passages || [];
        if (!Array.isArray(tourMissions)) return;

        tourMissions.forEach((m: any) => {
          if (!m) return;
          const rawDate = m.estimatedDate || m.date || (tour.startDate !== 'A trier' ? tour.startDate : null);
          if (!rawDate) return;

          const missionIso = toIsoDateStr(rawDate);
          if (!missionIso) return;

          if (!map[missionIso]) {
            map[missionIso] = [];
          }
          map[missionIso].push({ tour, mission: m });
        });
      });
    }

    return map;
  }, [fsmTours, selectedTech]);

  // Compute active tours per day based on tour period (startDate) and the last mission date
  const activeToursByDate = useMemo(() => {
    const map: Record<string, { tourId: string; title: string; tour: any }[]> = {};

    if (!selectedTech || selectedTech.trim() === '') {
      return map;
    }

    if (Array.isArray(fsmTours)) {
      fsmTours.forEach((tour, tIdx) => {
        if (!tour || tour.id === 'a-trier') return;
        if (selectedTech !== 'Tous') {
          const tourTech = String(tour.techName || '').trim().toLowerCase();
          const selTech = selectedTech.trim().toLowerCase();
          if (tourTech !== selTech) return;
        }

        const rawStart = tour.startDate !== 'A trier' ? tour.startDate : null;
        const startIso = toIsoDateStr(rawStart);
        if (!startIso) return;

        // Find the farthest (latest) date among all missions
        const tourMissions = tour.missions || tour.passages || [];
        let endIso = startIso;

        if (Array.isArray(tourMissions) && tourMissions.length > 0) {
          tourMissions.forEach((m: any) => {
            if (!m) return;
            const mRawDate = m.estimatedDate || m.date;
            if (mRawDate && mRawDate !== 'A trier') {
              const mIso = toIsoDateStr(mRawDate);
              if (mIso && mIso > endIso) {
                endIso = mIso;
              }
            }
          });
        }

        const tourTitle = tour.title || tour.name || `Tournée ${tIdx + 1}`;
        const tourId = String(tour.id || `tour-${tIdx}`);

        // Iterate from startIso to endIso day by day
        try {
          const cur = new Date(startIso + 'T00:00:00');
          const end = new Date(endIso + 'T00:00:00');

          // Guard against invalid dates or runaway loops (max 90 days)
          let daysCount = 0;
          while (cur <= end && daysCount < 90) {
            const y = cur.getFullYear();
            const m = String(cur.getMonth() + 1).padStart(2, '0');
            const d = String(cur.getDate()).padStart(2, '0');
            const curIso = `${y}-${m}-${d}`;

            if (!map[curIso]) {
              map[curIso] = [];
            }
            if (!map[curIso].some(item => item.tourId === tourId)) {
              map[curIso].push({
                tourId,
                title: tourTitle,
                tour
              });
            }

            cur.setDate(cur.getDate() + 1);
            daysCount++;
          }
        } catch (_) {
          // Fallback to startIso only if date parsing fails
          if (!map[startIso]) {
            map[startIso] = [];
          }
          if (!map[startIso].some(item => item.tourId === tourId)) {
            map[startIso].push({
              tourId,
              title: tourTitle,
              tour
            });
          }
        }
      });
    }

    return map;
  }, [fsmTours, selectedTech]);

  // Auto-scroll to today's date card on load
  useEffect(() => {
    const yearStr = today.getFullYear();
    const monthStr = String(today.getMonth() + 1).padStart(2, '0');
    const dayStr = String(today.getDate()).padStart(2, '0');
    const todayIso = `${yearStr}-${monthStr}-${dayStr}`;

    const timer = setTimeout(() => {
      try {
        const todayEl = document.getElementById(`calendar-day-${todayIso}`);
        if (todayEl) {
          todayEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } catch (_) {}
    }, 150);

    return () => clearTimeout(timer);
  }, [selectedMonth, selectedYear]);

  // Track scroll position to show/hide "Remonter" button after ~200px
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);

  useEffect(() => {
    const checkScroll = () => {
      const scrollY = window.scrollY || window.pageYOffset || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
      if (scrollY > 200) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };

    window.addEventListener('scroll', checkScroll, { passive: true });
    const mainWrapper = document.getElementById('planning-tab-wrapper');
    const scrollParent = mainWrapper?.parentElement;
    if (scrollParent) {
      scrollParent.addEventListener('scroll', checkScroll, { passive: true });
    }

    checkScroll();

    return () => {
      window.removeEventListener('scroll', checkScroll);
      if (scrollParent) {
        scrollParent.removeEventListener('scroll', checkScroll);
      }
    };
  }, []);

  const handleScrollToTop = () => {
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const mainWrapper = document.getElementById('planning-tab-wrapper');
      if (mainWrapper) {
        mainWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      const scrollParent = mainWrapper?.parentElement;
      if (scrollParent) {
        scrollParent.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (_) {
      window.scrollTo(0, 0);
    }
  };

  const handleSaveSpontaneousEvent = () => {
    setFormError('');
    if (!formDate || !formCreneau || !formIntitule.trim() || !formCommentaire.trim()) {
      setFormError('Tous les champs sont requis.');
      return;
    }

    const techForEvent = (selectedTech && selectedTech !== 'Tous')
      ? selectedTech
      : (authenticatedUser?.name || 'Technicien');

    const newEvt: SpontaneousEvent = {
      id: `spont_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      techName: techForEvent,
      date: formDate,
      creneau: formCreneau,
      intitule: formIntitule.trim(),
      commentaire: formCommentaire.trim(),
      createdAt: new Date().toISOString()
    };

    const updated = [...spontaneousEvents, newEvt];
    saveSpontaneousEvents(updated);

    // Auto switch calendar month/year if needed
    if (formDate.includes('-')) {
      const parts = formDate.split('-');
      const yVal = parseInt(parts[0], 10);
      const mVal = parseInt(parts[1], 10) - 1;
      if (!isNaN(yVal) && !isNaN(mVal)) {
        setSelectedYear(yVal);
        setSelectedMonth(mVal);
      }
    }

    // Reset & close form
    setFormDate('');
    setFormCreneau('');
    setFormIntitule('');
    setFormCommentaire('');
    setIsSpontaneousFormOpen(false);
  };

  const handleDeleteSpontaneousEvent = (id: string) => {
    const updated = spontaneousEvents.filter(e => e.id !== id);
    saveSpontaneousEvents(updated);
  };

  return (
    <div className="space-y-4 font-sans pb-12" id="planning-tab-wrapper">
      {/* Field Technicien */}
      <div className="px-0 select-none">
        <select
          value={selectedTech}
          onChange={(e) => setSelectedTech(e.target.value)}
          className="w-full bg-white text-black appearance-none transition-all duration-150 focus:outline-none focus:ring-0 focus-visible:outline-none text-center cursor-pointer"
          style={{
            border: "1px solid rgb(201, 190, 205)",
            borderRadius: "14px",
            padding: "14px 12px",
            fontSize: "18px",
            fontWeight: "bold",
            boxShadow: "none",
            outline: "none",
            textAlign: "center",
            textAlignLast: "center",
          }}
        >
          {techniciansList.length === 0 && (
            <option value="">-- Aucun technicien --</option>
          )}
          {techniciansList.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {/* Field Mois */}
      <div className="px-0 select-none pb-2 space-y-2">
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(Number(e.target.value))}
          className="w-full bg-white text-black appearance-none transition-all duration-150 focus:outline-none focus:ring-0 focus-visible:outline-none text-center cursor-pointer"
          style={{
            border: "1px solid rgb(201, 190, 205)",
            borderRadius: "14px",
            padding: "14px 12px",
            fontSize: "18px",
            fontWeight: "bold",
            boxShadow: "none",
            outline: "none",
            textAlign: "center",
            textAlignLast: "center",
          }}
        >
          {MONTH_NAMES_FR.map((monthName, idx) => (
            <option key={monthName} value={idx}>
              {monthName} {selectedYear}
            </option>
          ))}
        </select>

        {/* Bouton Ajouter événement spontané / Enregistrer (Uniquement si un technicien est sélectionné) */}
        {Boolean(selectedTech && selectedTech.trim() !== '' && selectedTech !== 'Tous' && selectedTech !== 'Sélectionner un technicien') && (
          <>
            <button
              type="button"
              onClick={() => {
                if (isSpontaneousFormOpen) {
                  handleSaveSpontaneousEvent();
                } else {
                  setIsSpontaneousFormOpen(true);
                }
              }}
              className="w-full text-white font-bold transition-all duration-150 focus:outline-none text-center cursor-pointer flex items-center justify-center select-none"
              style={{
                backgroundColor: "rgb(22, 93, 252)",
                borderRadius: "14px",
                padding: "14px 12px",
                fontSize: "18px",
                border: "none",
                boxShadow: "none"
              }}
            >
              {isSpontaneousFormOpen ? "Enregistrer" : "Ajouter événement spontané"}
            </button>

            {/* Mini Form Evénement spontané */}
            {isSpontaneousFormOpen && (
              <div
                className="bg-white p-4 space-y-4 my-2 select-none"
                style={{
                  border: "1px solid rgb(201, 190, 205)",
                  borderRadius: "14px",
                }}
              >
                {formError && (
                  <div className="p-3 bg-red-50 text-red-600 rounded-lg text-[16px] font-semibold">
                    {formError}
                  </div>
                )}

                {/* Field 1: Date */}
                <div className="space-y-1">
                  <label className="block font-bold text-[16px] text-black">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => {
                      setFormDate(e.target.value);
                      if (formError) setFormError('');
                    }}
                    onClick={(e) => {
                      try {
                        (e.currentTarget as any).showPicker?.();
                      } catch (_) {}
                    }}
                    className="w-full bg-white text-black font-medium transition-all duration-150 focus:outline-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden cursor-pointer"
                    style={{
                      fontSize: "18px",
                      padding: "14px",
                      borderRadius: "13px",
                      border: "1px solid rgb(201, 191, 205)",
                      outline: "none",
                      color: "rgb(0, 0, 0)",
                      WebkitAppearance: "none",
                      appearance: "none",
                    }}
                  />
                </div>

                {/* Field 2: Créneau */}
                <div className="space-y-1">
                  <label className="block font-bold text-[16px] text-black">
                    Créneau <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formCreneau}
                    onChange={(e) => {
                      setFormCreneau(e.target.value);
                      if (formError) setFormError('');
                    }}
                    className="w-full bg-white text-black font-medium transition-all duration-150 focus:outline-none cursor-pointer"
                    style={{
                      fontSize: "18px",
                      padding: "14px",
                      borderRadius: "13px",
                      border: "1px solid rgb(201, 191, 205)",
                      outline: "none",
                      color: "rgb(0, 0, 0)",
                    }}
                  >
                    <option value="">Sélectionner un créneau</option>
                    {CRENEAU_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Field 3: Intitulé */}
                <div className="space-y-1">
                  <label className="block font-bold text-[16px] text-black">
                    Intitulé <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex : Réunion équipe, Formation..."
                    value={formIntitule}
                    onChange={(e) => {
                      setFormIntitule(e.target.value);
                      if (formError) setFormError('');
                    }}
                    className="w-full bg-white text-black font-medium transition-all duration-150 focus:outline-none"
                    style={{
                      fontSize: "18px",
                      padding: "14px",
                      borderRadius: "13px",
                      border: "1px solid rgb(201, 191, 205)",
                      outline: "none",
                      color: "rgb(0, 0, 0)",
                    }}
                  />
                </div>

                {/* Field 4: Commentaire */}
                <div className="space-y-1">
                  <label className="block font-bold text-[16px] text-black">
                    Commentaire <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Détails de l'événement..."
                    value={formCommentaire}
                    onChange={(e) => {
                      setFormCommentaire(e.target.value);
                      if (formError) setFormError('');
                    }}
                    className="w-full bg-white text-black font-medium transition-all duration-150 focus:outline-none"
                    style={{
                      fontSize: "18px",
                      padding: "14px",
                      borderRadius: "13px",
                      border: "1px solid rgb(201, 191, 205)",
                      outline: "none",
                      color: "rgb(0, 0, 0)",
                    }}
                  />
                </div>

                {/* Bouton Annuler */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSpontaneousFormOpen(false);
                      setFormError('');
                    }}
                    className="w-full font-bold transition-all duration-150 focus:outline-none text-center cursor-pointer select-none"
                    style={{
                      backgroundColor: "#000000",
                      borderRadius: "13px",
                      color: "#ffffff",
                      padding: "14px 20px",
                      fontSize: "18px",
                      border: "none",
                    }}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Divs "Technicien en pause" */}
      {selectedTech && selectedTech !== 'Tous' && selectedTech.trim() !== '' && (() => {
        const toursSource = (Array.isArray(fsmTours) && fsmTours.length > 0)
          ? fsmTours
          : (() => {
              try {
                const tid = localStorage.getItem("defib_tenant_id") || "demo";
                const saved = localStorage.getItem(`defib_${tid}_fsm_tours`) || localStorage.getItem("defib_fsm_tours");
                return saved ? JSON.parse(saved) : [];
              } catch {
                return [];
              }
            })();

        const pausedTours = Array.isArray(toursSource) ? toursSource.filter((t: any) => {
          if (!t) return false;
          const nameMatch = String(t.techName || '').trim().toLowerCase() === selectedTech.trim().toLowerCase();
          const isActive = t.status !== "Terminé";
          return nameMatch && isActive && (t.isPaused || t.pauseEnabled);
        }) : [];

        let showFallback = false;
        let fallbackReason = "Nuit Hôtel";
        try {
          const isLocalPaused = localStorage.getItem("defib_pause_enabled") === "true";
          fallbackReason = localStorage.getItem("defib_pause_reason") || "Nuit Hôtel";
          const activeUserRaw = localStorage.getItem("defib_active_tech_session");
          if (isLocalPaused && activeUserRaw) {
            const activeUser = JSON.parse(activeUserRaw);
            if (String(activeUser?.name || '').trim().toLowerCase() === selectedTech.trim().toLowerCase()) {
              if (pausedTours.length === 0) {
                showFallback = true;
              }
            }
          }
        } catch (_) {}

        if (pausedTours.length === 0 && !showFallback) return null;

        const distinctReasons = Array.from(new Set(
          pausedTours.map((t: any) => t.pauseReason || "Nuit Hôtel")
        ));

        return (
          <div className="space-y-3 mb-4">
            {distinctReasons.map((reason: string, idx: number) => (
              <div
                key={`paused-tour-planning-${idx}`}
                className="w-full font-bold p-4 text-[16px] text-center select-none"
                style={{
                  backgroundColor: "rgb(255, 232, 247)",
                  borderRadius: "13px",
                  color: "#fd4ebb",
                  fontSize: "16px",
                  cursor: "not-allowed",
                  border: "none",
                  boxShadow: "none",
                }}
              >
                Technicien en pause : {reason}.
              </div>
            ))}
            {showFallback && (
              <div
                key="paused-tour-planning-fallback"
                className="w-full font-bold p-4 text-[16px] text-center select-none"
                style={{
                  backgroundColor: "rgb(255, 232, 247)",
                  borderRadius: "13px",
                  color: "#fd4ebb",
                  fontSize: "16px",
                  cursor: "not-allowed",
                  border: "none",
                  boxShadow: "none",
                }}
              >
                Technicien en pause : {fallbackReason}.
              </div>
            )}
          </div>
        );
      })()}

      {/* Days List grouped by week */}
      {selectedTech && selectedTech.trim() !== '' && (
        <div className="space-y-6">
          {weeksList.map(({ weekNum, days }) => (
            <div
              key={`week-${selectedYear}-${selectedMonth}-${weekNum}`}
              className="space-y-4"
              style={{
                padding: '8px',
                border: '3px solid #410eb3',
                background: '#fff',
                borderRadius: '14px',
              }}
            >
              {/* En-tête de la semaine avec gélule S1, S2... et bouton Vue horizontale */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex items-center justify-center px-4 py-1.5 rounded-full font-bold text-white shadow-xs"
                    style={{
                      backgroundColor: '#410eb3',
                      fontSize: '18px',
                      fontFamily: "'DefibeoMain', 'Civilprom', sans-serif"
                    }}
                  >
                    S{weekNum}
                  </span>

                  {isSidePane && (
                    <button
                      type="button"
                      onClick={() => setHorizontalModalWeek({ weekNum, days })}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold text-white transition-all duration-150 select-none hover:opacity-90 active:scale-95 cursor-pointer shadow-xs"
                      style={{
                        backgroundColor: '#410eb3',
                        fontSize: '14px',
                        border: 'none',
                      }}
                      title="Afficher le planning de la semaine en vue horizontale"
                    >
                      <Columns3 className="w-4 h-4" />
                      Vue horizontale
                    </button>
                  )}
                </div>
              </div>

              {/* Jours de la semaine */}
              <div className="space-y-4">
                {days.map(({ dayNum, isoDate, dayName, isToday }) => {
                  // Absences
                  const matchingAbsences: { memberName: string; abs: MemberAbsence }[] = [];
                  const techsToCheck = selectedTech === 'Tous'
                    ? techniciansList
                    : (activeMember ? [activeMember] : []);

                  techsToCheck.forEach(m => {
                    if (m && m.absences && Array.isArray(m.absences)) {
                      m.absences.forEach(abs => {
                        if (abs && abs.startDate && abs.endDate) {
                          if (isoDate >= abs.startDate && isoDate <= abs.endDate) {
                            matchingAbsences.push({ memberName: m.name, abs });
                          }
                        }
                      });
                    }
                  });

                  // Semaine typique
                  const scheduleSlotsByTech: { memberName: string; schedule: MemberSchedule }[] = [];
                  techsToCheck.forEach(m => {
                    if (m && m.semaineTypique && Array.isArray(m.semaineTypique)) {
                      const sch = m.semaineTypique.find(s => s && s.days && Array.isArray(s.days) && s.days.includes(dayName));
                      if (sch) {
                        scheduleSlotsByTech.push({ memberName: m.name, schedule: sch });
                      }
                    }
                  });

                  // Missions
                  const dayMissions = missionsByDate[isoDate] || [];

                  // Active ongoing tours for this day
                  const dayActiveTours = activeToursByDate[isoDate] || [];

                  // Holiday for this day (if any)
                  const holidayName = holidaysMap[isoDate];

                  return (
                    <div
                      key={isoDate}
                      id={`calendar-day-${isoDate}`}
                      className="bg-white p-4 sm:p-5 space-y-4"
                      style={
                        isToday
                          ? { border: "3px solid #FD4EBB", borderRadius: "14px" }
                          : { border: "1px solid rgb(201, 190, 205)", borderRadius: "14px" }
                      }
                    >
                      {/* Day Circle & Jour férié */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div
                          className="w-12 h-12 flex items-center justify-center font-bold text-[18px] shrink-0"
                          style={
                            isToday
                              ? { borderRadius: "25px", background: "#FD4EBB", color: "rgb(255, 255, 255)" }
                              : { borderRadius: "25px", background: "rgb(255, 233, 247)", color: "rgb(253, 78, 187)" }
                          }
                        >
                          {dayNum}
                        </div>

                        {holidayName && (
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className="px-3.5 py-1.5 rounded-full bg-black text-white font-medium text-[16px] inline-flex items-center max-w-full min-w-0 select-none"
                              title={`Jour férié : ${holidayName}`}
                            >
                              <span className="shrink-0 whitespace-nowrap">Jour férié :&nbsp;</span>
                              <span className="truncate whitespace-nowrap">{holidayName}</span>
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Tournée(s) en cours ce jour (sans border/padding/background, texte en rose) */}
                      {dayActiveTours.length > 0 && (
                        <div className="space-y-1">
                          {dayActiveTours.map((tItem, idx) => (
                            <div
                              key={`day-tour-${tItem.tourId}-${idx}`}
                              className="flex items-center gap-2 text-[16px] font-bold"
                              style={{ color: "#FD4EBB" }}
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: "#FD4EBB" }}
                              />
                              <span>
                                Tournée : {tItem.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Schedules / Absences Plages */}
                      {matchingAbsences.map(({ abs }, aIdx) => (
                        <div
                          key={`abs-${aIdx}`}
                          className="bg-white p-3 space-y-2"
                          style={{
                            border: "1px solid rgb(201, 190, 205)",
                            borderRadius: "14px",
                          }}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-3.5 py-1.5 rounded-full bg-black text-white font-medium text-[16px]">
                              Indisponible
                            </span>
                          </div>
                          {abs.commentaire && (
                            <div className="text-[16px] text-black" style={{ color: "#000", fontSize: "16px" }}>
                              {abs.commentaire}
                            </div>
                          )}
                        </div>
                      ))}

                      {scheduleSlotsByTech.map(({ schedule }, sIdx) => {
                        const slotText = schedule.fermetureMidi
                          ? `${schedule.openMorning || '09:00'} - ${schedule.closeMorning || '12:00'} / ${schedule.openAfternoon || '14:00'} - ${schedule.closeAfternoon || '18:00'}`
                          : `${schedule.openContinuous || '09:00'} - ${schedule.closeContinuous || '17:00'}`;

                        return (
                          <div
                            key={`sch-${sIdx}`}
                            className="bg-white p-3 space-y-2"
                            style={{
                              border: "1px solid rgb(201, 190, 205)",
                              borderRadius: "14px",
                            }}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-3.5 py-1.5 rounded-full bg-black text-white font-medium text-[16px]">
                                {slotText}
                              </span>
                            </div>
                            {schedule.commentaire && (
                              <div className="text-[16px] text-black" style={{ color: "#000", fontSize: "16px" }}>
                                {schedule.commentaire}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Événements spontanés */}
                      {(() => {
                        const daySpontaneousEvents = spontaneousEvents.filter((evt) => {
                          if (!evt) return false;
                          const evtIso = toIsoDateStr(evt.date);
                          if (!evtIso || evtIso !== isoDate) return false;
                          if (!selectedTech || selectedTech === 'Tous') return true;
                          const evtTech = String(evt.techName || '').trim().toLowerCase();
                          const selTech = selectedTech.trim().toLowerCase();
                          return evtTech === selTech || evtTech.includes(selTech) || selTech.includes(evtTech);
                        });

                        return daySpontaneousEvents.map((evt) => (
                          <div
                            key={evt.id}
                            className="bg-white p-4 space-y-3"
                            style={{
                              border: "1px solid rgb(201, 190, 205)",
                              borderRadius: "14px",
                            }}
                          >
                            {/* Gélules Créneau, Badge + Bouton Supprimer */}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                                <span className="px-3.5 py-1.5 rounded-full bg-black text-white font-bold text-[16px] inline-flex items-center shrink-0 whitespace-nowrap">
                                  Événement spontané
                                </span>
                                <span
                                  className="px-3.5 py-1.5 rounded-full bg-black text-white font-medium text-[16px] inline-flex items-center max-w-full min-w-0"
                                  title={`Créneau : ${evt.creneau}`}
                                >
                                  <span className="shrink-0 whitespace-nowrap">Créneau :&nbsp;</span>
                                  <span className="truncate whitespace-nowrap">{evt.creneau}</span>
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleDeleteSpontaneousEvent(evt.id)}
                                style={{
                                  boxShadow: "rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.29) 0px 6px 12px inset",
                                  color: "rgb(255, 255, 255)",
                                  background: "rgb(212 10 10)",
                                  borderRadius: "13px",
                                  padding: "10px 18px",
                                  fontSize: "18px",
                                  fontWeight: 700,
                                  border: "none",
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "6px",
                                }}
                                className="w-full sm:w-auto mx-0 sm:ml-10 sm:mr-2.5 shrink-0 select-none"
                              >
                                Supprimer
                              </button>
                            </div>

                            {/* Details */}
                            <div className="space-y-1.5 text-[16px] text-black pt-1" style={{ color: "#000", fontSize: "16px" }}>
                              <div>
                                <span className="font-bold">Intitulé : </span>
                                <span>{evt.intitule}</span>
                              </div>
                              <div>
                                <span className="font-bold">Commentaire : </span>
                                <span className="whitespace-pre-wrap">{evt.commentaire}</span>
                              </div>
                            </div>
                          </div>
                        ));
                      })()}

                      {/* Missions */}
                      {dayMissions.map(({ tour, mission }, mIdx) => {
                        if (!mission || !tour) return null;
                        // Find associated equipment & client
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

                        const tourTitle = tour.title || tour.name || 'Tournée';

                        const clientName =
                          mission.clientDenomination ||
                          mission.client ||
                          clientObj?.denomination ||
                          mission.clientName ||
                          defib?.exploitant ||
                          defib?.nomPrenomSite ||
                          '';

                        const eqTypeStr = String(mission.equipmentType || '');
                        const reasonStr = String(mission.reason || '');
                        const defibIdentStr = String(mission.defibIdentifiant || '');

                        const isFormationMission =
                          eqTypeStr === 'Formation' ||
                          eqTypeStr.toLowerCase().includes('formation') ||
                          Boolean(mission.formationId) ||
                          reasonStr.toLowerCase().includes('formation') ||
                          defibIdentStr === 'Formation';

                        const typeVal = isFormationMission
                          ? 'Formation'
                          : (mission.equipmentType || (defib ? 'Défibrillateur' : (other ? other.categorie : 'Défibrillateur')));

                        const situationVal = mission.status || mission.missionStatus || mission.situation || 'À faire';

                        const identifiant = (() => {
                          if (isFormationMission) {
                            if (mission.formationId) return String(mission.formationId);
                            if (mission.interventionReference) return String(mission.interventionReference);
                            if (
                              defibIdentStr &&
                              defibIdentStr !== 'Formation' &&
                              defibIdentStr !== reasonStr &&
                              !defibIdentStr.toLowerCase().includes('formation')
                            ) {
                              return defibIdentStr;
                            }
                            return String(mission.id || 'FMT-001');
                          }
                          return String(
                            mission.defibIdentifiant ||
                            mission.identifiant ||
                            defib?.identifiant ||
                            other?.identifiant ||
                            ''
                          );
                        })();

                        const siteName = (() => {
                          if (isFormationMission) return '';
                          let rawVal = '';
                          if (defib) {
                            rawVal = defib.nomSite || '';
                          } else if (other) {
                            rawVal = other.nomPrenomSite || other.nomSite || '';
                          } else if (mission.site || mission.siteName) {
                            rawVal = mission.site || mission.siteName || '';
                          }
                          if (
                            !rawVal ||
                            rawVal === 'Représentant Standard' ||
                            rawVal === 'Représentant standard' ||
                            rawVal === 'Non renseigné' ||
                            rawVal === 'Nom du Site'
                          ) {
                            return '';
                          }
                          return rawVal;
                        })();

                        const locationStr = (() => {
                          if (mission.ville) {
                            return `${mission.ville}${mission.codePostal ? ` (${mission.codePostal})` : ''}`;
                          }
                          if (defib) {
                            const parts = [defib.numVoie, defib.cp, defib.ville].filter(Boolean);
                            if (parts.length > 0) return parts.join(', ');
                          }
                          if (other) {
                            const parts = [other.numeroVoie, other.codePostal, other.ville].filter(Boolean);
                            if (parts.length > 0) return parts.join(', ');
                          }
                          if (mission.address) return String(mission.address);
                          if (clientObj) {
                            const parts = [clientObj.adresse, clientObj.codePostal, clientObj.ville].filter(Boolean);
                            if (parts.length > 0) return parts.join(', ');
                          }
                          return '';
                        })();

                        const creneauVal = mission.estimatedSlot || mission.creneau || mission.estimatedTime || mission.time || '08:00';
                        const missionKey = `plan-${tour.id || 'tour'}-${mission.id || mIdx}`;
                        const isExpanded = !!expandedMissions[missionKey];

                        return (
                          <div
                            key={`m-${mIdx}`}
                            className="bg-white p-4 space-y-3"
                            style={{
                              border: "1px solid rgb(201, 190, 205)",
                              borderRadius: "14px",
                            }}
                          >
                            {/* Gélules Client, Créneau, Type et Situation & Bouton Dérouler / Réduire */}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                                {/* Gélule 1 : Client */}
                                <span
                                  className="px-3.5 py-1.5 rounded-full bg-black text-white font-medium text-[16px] inline-flex items-center max-w-full min-w-0"
                                  title={`Client : ${clientName || 'NC'}`}
                                >
                                  <span className="shrink-0 whitespace-nowrap">Client :&nbsp;</span>
                                  <span className="truncate whitespace-nowrap">{clientName || 'NC'}</span>
                                </span>

                                {/* Gélule 2 : Créneau */}
                                <span
                                  className="px-3.5 py-1.5 rounded-full bg-black text-white font-medium text-[16px] inline-flex items-center max-w-full min-w-0"
                                  title={`Créneau : ${creneauVal}`}
                                >
                                  <span className="shrink-0 whitespace-nowrap">Créneau :&nbsp;</span>
                                  <span className="truncate whitespace-nowrap">{creneauVal}</span>
                                </span>

                                {/* Gélule 3 : Type */}
                                <span
                                  className="px-3.5 py-1.5 rounded-full bg-black text-white font-medium text-[16px] inline-flex items-center max-w-full min-w-0"
                                  title={`Type : ${typeVal}`}
                                >
                                  <span className="shrink-0 whitespace-nowrap">Type :&nbsp;</span>
                                  <span className="truncate whitespace-nowrap">{typeVal}</span>
                                </span>

                                {/* Gélule 4 : Situation */}
                                <span
                                  className="px-3.5 py-1.5 rounded-full bg-black text-white font-medium text-[16px] inline-flex items-center max-w-full min-w-0"
                                  title={`Situation : ${situationVal}`}
                                >
                                  <span className="shrink-0 whitespace-nowrap">Situation :&nbsp;</span>
                                  <span className="truncate whitespace-nowrap">{situationVal}</span>
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => toggleMissionExpanded(missionKey)}
                                style={{
                                  color: "rgb(255, 255, 255)",
                                  background: "rgb(20, 87, 236)",
                                  boxShadow: "rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgb(255 255 255 / 29%) 0px 6px 12px inset",
                                  padding: "10px 20px",
                                  fontSize: "18px",
                                  border: "none",
                                  borderRadius: "13px",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "6px"
                                }}
                                className="w-full sm:w-auto mx-0 sm:ml-10 sm:mr-2.5 shrink-0 select-none"
                              >
                                {isExpanded ? "Réduire" : "Dérouler"}
                              </button>
                            </div>

                            {/* Details (Déroulés si actif) */}
                            {isExpanded && (
                              <div className="space-y-1.5 text-[16px] text-black pt-2" style={{ color: "#000", fontSize: "16px" }}>
                                <div>
                                  <span className="font-bold">Tournée : </span>
                                  <span>{tourTitle}</span>
                                </div>
                                <div>
                                  <span className="font-bold">Site : </span>
                                  <span>{siteName}</span>
                                </div>
                                <div>
                                  <span className="font-bold">Localisation : </span>
                                  <span>{locationStr}</span>
                                </div>
                                <div>
                                  <span className="font-bold">Identifiant : </span>
                                  <span>{identifiant}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}


      {/* Modal Popup Plein Écran - Vue Horizontale de la Semaine (Consultative) */}
      {horizontalModalWeek && (() => {
        const fullWeekDays = (() => {
          if (!horizontalModalWeek.days || horizontalModalWeek.days.length === 0) return [];
          const refDate = new Date(horizontalModalWeek.days[0].dateObj || horizontalModalWeek.days[0].isoDate);
          const dayOfWeek = refDate.getDay(); // 0 is Sunday, 1 is Monday ...
          const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          const monday = new Date(refDate);
          monday.setDate(refDate.getDate() + diffToMonday);

          const result = [];
          for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            const yearStr = d.getFullYear();
            const monthStr = String(d.getMonth() + 1).padStart(2, '0');
            const dayStr = String(d.getDate()).padStart(2, '0');
            const isoDate = `${yearStr}-${monthStr}-${dayStr}`;
            const dayName = DAY_NAMES_FR[d.getDay()];
            const isToday =
              d.getFullYear() === today.getFullYear() &&
              d.getMonth() === today.getMonth() &&
              d.getDate() === today.getDate();
            const weekNum = getISOWeekNumber(d);

            result.push({
              dayNum: d.getDate(),
              dateObj: d,
              isoDate,
              dayName,
              isToday,
              weekNum,
              monthName: MONTH_NAMES_FR[d.getMonth()],
              year: d.getFullYear()
            });
          }
          return result;
        })();

        const startDateLabel = fullWeekDays[0]
          ? `${fullWeekDays[0].dayNum} ${fullWeekDays[0].monthName}`
          : '';
        const endDateLabel = fullWeekDays[6]
          ? `${fullWeekDays[6].dayNum} ${fullWeekDays[6].monthName} ${fullWeekDays[6].year}`
          : '';

        return (
          <div
            className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-fade-in"
            onClick={() => setHorizontalModalWeek(null)}
          >
            <div
              className="w-full h-full max-w-[98vw] max-h-[96vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header Modal */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-white shrink-0">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className="inline-flex items-center justify-center px-4 py-1.5 rounded-full font-bold text-white shadow-xs"
                    style={{
                      backgroundColor: '#410eb3',
                      fontSize: '18px',
                      fontFamily: "'DefibeoMain', 'Civilprom', sans-serif"
                    }}
                  >
                    S{horizontalModalWeek.weekNum}
                  </span>
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-xl font-bold text-slate-900 leading-tight">
                        Planning Semaine {horizontalModalWeek.weekNum} (Vue horizontale)
                      </h2>
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                        Consultatif
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-500 font-medium mt-0.5 flex-wrap">
                      {startDateLabel && endDateLabel && (
                        <span>Du {startDateLabel} au {endDateLabel}</span>
                      )}
                      {selectedTech && (
                        <>
                          <span>•</span>
                          <span className="font-semibold text-slate-700">Technicien : {selectedTech}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setHorizontalModalWeek(null)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-black text-white font-bold text-[15px] cursor-pointer transition-all hover:bg-slate-800 active:scale-95 shadow-xs"
                  >
                    <X className="w-4 h-4" />
                    Fermer
                  </button>
                </div>
              </div>

              {/* Body Modal - Grille Horizontale 7 colonnes (1 colonne par jour) */}
              <div className="flex-1 overflow-x-auto overflow-y-auto p-4 bg-slate-100/70">
                <div className="grid grid-cols-7 gap-3 min-w-[1250px] h-full items-start">
                  {fullWeekDays.map(({ dayNum, isoDate, dayName, isToday, monthName }) => {
                    // Absences
                    const matchingAbsences: { memberName: string; abs: MemberAbsence }[] = [];
                    const techsToCheck = selectedTech === 'Tous'
                      ? techniciansList
                      : (activeMember ? [activeMember] : []);

                    techsToCheck.forEach(m => {
                      if (m && m.absences && Array.isArray(m.absences)) {
                        m.absences.forEach(abs => {
                          if (abs && abs.startDate && abs.endDate) {
                            if (isoDate >= abs.startDate && isoDate <= abs.endDate) {
                              matchingAbsences.push({ memberName: m.name, abs });
                            }
                          }
                        });
                      }
                    });

                    // Semaine typique
                    const scheduleSlotsByTech: { memberName: string; schedule: MemberSchedule }[] = [];
                    techsToCheck.forEach(m => {
                      if (m && m.semaineTypique && Array.isArray(m.semaineTypique)) {
                        const sch = m.semaineTypique.find(s => s && s.days && Array.isArray(s.days) && s.days.includes(dayName));
                        if (sch) {
                          scheduleSlotsByTech.push({ memberName: m.name, schedule: sch });
                        }
                      }
                    });

                    // Missions
                    const dayMissions = missionsByDate[isoDate] || [];

                    // Active ongoing tours for this day
                    const dayActiveTours = activeToursByDate[isoDate] || [];

                    // Holiday
                    const holidayCheck = isHolidayDate(isoDate, undefined, companyInfo);
                    const holidayName = holidaysMap[isoDate] || (holidayCheck.isHoliday ? holidayCheck.holidayName : undefined);

                    // Événements spontanés
                    const daySpontaneousEvents = spontaneousEvents.filter((evt) => {
                      if (!evt) return false;
                      const evtIso = toIsoDateStr(evt.date);
                      if (!evtIso || evtIso !== isoDate) return false;
                      if (!selectedTech || selectedTech === 'Tous') return true;
                      const evtTech = String(evt.techName || '').trim().toLowerCase();
                      const selTech = selectedTech.trim().toLowerCase();
                      return evtTech === selTech || evtTech.includes(selTech) || selTech.includes(evtTech);
                    });

                    const totalItemsCount =
                      matchingAbsences.length +
                      scheduleSlotsByTech.length +
                      daySpontaneousEvents.length +
                      dayMissions.length;

                    return (
                      <div
                        key={`h-col-${isoDate}`}
                        className="bg-white p-3.5 space-y-3 flex flex-col min-h-[550px] shadow-xs"
                        style={
                          isToday
                            ? { border: '3px solid #FD4EBB', borderRadius: '14px' }
                            : { border: '1px solid rgb(201, 190, 205)', borderRadius: '14px' }
                        }
                      >
                        {/* En-tête de la colonne jour */}
                        <div className="space-y-2 pb-2 border-b border-slate-100">
                          <div className="flex items-center justify-between gap-2">
                            <div
                              className="w-10 h-10 flex items-center justify-center font-bold text-[16px] shrink-0"
                              style={
                                isToday
                                  ? { borderRadius: '20px', background: '#FD4EBB', color: 'rgb(255, 255, 255)' }
                                  : { borderRadius: '20px', background: 'rgb(255, 233, 247)', color: 'rgb(253, 78, 187)' }
                              }
                            >
                              {dayNum}
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-[15px] text-slate-900 leading-tight">
                                {dayName}
                              </div>
                              <div className="text-[12px] text-slate-500 font-medium">
                                {dayNum} {monthName}
                              </div>
                            </div>
                          </div>

                          {/* Jour férié */}
                          {holidayName && (
                            <div className="w-full">
                              <span
                                className="w-full px-2.5 py-1 rounded-full bg-black text-white font-medium text-[12px] inline-flex items-center select-none"
                                title={`Jour férié : ${holidayName}`}
                              >
                                <span className="shrink-0 whitespace-nowrap">Jour férié :&nbsp;</span>
                                <span className="truncate whitespace-nowrap">{holidayName}</span>
                              </span>
                            </div>
                          )}

                          {/* Tournée(s) active(s) */}
                          {dayActiveTours.length > 0 && (
                            <div className="space-y-0.5 pt-0.5">
                              {dayActiveTours.map((tItem, idx) => (
                                <div
                                  key={`h-day-tour-${tItem.tourId}-${idx}`}
                                  className="flex items-center gap-1.5 text-[12px] font-bold leading-snug"
                                  style={{ color: '#FD4EBB' }}
                                >
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: '#FD4EBB' }}
                                  />
                                  <span className="truncate">
                                    Tournée : {tItem.title}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Contenu vertical de la colonne jour */}
                        <div className="space-y-2.5 flex-1 overflow-y-auto pr-0.5">
                          {/* Absences */}
                          {matchingAbsences.map(({ abs }, aIdx) => (
                            <div
                              key={`h-abs-${aIdx}`}
                              className="bg-white p-2.5 space-y-1.5"
                              style={{
                                border: '1px solid rgb(201, 190, 205)',
                                borderRadius: '12px',
                              }}
                            >
                              <span className="px-2.5 py-1 rounded-full bg-black text-white font-medium text-[12px] inline-block">
                                Indisponible
                              </span>
                              {abs.commentaire && (
                                <div className="text-[13px] text-slate-800 leading-snug">
                                  {abs.commentaire}
                                </div>
                              )}
                            </div>
                          ))}

                          {/* Horaires semaine typique */}
                          {scheduleSlotsByTech.map(({ schedule }, sIdx) => {
                            const slotText = schedule.fermetureMidi
                              ? `${schedule.openMorning || '09:00'} - ${schedule.closeMorning || '12:00'} / ${schedule.openAfternoon || '14:00'} - ${schedule.closeAfternoon || '18:00'}`
                              : `${schedule.openContinuous || '09:00'} - ${schedule.closeContinuous || '17:00'}`;

                            return (
                              <div
                                key={`h-sch-${sIdx}`}
                                className="bg-white p-2.5 space-y-1.5"
                                style={{
                                  border: '1px solid rgb(201, 190, 205)',
                                  borderRadius: '12px',
                                }}
                              >
                                <span className="px-2.5 py-1 rounded-full bg-black text-white font-medium text-[12px] inline-block">
                                  {slotText}
                                </span>
                                {schedule.commentaire && (
                                  <div className="text-[13px] text-slate-800 leading-snug">
                                    {schedule.commentaire}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* Événements spontanés */}
                          {daySpontaneousEvents.map((evt) => (
                            <div
                              key={`h-evt-${evt.id}`}
                              className="bg-white p-2.5 space-y-2"
                              style={{
                                border: '1px solid rgb(201, 190, 205)',
                                borderRadius: '12px',
                              }}
                            >
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="px-2.5 py-0.5 rounded-full bg-black text-white font-bold text-[12px]">
                                  Événement
                                </span>
                                <span className="px-2.5 py-0.5 rounded-full bg-black text-white font-medium text-[12px]">
                                  {evt.creneau}
                                </span>
                              </div>
                              <div className="space-y-1 text-[13px] text-black">
                                <div>
                                  <span className="font-bold">Intitulé : </span>
                                  <span>{evt.intitule}</span>
                                </div>
                                {evt.commentaire && (
                                  <div>
                                    <span className="font-bold">Commentaire : </span>
                                    <span className="whitespace-pre-wrap">{evt.commentaire}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}

                          {/* Missions */}
                          {dayMissions.map(({ tour, mission }, mIdx) => {
                            if (!mission || !tour) return null;
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

                            const tourTitle = tour.title || tour.name || 'Tournée';

                            const clientName =
                              mission.clientDenomination ||
                              mission.client ||
                              clientObj?.denomination ||
                              mission.clientName ||
                              defib?.exploitant ||
                              defib?.nomPrenomSite ||
                              '';

                            const eqTypeStr = String(mission.equipmentType || '');
                            const reasonStr = String(mission.reason || '');
                            const defibIdentStr = String(mission.defibIdentifiant || '');

                            const isFormationMission =
                              eqTypeStr === 'Formation' ||
                              eqTypeStr.toLowerCase().includes('formation') ||
                              Boolean(mission.formationId) ||
                              reasonStr.toLowerCase().includes('formation') ||
                              defibIdentStr === 'Formation';

                            const typeVal = isFormationMission
                              ? 'Formation'
                              : (mission.equipmentType || (defib ? 'Défibrillateur' : (other ? other.categorie : 'Défibrillateur')));

                            const situationVal = mission.status || mission.missionStatus || mission.situation || 'À faire';

                            const identifiant = (() => {
                              if (isFormationMission) {
                                if (mission.formationId) return String(mission.formationId);
                                if (mission.interventionReference) return String(mission.interventionReference);
                                if (
                                  defibIdentStr &&
                                  defibIdentStr !== 'Formation' &&
                                  defibIdentStr !== reasonStr &&
                                  !defibIdentStr.toLowerCase().includes('formation')
                                ) {
                                  return defibIdentStr;
                                }
                                return String(mission.id || 'FMT-001');
                              }
                              return String(
                                mission.defibIdentifiant ||
                                mission.identifiant ||
                                defib?.identifiant ||
                                other?.identifiant ||
                                ''
                              );
                            })();

                            const siteName = (() => {
                              if (isFormationMission) return '';
                              let rawVal = '';
                              if (defib) {
                                rawVal = defib.nomSite || '';
                              } else if (other) {
                                rawVal = other.nomPrenomSite || other.nomSite || '';
                              } else if (mission.site || mission.siteName) {
                                rawVal = mission.site || mission.siteName || '';
                              }
                              if (
                                !rawVal ||
                                rawVal === 'Représentant Standard' ||
                                rawVal === 'Représentant standard' ||
                                rawVal === 'Non renseigné' ||
                                rawVal === 'Nom du Site'
                              ) {
                                return '';
                              }
                              return rawVal;
                            })();

                            const locationStr = (() => {
                              if (mission.ville) {
                                return `${mission.ville}${mission.codePostal ? ` (${mission.codePostal})` : ''}`;
                              }
                              if (defib) {
                                const parts = [defib.numVoie, defib.cp, defib.ville].filter(Boolean);
                                if (parts.length > 0) return parts.join(', ');
                              }
                              if (other) {
                                const parts = [other.numeroVoie, other.codePostal, other.ville].filter(Boolean);
                                if (parts.length > 0) return parts.join(', ');
                              }
                              if (mission.address) return String(mission.address);
                              if (clientObj) {
                                const parts = [clientObj.adresse, clientObj.codePostal, clientObj.ville].filter(Boolean);
                                if (parts.length > 0) return parts.join(', ');
                              }
                              return '';
                            })();

                            const creneauVal = mission.estimatedSlot || mission.creneau || mission.estimatedTime || mission.time || '08:00';

                            return (
                              <div
                                key={`h-m-${mIdx}`}
                                className="bg-white p-2.5 space-y-2 shadow-2xs"
                                style={{
                                  border: '1px solid rgb(201, 190, 205)',
                                  borderRadius: '12px',
                                }}
                              >
                                {/* Gélules */}
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    className="px-2.5 py-0.5 rounded-full bg-black text-white font-medium text-[12px] inline-flex items-center max-w-full min-w-0"
                                    title={`Client : ${clientName || 'NC'}`}
                                  >
                                    <span className="shrink-0 whitespace-nowrap">Client :&nbsp;</span>
                                    <span className="truncate whitespace-nowrap">{clientName || 'NC'}</span>
                                  </span>

                                  <span
                                    className="px-2.5 py-0.5 rounded-full bg-black text-white font-medium text-[12px] inline-flex items-center max-w-full min-w-0"
                                    title={`Créneau : ${creneauVal}`}
                                  >
                                    <span className="shrink-0 whitespace-nowrap">Créneau :&nbsp;</span>
                                    <span className="truncate whitespace-nowrap">{creneauVal}</span>
                                  </span>

                                  <span
                                    className="px-2.5 py-0.5 rounded-full bg-black text-white font-medium text-[12px] inline-flex items-center max-w-full min-w-0"
                                    title={`Type : ${typeVal}`}
                                  >
                                    <span className="shrink-0 whitespace-nowrap">Type :&nbsp;</span>
                                    <span className="truncate whitespace-nowrap">{typeVal}</span>
                                  </span>

                                  <span
                                    className="px-2.5 py-0.5 rounded-full bg-black text-white font-medium text-[12px] inline-flex items-center max-w-full min-w-0"
                                    title={`Situation : ${situationVal}`}
                                  >
                                    <span className="shrink-0 whitespace-nowrap">Situation :&nbsp;</span>
                                    <span className="truncate whitespace-nowrap">{situationVal}</span>
                                  </span>
                                </div>

                                {/* Détails consultatifs */}
                                <div className="space-y-1 text-[13px] text-black pt-1 border-t border-slate-100">
                                  <div>
                                    <span className="font-bold">Tournée : </span>
                                    <span>{tourTitle}</span>
                                  </div>
                                  {siteName && (
                                    <div>
                                      <span className="font-bold">Site : </span>
                                      <span>{siteName}</span>
                                    </div>
                                  )}
                                  {locationStr && (
                                    <div>
                                      <span className="font-bold">Localisation : </span>
                                      <span>{locationStr}</span>
                                    </div>
                                  )}
                                  {identifiant && (
                                    <div>
                                      <span className="font-bold">Identifiant : </span>
                                      <span>{identifiant}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {/* Si aucun événement ni mission */}
                          {totalItemsCount === 0 && (
                            <div className="py-12 text-center text-slate-400 text-[13px] font-sans italic">
                              Aucune intervention
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Floating Button "Remonter" when header is not visible (>200px scroll) */}
      {showScrollTop && (
        <div className="fixed bottom-4 right-4 sm:bottom-4 sm:right-6 z-40 animate-fade-in">
          <button
            type="button"
            onClick={handleScrollToTop}
            className="text-white font-bold transition-all duration-150 focus:outline-none text-center cursor-pointer flex items-center justify-center select-none hover:opacity-95 active:scale-95"
            style={{
              backgroundColor: "rgb(20 87 236)",
              boxShadow: "rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgb(255 255 255 / 29%) 0px 6px 12px inset",
              borderRadius: "13px",
              padding: "10px 20px",
              fontSize: "18px",
              border: "none",
            }}
          >
            {t("Remonter")}
          </button>
        </div>
      )}
    </div>
  );
};
