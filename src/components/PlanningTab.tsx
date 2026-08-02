import React, { useState, useMemo, useEffect } from 'react';
import { CompanyInfo, Member, MemberSchedule, MemberAbsence } from '../types';
import { saveCollectionToFirestore } from '../firebase';

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
}

const MONTH_NAMES_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

const DAY_NAMES_FR = [
  'Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'
];

const getFormattedDateFR = (dateStr?: string) => {
  if (!dateStr || dateStr === 'A trier') return '';
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      } else if (parts[2].length === 4) {
        return `${parts[0]}/${parts[1]}/${parts[2]}`;
      }
    }
  }
  return dateStr;
};

const toIsoDateStr = (rawDate?: string) => {
  if (!rawDate || rawDate === 'A trier') return '';
  if (rawDate.includes('-')) {
    const parts = rawDate.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) return rawDate;
      if (parts[2].length === 4) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  return rawDate;
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
  initialTech
}) => {
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth());
  const [selectedTech, setSelectedTech] = useState<string>(
    initialTech !== undefined ? initialTech : (authenticatedUser?.name || 'Tous')
  );
  const [expandedMissions, setExpandedMissions] = useState<Record<string, boolean>>({});

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
    const loadEvents = () => {
      try {
        const tid = localStorage.getItem('defib_tenant_id') || 'demo';
        const saved = localStorage.getItem(`defib_${tid}_spontaneous_events`) || localStorage.getItem('defib_spontaneous_events');
        if (saved) {
          setSpontaneousEvents(JSON.parse(saved));
        } else {
          setSpontaneousEvents([]);
        }
      } catch (e) {
        console.error(e);
      }
    };

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

  const toggleMissionExpanded = (key: string) => {
    setExpandedMissions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // List of technician members only
  const techniciansList = useMemo(() => {
    const all = members && members.length > 0 ? members : (companyInfo?.members || []);
    const techOnly = all.filter(m => {
      const r = (m.role || '').toLowerCase();
      return r.includes('tech') || r.includes('technicien');
    });
    return techOnly.length > 0 ? techOnly : all;
  }, [members, companyInfo]);

  // Default selected technician
  useEffect(() => {
    if (initialTech !== undefined) {
      setSelectedTech(initialTech);
    } else if (authenticatedUser?.name) {
      setSelectedTech(authenticatedUser.name);
    }
  }, [initialTech, authenticatedUser]);

  // Active member object
  const activeMember = useMemo(() => {
    if (selectedTech === 'Tous') {
      return authenticatedUser || null;
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

    fsmTours.forEach(tour => {
      if (selectedTech !== 'Tous') {
        const tourTech = (tour.techName || '').trim().toLowerCase();
        const selTech = selectedTech.trim().toLowerCase();
        if (tourTech !== selTech) return;
      }

      const tourMissions = tour.missions || tour.passages || [];
      if (!Array.isArray(tourMissions)) return;

      tourMissions.forEach((m: any) => {
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

    return map;
  }, [fsmTours, selectedTech]);

  // Auto-scroll to today's date card on load
  useEffect(() => {
    const yearStr = today.getFullYear();
    const monthStr = String(today.getMonth() + 1).padStart(2, '0');
    const dayStr = String(today.getDate()).padStart(2, '0');
    const todayIso = `${yearStr}-${monthStr}-${dayStr}`;

    const timer = setTimeout(() => {
      const todayEl = document.getElementById(`calendar-day-${todayIso}`);
      if (todayEl) {
        todayEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [selectedMonth, selectedYear]);

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
          <option value="">-- Sélectionner un technicien --</option>
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

        {/* Bouton Ajouter événement spontané / Enregistrer */}
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
                  border: "1px solid rgb(201, 190, 205)",
                  borderRadius: "14px",
                  padding: "12px 14px",
                  fontSize: "16px",
                  WebkitAppearance: "none",
                  appearance: "none",
                }}
                required
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
                className="w-full bg-white text-black font-medium appearance-none transition-all duration-150 focus:outline-none cursor-pointer"
                style={{
                  border: "1px solid rgb(201, 190, 205)",
                  borderRadius: "14px",
                  padding: "12px 14px",
                  fontSize: "16px",
                }}
                required
              >
                <option value="">-- Sélectionner un créneau --</option>
                {CRENEAU_OPTIONS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
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
                value={formIntitule}
                onChange={(e) => {
                  setFormIntitule(e.target.value);
                  if (formError) setFormError('');
                }}
                placeholder="Saisir l'intitulé"
                className="w-full bg-white text-black font-medium transition-all duration-150 focus:outline-none"
                style={{
                  border: "1px solid rgb(201, 190, 205)",
                  borderRadius: "14px",
                  padding: "12px 14px",
                  fontSize: "16px",
                }}
                required
              />
            </div>

            {/* Field 4: Commentaire */}
            <div className="space-y-1">
              <label className="block font-bold text-[16px] text-black">
                Commentaire <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formCommentaire}
                onChange={(e) => {
                  setFormCommentaire(e.target.value);
                  if (formError) setFormError('');
                }}
                placeholder="Saisir un commentaire"
                rows={3}
                className="w-full bg-white text-black font-medium transition-all duration-150 focus:outline-none resize-y"
                style={{
                  border: "1px solid rgb(201, 190, 205)",
                  borderRadius: "14px",
                  padding: "12px 14px",
                  fontSize: "16px",
                }}
                required
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsSpontaneousFormOpen(false);
                  setFormError('');
                }}
                className="text-slate-500 hover:text-slate-800 font-semibold text-[16px] underline cursor-pointer"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Divs "Technicien en pause" */}
      {selectedTech && selectedTech !== 'Tous' && selectedTech.trim() !== '' && (() => {
        const toursSource = (fsmTours && fsmTours.length > 0)
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

        const pausedTours = toursSource.filter((t: any) => {
          const nameMatch = (t.techName || '').trim().toLowerCase() === selectedTech.trim().toLowerCase();
          return nameMatch && (t.isPaused || t.pauseEnabled);
        });

        let showFallback = false;
        let fallbackReason = "Nuit Hôtel";
        try {
          const isLocalPaused = localStorage.getItem("defib_pause_enabled") === "true";
          fallbackReason = localStorage.getItem("defib_pause_reason") || "Nuit Hôtel";
          const activeUserRaw = localStorage.getItem("defib_active_tech_session");
          if (isLocalPaused && activeUserRaw) {
            const activeUser = JSON.parse(activeUserRaw);
            if ((activeUser?.name || '').trim().toLowerCase() === selectedTech.trim().toLowerCase()) {
              if (pausedTours.length === 0) {
                showFallback = true;
              }
            }
          }
        } catch (_) {}

        if (pausedTours.length === 0 && !showFallback) return null;

        return (
          <div className="space-y-3 mb-4">
            {pausedTours.map((tour: any) => (
              <div
                key={`paused-tour-planning-${tour.id}`}
                className="w-full text-white font-bold p-4 text-[18px] text-center select-none"
                style={{
                  backgroundColor: "rgb(220, 38, 38)",
                  borderRadius: "14px",
                }}
              >
                Technicien en pause : {tour.pauseReason || "Nuit Hôtel"}.
              </div>
            ))}
            {showFallback && (
              <div
                key="paused-tour-planning-fallback"
                className="w-full text-white font-bold p-4 text-[18px] text-center select-none"
                style={{
                  backgroundColor: "rgb(220, 38, 38)",
                  borderRadius: "14px",
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
              {/* En-tête de la semaine avec gélule S1, S2... */}
              <div className="flex items-center gap-2">
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
                    if (m.absences && Array.isArray(m.absences)) {
                      m.absences.forEach(abs => {
                        if (abs.startDate && abs.endDate) {
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
                    if (m.semaineTypique && Array.isArray(m.semaineTypique)) {
                      const sch = m.semaineTypique.find(s => s.days && s.days.includes(dayName));
                      if (sch) {
                        scheduleSlotsByTech.push({ memberName: m.name, schedule: sch });
                      }
                    }
                  });

                  // Missions
                  const dayMissions = missionsByDate[isoDate] || [];

                  return (
                    <div
                      key={isoDate}
                      id={`calendar-day-${isoDate}`}
                      className="bg-white p-4 sm:p-5 space-y-4"
                      style={
                        isToday
                          ? { border: "3px solid rgb(22, 93, 252)", borderRadius: "14px" }
                          : { border: "1px solid rgb(201, 190, 205)", borderRadius: "14px" }
                      }
                    >
                      {/* Day Circle */}
                      <div className="flex items-center">
                        <div
                          className="w-12 h-12 flex items-center justify-center font-bold text-[18px]"
                          style={
                            isToday
                              ? { borderRadius: "25px", background: "#FD4EBB", color: "rgb(255, 255, 255)" }
                              : { borderRadius: "25px", background: "rgb(255, 233, 247)", color: "rgb(253, 78, 187)" }
                          }
                        >
                          {dayNum}
                        </div>
                      </div>

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
                            <div className="text-[16px] text-slate-800">
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
                              <div className="text-[16px] text-slate-800">
                                {schedule.commentaire}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Événements spontanés */}
                      {(() => {
                        const daySpontaneousEvents = spontaneousEvents.filter((evt) => {
                          if (!evt.date || evt.date !== isoDate) return false;
                          if (selectedTech === 'Tous') return true;
                          return (evt.techName || '').trim().toLowerCase() === selectedTech.trim().toLowerCase();
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
                            {/* Gélules Date, Créneau, Badge + Bouton Supprimer */}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2 flex-1">
                                <span className="px-3.5 py-1.5 rounded-full bg-blue-600 text-white font-bold text-[16px]">
                                  Événement spontané
                                </span>
                                <span className="px-3.5 py-1.5 rounded-full bg-black text-white font-medium text-[16px]">
                                  Date : {getFormattedDateFR(evt.date)}
                                </span>
                                <span className="px-3.5 py-1.5 rounded-full bg-black text-white font-medium text-[16px]">
                                  Créneau : {evt.creneau}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleDeleteSpontaneousEvent(evt.id)}
                                style={{
                                  color: "#fff",
                                  boxShadow: "rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgba(220, 38, 38, 0.5) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset",
                                  background: "rgb(220, 38, 38)",
                                  borderRadius: "13px",
                                  padding: "8px 18px",
                                  fontSize: "16px",
                                  fontWeight: 700,
                                  border: "none",
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "6px"
                                }}
                                className="w-full sm:w-auto mx-0 sm:ml-10 sm:mr-2.5 shrink-0 select-none"
                              >
                                Supprimer
                              </button>
                            </div>

                            {/* Details */}
                            <div className="space-y-1.5 text-[16px] text-slate-800 pt-1">
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
                        // Find associated equipment & client
                        const defib = defibrillateurs.find(
                          (d: any) =>
                            d.identifiant === mission.defibIdentifiant ||
                            d.id === mission.defibIdentifiant ||
                            (mission.identifiant && d.identifiant === mission.identifiant) ||
                            (mission.defibId && d.id === mission.defibId)
                        );

                        const other = otherEquipments.find(
                          (o: any) =>
                            o.identifiant === mission.defibIdentifiant ||
                            o.id === mission.defibIdentifiant ||
                            (mission.identifiant && o.identifiant === mission.identifiant) ||
                            (mission.defibId && o.id === mission.defibId)
                        );

                        const clientObj = clients.find(
                          c =>
                            c.id === mission.clientId ||
                            c.id === defib?.clientId ||
                            c.id === other?.clientId ||
                            (c.denomination && mission.clientDenomination && c.denomination.toLowerCase() === mission.clientDenomination.toLowerCase())
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

                        const siteName =
                          mission.site ||
                          mission.siteName ||
                          defib?.nomSite ||
                          other?.nomSite ||
                          defib?.nomPrenomSite ||
                          '';

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
                          if (mission.address) return mission.address;
                          if (clientObj) {
                            const parts = [clientObj.adresse, clientObj.codePostal, clientObj.ville].filter(Boolean);
                            if (parts.length > 0) return parts.join(', ');
                          }
                          return '';
                        })();

                        const equipType =
                          mission.equipmentType ||
                          (defib ? 'Défibrillateur' : (other ? other.categorie : 'Défibrillateur'));

                        const identifiant =
                          mission.defibIdentifiant ||
                          mission.identifiant ||
                          defib?.identifiant ||
                          other?.identifiant ||
                          '';

                        const rawDateStr = mission.estimatedDate || mission.date || (tour.startDate !== 'A trier' ? tour.startDate : '');
                        const dateVal = getFormattedDateFR(rawDateStr);
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
                            {/* Gélules Date et Créneau & Bouton Dérouler / Réduire */}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2 flex-1">
                                <span className="px-3.5 py-1.5 rounded-full bg-black text-white font-medium text-[16px]">
                                  Date : {dateVal}
                                </span>
                                <span className="px-3.5 py-1.5 rounded-full bg-black text-white font-medium text-[16px]">
                                  Créneau : {creneauVal}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => toggleMissionExpanded(missionKey)}
                                style={{
                                  color: "#fff",
                                  boxShadow: "rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(97 28 104) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset",
                                  background: "rgb(96 28 104)",
                                  borderRadius: "13px",
                                  padding: "8px 18px",
                                  fontSize: "16px",
                                  fontWeight: 700,
                                  border: "none",
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
                              <div className="space-y-1.5 text-[16px] text-slate-800 pt-2">
                                <div>
                                  <span className="font-bold">Tournée : </span>
                                  <span>{tourTitle}</span>
                                </div>
                                <div>
                                  <span className="font-bold">Client : </span>
                                  <span>{clientName}</span>
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
                                  <span className="font-bold">Type de matériel : </span>
                                  <span>{equipType}</span>
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
    </div>
  );
};
