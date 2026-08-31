import re

with open('src/components/PlanningTab.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update imports
old_imp = """import React, { useState, useMemo, useEffect } from 'react';
import { CompanyInfo, Member, MemberSchedule, MemberAbsence } from '../types';
import { saveCollectionToFirestore, fetchCollectionFromFirestore } from '../firebase';
import { getActiveTenantCountry, getHolidaysForYear, SupportedCountry } from '../utils/holidays';"""

new_imp = """import React, { useState, useMemo, useEffect } from 'react';
import { X, Columns3 } from 'lucide-react';
import { CompanyInfo, Member, MemberSchedule, MemberAbsence } from '../types';
import { saveCollectionToFirestore, fetchCollectionFromFirestore } from '../firebase';
import { getActiveTenantCountry, getHolidaysForYear, isHolidayDate, SupportedCountry } from '../utils/holidays';"""

if old_imp in code:
    code = code.replace(old_imp, new_imp, 1)
    print('Updated imports')
else:
    print('old_imp not found')

# 2. Update PlanningTabProps
old_props = """interface PlanningTabProps {
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
}"""

new_props = """interface PlanningTabProps {
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
}"""

if old_props in code:
    code = code.replace(old_props, new_props, 1)
    print('Updated PlanningTabProps')
else:
    print('old_props not found')

# 3. Update component signature
old_sig = """export const PlanningTab: React.FC<PlanningTabProps> = ({
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
}) => {"""

new_sig = """export const PlanningTab: React.FC<PlanningTabProps> = ({
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
}) => {"""

if old_sig in code:
    code = code.replace(old_sig, new_sig, 1)
    print('Updated component signature')
else:
    print('old_sig not found')

# 4. Add state for horizontal modal
old_state_hook = """  const today = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth());"""

new_state_hook = """  const today = new Date();
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
  }, [horizontalModalWeek]);"""

if old_state_hook in code:
    code = code.replace(old_state_hook, new_state_hook, 1)
    print('Updated state hook')
else:
    print('old_state_hook not found')

# 5. Update week header in list
old_week_header = """              {/* En-tête de la semaine avec gélule S1, S2... */}
              <div className=\"flex items-center gap-2\">
                <span
                  className=\"inline-flex items-center justify-center px-4 py-1.5 rounded-full font-bold text-white shadow-xs\"
                  style={{
                    backgroundColor: '#410eb3',
                    fontSize: '18px',
                    fontFamily: \"'DefibeoMain', 'Civilprom', sans-serif\"
                  }}
                >
                  S{weekNum}
                </span>
              </div>"""

new_week_header = """              {/* En-tête de la semaine avec gélule S1, S2... et bouton Vue horizontale */}
              <div className=\"flex flex-wrap items-center justify-between gap-2\">
                <div className=\"flex items-center gap-3\">
                  <span
                    className=\"inline-flex items-center justify-center px-4 py-1.5 rounded-full font-bold text-white shadow-xs\"
                    style={{
                      backgroundColor: '#410eb3',
                      fontSize: '18px',
                      fontFamily: \"'DefibeoMain', 'Civilprom', sans-serif\"
                    }}
                  >
                    S{weekNum}
                  </span>

                  {isSidePane && (
                    <button
                      type=\"button\"
                      onClick={() => setHorizontalModalWeek({ weekNum, days })}
                      className=\"inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold text-white transition-all duration-150 select-none hover:opacity-90 active:scale-95 cursor-pointer shadow-xs\"
                      style={{
                        backgroundColor: '#410eb3',
                        fontSize: '14px',
                        border: 'none',
                      }}
                      title=\"Afficher le planning de la semaine en vue horizontale\"
                    >
                      <Columns3 className=\"w-4 h-4\" />
                      Vue horizontale
                    </button>
                  )}
                </div>
              </div>"""

if old_week_header in code:
    code = code.replace(old_week_header, new_week_header, 1)
    print('Updated week header')
else:
    print('old_week_header not found')

# 6. Add Horizontal Modal at the end of component
horizontal_modal_code = """
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
            className=\"fixed inset-0 z-[1000] bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-fade-in\"
            onClick={() => setHorizontalModalWeek(null)}
          >
            <div
              className=\"w-full h-full max-w-[98vw] max-h-[96vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200\"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header Modal */}
              <div className=\"flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-white shrink-0\">
                <div className=\"flex flex-wrap items-center gap-3\">
                  <span
                    className=\"inline-flex items-center justify-center px-4 py-1.5 rounded-full font-bold text-white shadow-xs\"
                    style={{
                      backgroundColor: '#410eb3',
                      fontSize: '18px',
                      fontFamily: \"'DefibeoMain', 'Civilprom', sans-serif\"
                    }}
                  >
                    S{horizontalModalWeek.weekNum}
                  </span>
                  <div>
                    <div className=\"flex items-center gap-2.5 flex-wrap\">
                      <h2 className=\"text-xl font-bold text-slate-900 leading-tight\">
                        Planning Semaine {horizontalModalWeek.weekNum} (Vue horizontale)
                      </h2>
                      <span className=\"px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold uppercase tracking-wider\">
                        Consultatif
                      </span>
                    </div>
                    <div className=\"flex items-center gap-2 text-sm text-slate-500 font-medium mt-0.5 flex-wrap\">
                      {startDateLabel && endDateLabel && (
                        <span>Du {startDateLabel} au {endDateLabel}</span>
                      )}
                      {selectedTech && (
                        <>
                          <span>•</span>
                          <span className=\"font-semibold text-slate-700\">Technicien : {selectedTech}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className=\"flex items-center gap-2\">
                  <button
                    type=\"button\"
                    onClick={() => setHorizontalModalWeek(null)}
                    className=\"inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-black text-white font-bold text-[15px] cursor-pointer transition-all hover:bg-slate-800 active:scale-95 shadow-xs\"
                  >
                    <X className=\"w-4 h-4\" />
                    Fermer
                  </button>
                </div>
              </div>

              {/* Body Modal - Grille Horizontale 7 colonnes (1 colonne par jour) */}
              <div className=\"flex-1 overflow-x-auto overflow-y-auto p-4 bg-slate-100/70\">
                <div className=\"grid grid-cols-7 gap-3 min-w-[1250px] h-full items-start\">
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
                        className=\"bg-white p-3.5 space-y-3 flex flex-col min-h-[550px] shadow-xs\"
                        style={
                          isToday
                            ? { border: '3px solid #FD4EBB', borderRadius: '14px' }
                            : { border: '1px solid rgb(201, 190, 205)', borderRadius: '14px' }
                        }
                      >
                        {/* En-tête de la colonne jour */}
                        <div className=\"space-y-2 pb-2 border-b border-slate-100\">
                          <div className=\"flex items-center justify-between gap-2\">
                            <div
                              className=\"w-10 h-10 flex items-center justify-center font-bold text-[16px] shrink-0\"
                              style={
                                isToday
                                  ? { borderRadius: '20px', background: '#FD4EBB', color: 'rgb(255, 255, 255)' }
                                  : { borderRadius: '20px', background: 'rgb(255, 233, 247)', color: 'rgb(253, 78, 187)' }
                              }
                            >
                              {dayNum}
                            </div>
                            <div className=\"text-right\">
                              <div className=\"font-bold text-[15px] text-slate-900 leading-tight\">
                                {dayName}
                              </div>
                              <div className=\"text-[12px] text-slate-500 font-medium\">
                                {dayNum} {monthName}
                              </div>
                            </div>
                          </div>

                          {/* Jour férié */}
                          {holidayName && (
                            <div className=\"w-full\">
                              <span
                                className=\"w-full px-2.5 py-1 rounded-full bg-black text-white font-medium text-[12px] inline-flex items-center select-none\"
                                title={`Jour férié : ${holidayName}`}
                              >
                                <span className=\"shrink-0 whitespace-nowrap\">Jour férié :&nbsp;</span>
                                <span className=\"truncate whitespace-nowrap\">{holidayName}</span>
                              </span>
                            </div>
                          )}

                          {/* Tournée(s) active(s) */}
                          {dayActiveTours.length > 0 && (
                            <div className=\"space-y-0.5 pt-0.5\">
                              {dayActiveTours.map((tItem, idx) => (
                                <div
                                  key={`h-day-tour-${tItem.tourId}-${idx}`}
                                  className=\"flex items-center gap-1.5 text-[12px] font-bold leading-snug\"
                                  style={{ color: '#FD4EBB' }}
                                >
                                  <span
                                    className=\"w-2 h-2 rounded-full shrink-0\"
                                    style={{ backgroundColor: '#FD4EBB' }}
                                  />
                                  <span className=\"truncate\">
                                    Tournée : {tItem.title}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Contenu vertical de la colonne jour */}
                        <div className=\"space-y-2.5 flex-1 overflow-y-auto pr-0.5\">
                          {/* Absences */}
                          {matchingAbsences.map(({ abs }, aIdx) => (
                            <div
                              key={`h-abs-${aIdx}`}
                              className=\"bg-white p-2.5 space-y-1.5\"
                              style={{
                                border: '1px solid rgb(201, 190, 205)',
                                borderRadius: '12px',
                              }}
                            >
                              <span className=\"px-2.5 py-1 rounded-full bg-black text-white font-medium text-[12px] inline-block\">
                                Indisponible
                              </span>
                              {abs.commentaire && (
                                <div className=\"text-[13px] text-slate-800 leading-snug\">
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
                                className=\"bg-white p-2.5 space-y-1.5\"
                                style={{
                                  border: '1px solid rgb(201, 190, 205)',
                                  borderRadius: '12px',
                                }}
                              >
                                <span className=\"px-2.5 py-1 rounded-full bg-black text-white font-medium text-[12px] inline-block\">
                                  {slotText}
                                </span>
                                {schedule.commentaire && (
                                  <div className=\"text-[13px] text-slate-800 leading-snug\">
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
                              className=\"bg-white p-2.5 space-y-2\"
                              style={{
                                border: '1px solid rgb(201, 190, 205)',
                                borderRadius: '12px',
                              }}
                            >
                              <div className=\"flex flex-wrap items-center gap-1.5\">
                                <span className=\"px-2.5 py-0.5 rounded-full bg-black text-white font-bold text-[12px]\">
                                  Événement
                                </span>
                                <span className=\"px-2.5 py-0.5 rounded-full bg-black text-white font-medium text-[12px]\">
                                  {evt.creneau}
                                </span>
                              </div>
                              <div className=\"space-y-1 text-[13px] text-black\">
                                <div>
                                  <span className=\"font-bold\">Intitulé : </span>
                                  <span>{evt.intitule}</span>
                                </div>
                                {evt.commentaire && (
                                  <div>
                                    <span className=\"font-bold\">Commentaire : </span>
                                    <span className=\"whitespace-pre-wrap\">{evt.commentaire}</span>
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
                                className=\"bg-white p-2.5 space-y-2 shadow-2xs\"
                                style={{
                                  border: '1px solid rgb(201, 190, 205)',
                                  borderRadius: '12px',
                                }}
                              >
                                {/* Gélules */}
                                <div className=\"flex flex-wrap items-center gap-1.5\">
                                  <span
                                    className=\"px-2.5 py-0.5 rounded-full bg-black text-white font-medium text-[12px] inline-flex items-center max-w-full min-w-0\"
                                    title={`Client : ${clientName || 'NC'}`}
                                  >
                                    <span className=\"shrink-0 whitespace-nowrap\">Client :&nbsp;</span>
                                    <span className=\"truncate whitespace-nowrap\">{clientName || 'NC'}</span>
                                  </span>

                                  <span
                                    className=\"px-2.5 py-0.5 rounded-full bg-black text-white font-medium text-[12px] inline-flex items-center max-w-full min-w-0\"
                                    title={`Créneau : ${creneauVal}`}
                                  >
                                    <span className=\"shrink-0 whitespace-nowrap\">Créneau :&nbsp;</span>
                                    <span className=\"truncate whitespace-nowrap\">{creneauVal}</span>
                                  </span>

                                  <span
                                    className=\"px-2.5 py-0.5 rounded-full bg-black text-white font-medium text-[12px] inline-flex items-center max-w-full min-w-0\"
                                    title={`Type : ${typeVal}`}
                                  >
                                    <span className=\"shrink-0 whitespace-nowrap\">Type :&nbsp;</span>
                                    <span className=\"truncate whitespace-nowrap\">{typeVal}</span>
                                  </span>

                                  <span
                                    className=\"px-2.5 py-0.5 rounded-full bg-black text-white font-medium text-[12px] inline-flex items-center max-w-full min-w-0\"
                                    title={`Situation : ${situationVal}`}
                                  >
                                    <span className=\"shrink-0 whitespace-nowrap\">Situation :&nbsp;</span>
                                    <span className=\"truncate whitespace-nowrap\">{situationVal}</span>
                                  </span>
                                </div>

                                {/* Détails consultatifs */}
                                <div className=\"space-y-1 text-[13px] text-black pt-1 border-t border-slate-100\">
                                  <div>
                                    <span className=\"font-bold\">Tournée : </span>
                                    <span>{tourTitle}</span>
                                  </div>
                                  {siteName && (
                                    <div>
                                      <span className=\"font-bold\">Site : </span>
                                      <span>{siteName}</span>
                                    </div>
                                  )}
                                  {locationStr && (
                                    <div>
                                      <span className=\"font-bold\">Localisation : </span>
                                      <span>{locationStr}</span>
                                    </div>
                                  )}
                                  {identifiant && (
                                    <div>
                                      <span className=\"font-bold\">Identifiant : </span>
                                      <span>{identifiant}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {/* Si aucun événement ni mission */}
                          {totalItemsCount === 0 && (
                            <div className=\"py-12 text-center text-slate-400 text-[13px] font-sans italic\">
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
"""

old_end = """      {/* Floating Button "Remonter" when header is not visible (>200px scroll) */}
      {showScrollTop && (
        <div className=\"fixed bottom-4 right-4 sm:bottom-4 sm:right-6 z-40 animate-fade-in\">
          <button
            type=\"button\"
            onClick={handleScrollToTop}
            className=\"text-white font-bold transition-all duration-150 focus:outline-none text-center cursor-pointer flex items-center justify-center select-none hover:opacity-95 active:scale-95\"
            style={{
              backgroundColor: \"rgb(20 87 236)\",
              boxShadow: \"rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgb(255 255 255 / 29%) 0px 6px 12px inset\",
              borderRadius: \"13px\",
              padding: \"10px 20px\",
              fontSize: \"18px\",
              border: \"none\",
            }}
          >
            {t(\"Remonter\")}
          </button>
        </div>
      )}
    </div>
  );
};"""

new_end = horizontal_modal_code + "\n" + old_end

if old_end in code:
    code = code.replace(old_end, new_end, 1)
    print('Updated end of component with horizontal modal')
else:
    print('old_end not found')

with open('src/components/PlanningTab.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print('PlanningTab.tsx written successfully')
