import React, { useState, useMemo } from 'react';
import { findTenantByInterventionGlobally, fetchRawCollectionFromFirestore, saveCollectionToFirestore } from '../firebase';
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
  const getUrlParam = (paramKey: string): string => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const val = searchParams.get(paramKey);
      if (val) return val;
      for (const [k, v] of searchParams.entries()) {
        if (k.toLowerCase() === paramKey.toLowerCase() && v) return v;
      }
      if (window.location.hash.includes('?')) {
        const hashParams = new URLSearchParams(window.location.hash.split('?')[1]);
        const hVal = hashParams.get(paramKey);
        if (hVal) return hVal;
        for (const [k, v] of hashParams.entries()) {
          if (k.toLowerCase() === paramKey.toLowerCase() && v) return v;
        }
      }
    } catch (_) {}
    return '';
  };

  // Detect ?d?? (e.g. ?d27, ?d58, ?D26) or ?tenant=... from URL
  const detectTenantFromUrl = (): string => {
    try {
      const explicit = getUrlParam('tenant') || getUrlParam('env') || getUrlParam('tenantId');
      if (explicit) return explicit.trim();

      const rawSources = [
        window.location.search,
        window.location.hash.includes('?') ? '?' + window.location.hash.split('?')[1] : '',
      ].filter(Boolean);

      for (const src of rawSources) {
        const params = new URLSearchParams(src);
        for (const [k, v] of params.entries()) {
          const cleanK = k.trim();
          const cleanV = v.trim();
          if (/^d\d+$/i.test(cleanK)) return cleanK.toLowerCase();
          if (/^d\d+$/i.test(cleanV)) return cleanV.toLowerCase();
        }
        const match = src.match(/[?&](d\d+)(?:[=&]|$)/i);
        if (match && match[1]) return match[1].toLowerCase();
      }
    } catch (_) {}
    return '';
  };

  // Detect INT... intervention reference from URL if present
  const detectInterventionRefFromUrl = (): string => {
    try {
      const explicit = getUrlParam('ref') || getUrlParam('intervention') || getUrlParam('interventionRef') || getUrlParam('intervention_ref');
      if (explicit) return explicit.trim();

      const rawSources = [
        window.location.search,
        window.location.hash.includes('?') ? '?' + window.location.hash.split('?')[1] : '',
      ].filter(Boolean);

      for (const src of rawSources) {
        const params = new URLSearchParams(src);
        for (const [k, v] of params.entries()) {
          if (/^INT[-_A-Z0-9]+/i.test(k.trim())) return k.trim();
          if (/^INT[-_A-Z0-9]+/i.test(v.trim())) return v.trim();
        }
      }
    } catch (_) {}
    return '';
  };

  const [interventionRef, setInterventionRef] = useState<string>(() => detectInterventionRefFromUrl());
  const [urlTenantId] = useState<string>(() => detectTenantFromUrl());

  const [nomPrenom, setNomPrenom] = useState('');
  const [commentaire, setCommentaire] = useState('');

  // 6 Criteria Ratings (1-4)
  const [qualite, setQualite] = useState<number | null>(null);
  const [ponctualite, setPonctualite] = useState<number | null>(null);
  const [politesse, setPolitesse] = useState<number | null>(null);
  const [clartePdf, setClartePdf] = useState<number | null>(null);
  const [explications, setExplications] = useState<number | null>(null);
  const [sensibilisation, setSensibilisation] = useState<number | null>(null);
  const [npsScore, setNpsScore] = useState<number | null>(() => {
    const raw = getUrlParam('nps') || getUrlParam('npsScore') || getUrlParam('score') || getUrlParam('note');
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) {
        return parsed;
      }
    }
    return null;
  });
  
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

  // Combined validity check
  const isFormValid = useMemo(() => {
    const allCriteriaSelected = qualite !== null &&
                                ponctualite !== null &&
                                politesse !== null &&
                                clartePdf !== null &&
                                explications !== null &&
                                sensibilisation !== null &&
                                npsScore !== null;

    return nomPrenom.trim().length > 0 &&
           commentaire.trim().length > 0 &&
           allCriteriaSelected;
  }, [nomPrenom, commentaire, qualite, ponctualite, politesse, clartePdf, explications, sensibilisation, npsScore]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      // 1. Locate tenant owning the intervention reference or specified via ?d??
      let tenantId = urlTenantId.trim();
      if (!tenantId && interventionRef.trim()) {
        const tenantInfo = await findTenantByInterventionGlobally(interventionRef.trim());
        if (tenantInfo) {
          tenantId = tenantInfo.tenantId;
        }
      }
      if (!tenantId) {
        tenantId = localStorage.getItem('defib_tenant_id') || 'demo';
      }

      const scores = [qualite, ponctualite, politesse, clartePdf, explications, sensibilisation].filter((v): v is number => typeof v === 'number');
      const avgNum = scores.length > 0 ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)) : 4.0;
      const avgVal = avgNum.toFixed(1);

      const newReview = {
        id: 'rev-' + Date.now(),
        clientName: nomPrenom.trim(),
        comment: commentaire.trim(),
        interventionReference: interventionRef.trim(),
        interventionRef: interventionRef.trim(),
        intervention: interventionRef.trim(),
        defibId: interventionRef.trim(),
        qualite,
        ponctualite,
        politesse,
        clartePdf,
        explications,
        sensibilisation,
        npsScore,
        nps: npsScore,
        noteGlobale: avgNum,
        rating: avgNum,
        dateStr: new Date().toISOString().split('T')[0],
        date: new Date().toISOString().split('T')[0],
      };

      // 2. Submit to dedicated public backend endpoint that resolves tenant (?d?? and/or INT...)
      // and writes directly to the tenant's "Spreadsheet Satisfaction." in MEGA ADMIN DEFIBEO
      try {
        const res = await fetch('/api/public/submit-satisfaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantHint: tenantId,
            interventionReference: interventionRef.trim(),
            review: newReview,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.tenantId) {
            tenantId = String(data.tenantId);
          }
        }
      } catch (_) {}

      // 3. Add the customer review to that specific tenant's customerReviews partition in firestore
      try {
        const key = tenantId === 'demo' ? 'customerReviews' : `${tenantId}_customerReviews`;
        const existingReviews = await fetchRawCollectionFromFirestore<any[]>(key) || [];
        const filteredExisting = existingReviews.filter((r: any) => r && r.id !== newReview.id);
        const updatedList = [newReview, ...filteredExisting];
        await saveCollectionToFirestore('customerReviews', updatedList, tenantId);

        const currentActiveTenant = localStorage.getItem('defib_tenant_id') || 'demo';
        if (currentActiveTenant === tenantId || currentActiveTenant.replace(/^d/i, '') === tenantId.replace(/^d/i, '')) {
          localStorage.setItem(`defib_${currentActiveTenant}_customer_reviews`, JSON.stringify(updatedList));
        }
      } catch (_) {}

      // 4. Generate a corresponding notification for the tenant
      try {
        const notifKey = tenantId === 'demo' ? 'notifications' : `${tenantId}_notifications`;
        const existingNotifications = await fetchRawCollectionFromFirestore<any[]>(notifKey) || [];
        const client_denomination = nomPrenom.trim() || "Un client anonyme";
        const refSnippet = interventionRef.trim() ? ` (Réf: ${interventionRef.trim()})` : "";
        const comment_text = commentaire.trim() ? ` - "${commentaire.trim()}"` : "";
        const npsSnippet = npsScore !== null ? ` | NPS : ${npsScore}/10` : '';
        const newNotif = {
          id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          category: 'Système',
          title: `Le client ${client_denomination}${refSnippet} a soumis un avis de satisfaction (Note globale : ${avgVal}/4${npsSnippet})${comment_text}.`,
          timestamp: getParisTimestamp(),
          situation: 'Nouveau',
          envId: tenantId,
          tenantId: tenantId
        };
        const updatedNotifs = [newNotif, ...existingNotifications];
        await saveCollectionToFirestore('notifications', updatedNotifs, tenantId);

        const currentActiveTenant = localStorage.getItem('defib_tenant_id') || 'demo';
        if (currentActiveTenant === tenantId || currentActiveTenant.replace(/^d/i, '') === tenantId.replace(/^d/i, '')) {
          localStorage.setItem(`defib_${currentActiveTenant}_notifications`, JSON.stringify(updatedNotifs));
        }
      } catch (notifErr) {
        console.warn("Failed to save corresponding system notification:", notifErr);
      }

      setIsSubmitted(true);
      // Clear inputs
      setNomPrenom('');
      setCommentaire('');
      setQualite(null);
      setPonctualite(null);
      setPolitesse(null);
      setClartePdf(null);
      setExplications(null);
      setSensibilisation(null);
      setNpsScore(null);
    } catch (err: any) {
      console.error("Error submitting review:", err);
      setErrorMessage("Une erreur est survenue lors de l'enregistrement de votre évaluation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans relative"
      id="satisfaction-viewport-wrapper"
      style={{ backgroundColor: 'rgb(233, 235, 239)' }}
    >
      <style>{`
        body {
          background: rgb(233, 235, 239) !important;
        }

        #satisfaction-card input, #satisfaction-card select, #satisfaction-card textarea {
          border: 1px solid #DCE1EA !important;
          border-radius: 13px !important;
          padding: 14px !important;
          font-size: 18px !important;
          font-weight: 300 !important;
          color: #000000 !important;
          background-color: #ffffff !important;
          outline: none !important;
          transition: 0s !important;
          font-family: 'DefibeoMain', 'Civilprom', sans-serif !important;
        }

        #satisfaction-card input::placeholder,
        #satisfaction-card select::placeholder,
        #satisfaction-card textarea::placeholder {
          color: #BECADB !important;
          font-size: 18px !important;
          opacity: 1 !important;
        }

        #satisfaction-card button {
          transition: 0s !important;
        }

        #satisfaction-card input:focus, #satisfaction-card select:focus, #satisfaction-card textarea:focus, #satisfaction-card button[type="submit"]:focus,
        #satisfaction-card input:hover, #satisfaction-card select:hover, #satisfaction-card textarea:hover, #satisfaction-card button[type="submit"]:hover {
          outline: 2.5px solid rgb(46, 84, 255) !important;
          outline-offset: 3px !important;
        }
      `}</style>

      <div className="sm:mx-auto w-full max-w-lg">
        {/* Outer Container */}
        <div
          className="p-2 sm:p-4 relative overflow-hidden"
          id="satisfaction-card"
          style={{ backgroundColor: 'rgb(233, 235, 239)' }}
        >
          
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {errorMessage && (
              <div className="p-4 bg-rose-50 text-rose-700 border border-rose-100 rounded-xl text-xs font-sans">
                {errorMessage}
              </div>
            )}

            {/* RÉFÉRENCE INTERVENTION FIELD */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="intervention_ref" className="font-bold font-sans" style={{ color: '#000000', fontSize: '18px' }}>
                {t("Référence intervention (renseignée automatiquement).") || "Référence intervention (renseignée automatiquement)."}
              </label>
              <input
                id="intervention_ref"
                type="text"
                placeholder={t("Référence intervention")}
                value={interventionRef}
                onChange={(e) => setInterventionRef(e.target.value)}
                className="w-full text-black"
                style={{
                  backgroundColor: '#ffffff',
                  color: '#000000',
                  borderColor: '#DCE1EA',
                  fontSize: '18px',
                }}
              />
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
                  fontSize: '18px', 
                  textAlign: 'center', 
                  marginTop: '55px', 
                  backgroundColor: 'rgb(210, 45, 11)', 
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
                              backgroundColor: 'rgb(46, 84, 255)',
                              color: '#ffffff',
                              boxShadow: 'none',
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
                              backgroundColor: '#ffffff',
                              color: '#000000',
                              boxShadow: 'none',
                              border: 'none',
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

            {/* QUESTION RECOMMANDATION / NPS (1 à 10) */}
            <div className="flex flex-col gap-2 pt-8 mt-4" style={{ paddingTop: '32px' }}>
              <label className="font-bold font-sans" style={{ color: '#000000', fontSize: '18px' }}>
                {t("Quelle est la probabilité que vous nous recommandiez?")}
              </label>
              <div className="grid grid-cols-10 gap-1 sm:gap-1.5 text-center">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                  const isSelected = npsScore === num;

                  const btnStyle: React.CSSProperties = isSelected
                    ? {
                        backgroundColor: 'rgb(46, 84, 255)',
                        color: '#ffffff',
                        boxShadow: 'none',
                        border: 'none',
                        borderRadius: '12px',
                        fontSize: '18px',
                        padding: '10px 0px',
                        fontWeight: 'bold',
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                        cursor: 'pointer',
                        transition: '0s',
                      }
                    : {
                        backgroundColor: '#ffffff',
                        color: '#000000',
                        boxShadow: 'none',
                        border: 'none',
                        borderRadius: '12px',
                        fontSize: '18px',
                        padding: '10px 0px',
                        fontWeight: 'bold',
                        fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                        cursor: 'pointer',
                        transition: '0s',
                      };

                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setNpsScore(num)}
                      style={btnStyle}
                      className="active:scale-98 min-w-0"
                    >
                      {num}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* COMMENTAIRE */}
            <div className="flex flex-col gap-1.5 pt-4">
              <label htmlFor="commentaire" className="font-bold font-sans" style={{ color: '#000000', fontSize: '18px' }}>
                {t("Commentaire (max. 250 caractères).") || "Commentaire (max. 250 caractères)."}
              </label>
              <textarea
                id="commentaire"
                required
                maxLength={250}
                rows={4}
                placeholder={t("Entrez votre commentaire.")}
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value.slice(0, 250))}
                className="w-full text-black"
              />
            </div>

            {/* SUBMIT BUTTON */}
            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              style={{
                backgroundColor: 'rgb(46, 84, 255)',
                color: '#ffffff',
                boxShadow: 'none',
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
                opacity: isFormValid && !isSubmitting ? 1 : 0.65,
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


