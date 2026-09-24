import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { findMissionByInterventionGlobally, updateMissionStatusByIntervention } from '../firebase';
import { t } from '../utils/translate';

export default function MissionValidationPage() {
  const getUrlParam = (paramKey: string): string => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const val = searchParams.get(paramKey);
      if (val) return val;
      if (window.location.hash.includes('?')) {
        const hashParams = new URLSearchParams(window.location.hash.split('?')[1]);
        const hVal = hashParams.get(paramKey);
        if (hVal) return hVal;
      }
    } catch (_) {}
    return '';
  };

  const [interventionRef] = useState<string>(() => {
    return getUrlParam('ref') || getUrlParam('intervention') || getUrlParam('interventionRef') || '';
  });

  const [urlTenantId] = useState<string>(() => {
    return getUrlParam('tenant') || getUrlParam('env') || '';
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [missionData, setMissionData] = useState<any>(null);
  const [resolvedTenantId, setResolvedTenantId] = useState<string>(urlTenantId || '');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Decision UI state
  const [showRefusalForm, setShowRefusalForm] = useState<boolean>(false);
  const [refusalComment, setRefusalComment] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedStatus, setSubmittedStatus] = useState<'validated' | 'refused' | null>(null);

  // Load mission from Firestore DB on mount
  useEffect(() => {
    let isMounted = true;

    async function loadMission() {
      if (!interventionRef) {
        setIsLoading(false);
        setErrorMessage("Aucune référence d'intervention renseignée dans le lien.");
        return;
      }

      setIsLoading(true);
      setErrorMessage('');

      try {
        const result = await findMissionByInterventionGlobally(interventionRef, urlTenantId || undefined);
        if (!isMounted) return;

        if (result && result.mission) {
          setMissionData(result.mission);
          setResolvedTenantId(result.tenantId);
          if (result.mission.status === 'Accepté Client') {
            setSubmittedStatus('validated');
          } else if (result.mission.status === 'Refusé Client') {
            setSubmittedStatus('refused');
            if (result.mission.refusalComment || result.mission.clientRefusalComment) {
              setRefusalComment(result.mission.refusalComment || result.mission.clientRefusalComment || '');
            }
          }
        } else {
          setErrorMessage("Impossible de retrouver l'intervention correspondante. Veuillez vérifier le lien fourni.");
        }
      } catch (err) {
        console.error("Erreur lors du chargement de l'intervention:", err);
        if (isMounted) {
          setErrorMessage("Une erreur de communication est survenue lors de la recherche de l'intervention.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadMission();

    return () => {
      isMounted = false;
    };
  }, [interventionRef, urlTenantId]);

  // Format date display (dd/mm/yyyy)
  const formatEstimatedDate = (dateVal?: string): string => {
    if (!dateVal) return t("Non renseignée");
    const trimmed = dateVal.trim();
    if (trimmed.includes('-')) {
      const parts = trimmed.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }
    return trimmed;
  };

  // Handler: Validation click
  const handleValidate = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const res = await updateMissionStatusByIntervention(
        interventionRef,
        'Accepté Client',
        undefined,
        resolvedTenantId || urlTenantId
      );

      if (res.success) {
        setSubmittedStatus('validated');
        setShowRefusalForm(false);
        setMissionData((prev: any) => ({ ...(prev || {}), status: 'Accepté Client' }));
      } else {
        setErrorMessage("Une erreur est survenue lors de l'enregistrement de votre validation.");
      }
    } catch (err) {
      console.error("Erreur de validation:", err);
      setErrorMessage("Une erreur est survenue lors de l'enregistrement de votre validation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler: Refusal submission click
  const handleConfirmRefusal = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const trimmedComment = refusalComment.trim().slice(0, 300);
      const res = await updateMissionStatusByIntervention(
        interventionRef,
        'Refusé Client',
        trimmedComment,
        resolvedTenantId || urlTenantId
      );

      if (res.success) {
        setSubmittedStatus('refused');
        setMissionData((prev: any) => ({
          ...(prev || {}),
          status: 'Refusé Client',
          refusalComment: trimmedComment,
          clientRefusalComment: trimmedComment
        }));
      } else {
        setErrorMessage("Une erreur est survenue lors de l'enregistrement du refus.");
      }
    } catch (err) {
      console.error("Erreur de refus:", err);
      setErrorMessage("Une erreur est survenue lors de l'enregistrement du refus.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans relative" id="validation-viewport-wrapper">
      <style>{`
        body {
          background: #ffffff !important;
        }

        #validation-card input, #validation-card select, #validation-card textarea {
          border: 1px solid #dedede !important;
          border-radius: 13px !important;
          padding: 14px !important;
          font-size: 16px !important;
          font-weight: 300 !important;
          color: #000000 !important;
          background-color: #ffffff !important;
          outline: none !important;
          transition: 0s !important;
          font-family: 'DefibeoMain', 'Civilprom', sans-serif !important;
        }

        #validation-card button {
          transition: 0s !important;
        }

        #validation-card input:focus, #validation-card select:focus, #validation-card textarea:focus, #validation-card button:focus,
        #validation-card input:hover, #validation-card select:hover, #validation-card textarea:hover, #validation-card button:hover {
          outline: 2.5px solid #fa53d5 !important;
          outline-offset: 3px !important;
        }
      `}</style>

      <div className="sm:mx-auto w-full max-w-lg">
        {/* Outer Container */}
        <div className="bg-white p-2 sm:p-4 relative overflow-hidden" id="validation-card">
          
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#fa53d5]" />
              <p className="text-sm text-slate-500 font-sans">{t("Chargement des informations de l'intervention...")}</p>
            </div>
          ) : (
            <div className="space-y-6">
              
              {errorMessage && (
                <div className="p-4 bg-rose-50 text-rose-700 border border-rose-100 rounded-xl text-xs font-sans">
                  {errorMessage}
                </div>
              )}

              {/* RÉFÉRENCE DE L'INTERVENTION (Disabled et autofilled) */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="intervention_ref" className="font-bold font-sans" style={{ color: '#000000', fontSize: '18px' }}>
                  {t("Référence de l’intervention.")}
                </label>
                <input
                  id="intervention_ref"
                  type="text"
                  disabled
                  value={interventionRef || t("Non renseignée")}
                  placeholder={t("Référence de l'intervention")}
                  className="w-full text-black disabled:bg-slate-50 disabled:text-slate-700 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: '#f8fafc',
                    color: '#1e293b',
                    cursor: 'not-allowed',
                  }}
                />
              </div>

              {/* DATE ESTIMÉE (Disabled, informatif) */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="estimated_date" className="font-bold font-sans" style={{ color: '#000000', fontSize: '18px' }}>
                  {t("Date estimée.")}
                </label>
                <input
                  id="estimated_date"
                  type="text"
                  disabled
                  value={formatEstimatedDate(missionData?.estimatedDate)}
                  placeholder={t("Date estimée")}
                  className="w-full text-black disabled:bg-slate-50 disabled:text-slate-700 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: '#f8fafc',
                    color: '#1e293b',
                    cursor: 'not-allowed',
                  }}
                />
              </div>

              {/* CRÉNEAU ESTIMÉ (Disabled, informatif) */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="estimated_slot" className="font-bold font-sans" style={{ color: '#000000', fontSize: '18px' }}>
                  {t("Créneau estimé.")}
                </label>
                <input
                  id="estimated_slot"
                  type="text"
                  disabled
                  value={missionData?.estimatedSlot || t("Non défini")}
                  placeholder={t("Créneau estimé")}
                  className="w-full text-black disabled:bg-slate-50 disabled:text-slate-700 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: '#f8fafc',
                    color: '#1e293b',
                    cursor: 'not-allowed',
                  }}
                />
              </div>

              {/* BOUTONS D'ACTION: VALIDER & REFUSER */}
              {!showRefusalForm ? (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  {/* BOUTON VALIDER */}
                  <button
                    type="button"
                    onClick={handleValidate}
                    disabled={isSubmitting || submittedStatus === 'validated'}
                    style={{
                      backgroundColor: submittedStatus === 'validated' ? '#94a3b8' : 'rgb(53, 86, 236)',
                      color: '#ffffff',
                      boxShadow: submittedStatus === 'validated'
                        ? 'none'
                        : 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
                      borderRadius: '12px',
                      fontSize: '18px',
                      padding: '14px 20px',
                      fontWeight: '500',
                      fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                      transition: '0s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      cursor: isSubmitting || submittedStatus === 'validated' ? 'not-allowed' : 'pointer',
                      border: 'none',
                      width: '100%',
                    }}
                  >
                    {isSubmitting && !showRefusalForm ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      t("Valider")
                    )}
                  </button>

                  {/* BOUTON REFUSER */}
                  <button
                    type="button"
                    onClick={() => setShowRefusalForm(true)}
                    disabled={isSubmitting}
                    style={{
                      backgroundColor: 'rgb(220, 38, 38)',
                      color: '#ffffff',
                      boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(185, 28, 28) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
                      borderRadius: '12px',
                      fontSize: '18px',
                      padding: '14px 20px',
                      fontWeight: '500',
                      fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                      transition: '0s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      cursor: isSubmitting ? 'not-allowed' : 'pointer',
                      border: 'none',
                      width: '100%',
                    }}
                  >
                    {t("Refuser")}
                  </button>
                </div>
              ) : (
                /* VOLET REFUS: COMMENTAIRE LIMITÉ À 300 CARACTÈRES & CONFIRMER LE REFUS */
                <div className="space-y-4 pt-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="refusal_comment" className="font-bold font-sans" style={{ color: '#000000', fontSize: '18px' }}>
                      {t("Commentaire. (Veuillez détailler la raison ou proposer des dates et créneaux.)")}
                    </label>
                    <textarea
                      id="refusal_comment"
                      rows={4}
                      maxLength={300}
                      value={refusalComment}
                      onChange={(e) => setRefusalComment(e.target.value.slice(0, 300))}
                      placeholder={t("Veuillez détailler la raison ou proposer des dates et créneaux...")}
                      className="w-full text-black"
                      style={{
                        border: '1px solid #dedede',
                        borderRadius: '13px',
                        padding: '14px',
                        fontSize: '16px',
                        color: '#000000',
                        backgroundColor: '#ffffff',
                        outline: 'none',
                        resize: 'vertical'
                      }}
                    />
                    <div className="flex justify-between items-center text-xs text-slate-500 font-sans px-1">
                      <span>{t("Limité à 300 caractères maximum.")}</span>
                      <span className={refusalComment.length >= 300 ? 'text-red-600 font-bold' : ''}>
                        {refusalComment.length}/300
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleConfirmRefusal}
                      disabled={isSubmitting}
                      style={{
                        backgroundColor: 'rgb(220, 38, 38)',
                        color: '#ffffff',
                        boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(185, 28, 28) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
                        borderRadius: '12px',
                        fontSize: '18px',
                        padding: '14px 20px',
                        fontWeight: '500',
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                        transition: '0s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        border: 'none',
                        width: '100%',
                      }}
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        t("Confirmer le refus")
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowRefusalForm(false)}
                      disabled={isSubmitting}
                      className="w-full text-center text-sm text-slate-500 hover:text-slate-800 font-sans py-2 underline cursor-pointer"
                    >
                      {t("Annuler et revenir au choix")}
                    </button>
                  </div>
                </div>
              )}

              {/* MESSAGES DE CONFIRMATION SUCCÈS */}
              {submittedStatus === 'validated' && (
                <div className="mt-4 p-4 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-center font-sans font-semibold text-[16px]">
                  {t("Proposition validée avec succès, vous pouvez fermer la page.")}
                </div>
              )}

              {submittedStatus === 'refused' && (
                <div className="mt-4 p-4 bg-red-50 text-red-800 border border-red-200 rounded-xl text-center font-sans font-semibold text-[16px]">
                  {t("Refus confirmé avec succès, vous pouvez fermer la page.")}
                </div>
              )}

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
