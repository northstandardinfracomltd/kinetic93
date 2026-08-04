import React, { useState, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { findTenantAndDefibGlobally, fetchRawCollectionFromFirestore, db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { t } from '../utils/translate';
import { getParisTimestamp } from '../utils/dateUtils';

interface CriteriaConfig {
  key: 'qualite' | 'ponctualite' | 'politesse' | 'clartePdf' | 'explications' | 'sensibilisation';
  label: string;
}

const CRITERIA_LIST: CriteriaConfig[] = [
  { key: 'qualite', label: 'Qualité de la prestation réalisée.' },
  { key: 'ponctualite', label: 'Ponctualité du technicien.' },
  { key: 'politesse', label: 'Politesse et présentation du technicien.' },
  { key: 'clartePdf', label: "Clarté du rapport d'intervention." },
  { key: 'explications', label: 'Explications fournies sur la maintenance.' },
  { key: 'sensibilisation', label: 'Qualité de la sensibilisation au matériel.' },
];

export default function SatisfactionFormPage() {
  const [defibId, setDefibId] = useState('');
  const [nomPrenom, setNomPrenom] = useState('');
  const [commentaire, setCommentaire] = useState('');

  // 6 Criteria Ratings (1-4)
  const [qualite, setQualite] = useState<number | null>(null);
  const [ponctualite, setPonctualite] = useState<number | null>(null);
  const [politesse, setPolitesse] = useState<number | null>(null);
  const [clartePdf, setClartePdf] = useState<number | null>(null);
  const [explications, setExplications] = useState<number | null>(null);
  const [sensibilisation, setSensibilisation] = useState<number | null>(null);
  
  const [isCheckingId, setIsCheckingId] = useState(false);
  const [isIdValid, setIsIdValid] = useState<boolean | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const criteriaValues = useMemo(() => ({
    qualite,
    ponctualite,
    politesse,
    clartePdf,
    explications,
    sensibilisation,
  }), [qualite, ponctualite, politesse, clartePdf, explications, sensibilisation]);

  const setCriteriaValue = (key: CriteriaConfig['key'], val: number) => {
    if (key === 'qualite') setQualite(val);
    else if (key === 'ponctualite') setPonctualite(val);
    else if (key === 'politesse') setPolitesse(val);
    else if (key === 'clartePdf') setClartePdf(val);
    else if (key === 'explications') setExplications(val);
    else if (key === 'sensibilisation') setSensibilisation(val);
  };

  // Live lookup check of defibrillator identifier against main software's registry
  useEffect(() => {
    const trimmed = defibId.trim();
    if (!trimmed) {
      setIsIdValid(null);
      return;
    }

    setIsCheckingId(true);
    const delayDebounce = setTimeout(async () => {
      try {
        const result = await findTenantAndDefibGlobally(trimmed);
        if (result && result.exists) {
          setIsIdValid(true);
        } else {
          setIsIdValid(false);
        }
      } catch (err) {
        console.error("Error checking ID on satisfaction form:", err);
        setIsIdValid(false);
      } finally {
        setIsCheckingId(false);
      }
    }, 600); // 600ms debounce

    return () => clearTimeout(delayDebounce);
  }, [defibId]);

  // Combined validity check
  const isFormValid = useMemo(() => {
    const allCriteriaSelected = qualite !== null &&
                                ponctualite !== null &&
                                politesse !== null &&
                                clartePdf !== null &&
                                explications !== null &&
                                sensibilisation !== null;

    return defibId.trim().length > 0 &&
           nomPrenom.trim().length > 0 &&
           commentaire.trim().length > 0 &&
           allCriteriaSelected &&
           isIdValid === true &&
           !isCheckingId;
  }, [defibId, nomPrenom, commentaire, qualite, ponctualite, politesse, clartePdf, explications, sensibilisation, isIdValid, isCheckingId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      // 1. Locate the correct tenant owning the defibrillator identification
      const tenantInfo = await findTenantAndDefibGlobally(defibId);
      if (!tenantInfo) {
        setErrorMessage("Erreur: Impossible de localiser le propriétaire de ce défibrillateur.");
        setIsSubmitting(false);
        return;
      }

      const { tenantId } = tenantInfo;

      // 2. Add the customer review to that specific tenant's customerReviews partition in firestore
      const key = tenantId === 'demo' ? 'customerReviews' : `${tenantId}_customerReviews`;
      const existingReviews = await fetchRawCollectionFromFirestore<any[]>(key) || [];

      const scores = [qualite, ponctualite, politesse, clartePdf, explications, sensibilisation].filter((v): v is number => typeof v === 'number');
      const avgVal = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '4.0';

      const newReview = {
        id: 'rev-' + Date.now(),
        clientName: nomPrenom.trim(),
        comment: commentaire.trim(),
        defibId: defibId.trim(),
        qualite,
        ponctualite,
        politesse,
        clartePdf,
        explications,
        sensibilisation,
        dateStr: new Date().toISOString().split('T')[0]
      };

      const updatedList = [newReview, ...existingReviews];

      // Update firestore doc
      await setDoc(doc(db, 'appData', key), { value: updatedList });

      // Generate a corresponding notification for the tenant
      try {
        const notifKey = tenantId === 'demo' ? 'notifications' : `${tenantId}_notifications`;
        const existingNotifications = await fetchRawCollectionFromFirestore<any[]>(notifKey) || [];
        const client_denomination = nomPrenom.trim() || "Un client anonyme";
        const comment_text = commentaire.trim() ? ` (${commentaire.trim()})` : "";
        const newNotif = {
          id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          category: 'Système',
          title: `Le client ${client_denomination} a soumis un avis de satisfaction (Note globale : ${avgVal}/4)${comment_text}.`,
          timestamp: getParisTimestamp(),
          situation: 'Nouveau',
        };
        const updatedNotifs = [newNotif, ...existingNotifications];
        await setDoc(doc(db, 'appData', notifKey), { value: updatedNotifs });

        const currentActiveTenant = localStorage.getItem('defib_tenant_id') || 'demo';
        if (currentActiveTenant === tenantId) {
          localStorage.setItem(`defib_${tenantId}_notifications`, JSON.stringify(updatedNotifs));
        }
      } catch (notifErr) {
        console.warn("Failed to save corresponding system notification:", notifErr);
      }

      // Update local storage if the currently loaded tenant matches the target tenant
      const currentActiveTenant = localStorage.getItem('defib_tenant_id') || 'demo';
      if (currentActiveTenant === tenantId) {
        localStorage.setItem(`defib_${tenantId}_customer_reviews`, JSON.stringify(updatedList));
      }

      setIsSubmitted(true);
      // Clear inputs
      setDefibId('');
      setNomPrenom('');
      setCommentaire('');
      setQualite(null);
      setPonctualite(null);
      setPolitesse(null);
      setClartePdf(null);
      setExplications(null);
      setSensibilisation(null);
    } catch (err: any) {
      console.error("Error submitting review:", err);
      setErrorMessage("Une erreur est survenue lors de l'enregistrement de votre évaluation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans relative" id="satisfaction-viewport-wrapper">
      <style>{`
        body {
          background: #ffffff !important;
        }

        #satisfaction-card input, #satisfaction-card select, #satisfaction-card textarea {
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

        #satisfaction-card button {
          transition: 0s !important;
        }

        #satisfaction-card input:focus, #satisfaction-card select:focus, #satisfaction-card textarea:focus, #satisfaction-card button[type="submit"]:focus,
        #satisfaction-card input:hover, #satisfaction-card select:hover, #satisfaction-card textarea:hover, #satisfaction-card button[type="submit"]:hover {
          outline: 2.5px solid #fa53d5 !important;
          outline-offset: 3px !important;
        }
      `}</style>

      <div className="sm:mx-auto w-full max-w-lg">
        {/* Outer Container */}
        <div className="bg-white p-2 sm:p-4 relative overflow-hidden" id="satisfaction-card">
          
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {errorMessage && (
              <div className="p-4 bg-rose-50 text-rose-700 border border-rose-100 rounded-xl text-xs font-sans">
                {errorMessage}
              </div>
            )}

            {/* ID DEFIB FIELD */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="defib_id" className="font-bold font-sans" style={{ color: '#000000', fontSize: '18px' }}>
                {t("Identifiant du matériel.")}
              </label>
              <input
                id="defib_id"
                type="text"
                required
                placeholder={t("Ex: ABC-D00-123.")}
                value={defibId}
                onChange={(e) => setDefibId(e.target.value)}
                className="w-full text-black"
              />
              
              {isCheckingId && (
                <p className="text-[16px] text-slate-500 font-bold font-sans mt-0.5">
                  {t("Vérification de l'identifiant...")}
                </p>
              )}
              {!isCheckingId && isIdValid === true && (
                <p className="text-[16px] text-emerald-600 font-bold font-sans mt-0.5">
                  {t("Identifiant matériel valide.")}
                </p>
              )}
              {!isCheckingId && isIdValid === false && (
                <p className="text-[16px] text-red-600 font-bold font-sans mt-0.5">
                  {t("Identifiant matériel invalide.")}
                </p>
              )}
            </div>

            {/* NOM PRENOM */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="nom_prenom" className="font-bold font-sans" style={{ color: '#000000', fontSize: '18px' }}>
                {t("Votre nom et prénom.")}
              </label>
              <input
                id="nom_prenom"
                type="text"
                required
                placeholder={t("Ex: Jean Dupont.")}
                value={nomPrenom}
                onChange={(e) => setNomPrenom(e.target.value)}
                className="w-full text-black"
              />
              <div 
                style={{ 
                  color: '#fff', 
                  fontSize: '16px', 
                  textAlign: 'center', 
                  marginTop: '55px', 
                  background: '#7e2e86', 
                  border: 'none', 
                  borderRadius: '13px', 
                  padding: '12px' 
                }} 
                className="font-sans"
              >
                {t("Ci-dessous, évaluez notre service selon les critères suivants de 1 (Décevant) à 4 (Excellent).")}
              </div>
            </div>

            {/* 6 CRITERIA RADIOS (1 à 4) */}
            <div className="space-y-5 pt-2">
              {CRITERIA_LIST.map((crit) => {
                const currentVal = criteriaValues[crit.key];

                return (
                  <div key={crit.key} className="flex flex-col gap-2">
                    <label className="font-bold font-sans" style={{ color: '#000000', fontSize: '18px' }}>
                      {t(crit.label)}
                    </label>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[1, 2, 3, 4].map((num) => {
                        const isSelected = currentVal === num;
                        const labelText = `${num}`;

                        const btnStyle: React.CSSProperties = isSelected
                          ? {
                              backgroundColor: 'rgb(53, 86, 236)',
                              color: '#ffffff',
                              boxShadow: 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset',
                              border: 'none',
                              borderRadius: '12px',
                              fontSize: '18px',
                              padding: '10px 4px',
                              fontWeight: 'bold',
                              fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                              cursor: 'pointer',
                              transition: '0s',
                            }
                          : {
                              backgroundColor: '#f1f5f9',
                              color: '#475569',
                              border: '1px solid #cbd5e1',
                              borderRadius: '12px',
                              fontSize: '18px',
                              padding: '10px 4px',
                              fontWeight: 'bold',
                              fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                              cursor: 'pointer',
                              transition: '0s',
                            };

                        return (
                          <button
                            key={num}
                            type="button"
                            onClick={() => setCriteriaValue(crit.key, num)}
                            style={btnStyle}
                            className="active:scale-98"
                          >
                            {t(labelText)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* COMMENTAIRE */}
            <div className="flex flex-col gap-1.5 pt-2">
              <label htmlFor="commentaire" className="font-bold font-sans" style={{ color: '#000000', fontSize: '18px' }}>
                {t("Commentaire.")}
              </label>
              <textarea
                id="commentaire"
                required
                rows={4}
                placeholder={t("Entrez votre commentaire.")}
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                className="w-full text-black"
              />
            </div>

            {/* SUBMIT BUTTON */}
            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              style={{
                backgroundColor: isFormValid && !isSubmitting ? 'rgb(53, 86, 236)' : '#cbd5e1',
                color: isFormValid && !isSubmitting ? '#ffffff' : '#64748b',
                boxShadow: isFormValid && !isSubmitting 
                  ? 'rgba(255, 255, 255, 0.2) 0px 1px 1px inset, rgba(8, 8, 8, 0.2) 0px 1px 2px, rgba(8, 8, 8, 0.08) 0px 4px 4px, rgb(53, 86, 236) 0px 7px 0px -12px, rgba(255, 255, 255, 0.12) 0px 6px 12px inset'
                  : 'none',
                borderRadius: '12px',
                fontSize: '18px',
                padding: '14px 20px',
                fontWeight: '100',
                fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                transition: '0s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                cursor: isFormValid && !isSubmitting ? 'pointer' : 'not-allowed',
                border: 'none',
                width: '100%',
              }}
            >
              {isSubmitting ? t("Enregistrement...") : t("Valider")}
            </button>

            {/* Form submission success feedback directly below validation button */}
            {isSubmitted && (
              <p className="mt-4 text-center text-[16px] font-semibold text-red-600 font-sans">
                {t("Évaluation enregistrée avec succès, vous pouvez fermer la page.")}
              </p>
            )}
          </form>

        </div>
      </div>
    </div>
  );
}

