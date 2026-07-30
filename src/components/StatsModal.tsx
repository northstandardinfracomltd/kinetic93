import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { t } from '../utils/translate';
import { Defibrillateur, Client, Variable, StockRecord, PointageLog } from '../types';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defibrillateurs: Defibrillateur[];
  clients: Client[];
  variables: Variable[];
  isPage?: boolean;
  stocks?: StockRecord[];
  pointages?: PointageLog[];
  customerReviews?: any[];
  fsmTours?: any[];
}

export default function StatsModal({
  isOpen,
  onClose,
  defibrillateurs,
  clients,
  variables,
  isPage = false,
  stocks,
  pointages,
  customerReviews,
  fsmTours
}: StatsModalProps) {
  if (!isPage && !isOpen) return null;

  // Today and threshold dates
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => {
    return today.toISOString().split('T')[0];
  }, [today]);

  const threeMonthsStr = useMemo(() => {
    const d = new Date(today);
    d.setMonth(today.getMonth() + 3);
    return d.toISOString().split('T')[0];
  }, [today]);

  const sixMonthsStr = useMemo(() => {
    const d = new Date(today);
    d.setMonth(today.getMonth() + 6);
    return d.toISOString().split('T')[0];
  }, [today]);

  // Fallbacks to localStorage
  const resolvedStocks = useMemo(() => {
    if (stocks !== undefined) return stocks;
    try {
      const saved = localStorage.getItem('defib_stocks');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }, [stocks]);

  const resolvedPointages = useMemo(() => {
    if (pointages !== undefined) return pointages;
    try {
      const saved = localStorage.getItem('defib_pointages_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }, [pointages]);

  const resolvedReviews = useMemo(() => {
    if (customerReviews !== undefined) return customerReviews;
    try {
      const saved = localStorage.getItem('defib_customer_reviews');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }, [customerReviews]);

  const resolvedFsmTours = useMemo(() => {
    if (fsmTours !== undefined) return fsmTours;
    try {
      const saved = localStorage.getItem('defib_fsm_tours');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }, [fsmTours]);

  // Helper to get minimum peremption date of a defibrillator
  const getEarliestPeremption = (d: Defibrillateur): string | null => {
    const dates: string[] = [];
    if (d.peremptionElectrodeA && d.peremptionElectrodeA.trim()) dates.push(d.peremptionElectrodeA.trim());
    if (d.peremptionElectrodeP && d.peremptionElectrodeP.trim()) dates.push(d.peremptionElectrodeP.trim());
    if (d.peremptionBatterie && d.peremptionBatterie.trim()) dates.push(d.peremptionBatterie.trim());
    if (dates.length === 0) return null;
    return dates.sort()[0];
  };

  // 1. Volume de Défibrillateurs
  const totalDefibs = defibrillateurs.length;

  // 2. Action requise expirée
  const actionExpireeCount = useMemo(() => {
    return defibrillateurs.filter(d => {
      const earliest = getEarliestPeremption(d);
      return earliest !== null && earliest < todayStr;
    }).length;
  }, [defibrillateurs, todayStr]);

  // 3. Action requise sous 3 mois
  const actionUnder3mCount = useMemo(() => {
    return defibrillateurs.filter(d => {
      const earliest = getEarliestPeremption(d);
      return earliest !== null && earliest >= todayStr && earliest <= threeMonthsStr;
    }).length;
  }, [defibrillateurs, todayStr, threeMonthsStr]);

  // 4. Action requise sous 3 à 6 mois
  const action3to6mCount = useMemo(() => {
    return defibrillateurs.filter(d => {
      const earliest = getEarliestPeremption(d);
      return earliest !== null && earliest > threeMonthsStr && earliest <= sixMonthsStr;
    }).length;
  }, [defibrillateurs, threeMonthsStr, sixMonthsStr]);

  // 5. Taux de conformité
  const complianceRate = useMemo(() => {
    const conformCount = defibrillateurs.filter(d => d.conforme === 'Oui').length;
    return totalDefibs > 0 ? Math.round((conformCount / totalDefibs) * 100) : 100;
  }, [defibrillateurs, totalDefibs]);

  // 6. Valeur totale du stock
  const totalStockValueStr = useMemo(() => {
    const totalVal = resolvedStocks.reduce((sum, item) => {
      const qty = typeof item.quantite === 'number' ? item.quantite : parseFloat(item.quantite as any) || 0;
      const price = typeof item.valeurAchat === 'number' ? item.valeurAchat : parseFloat(item.valeurAchat as any) || 0;
      return sum + (qty * price);
    }, 0);
    return `${totalVal.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}€`;
  }, [resolvedStocks]);

  // 7. Temps moyen durée d’une maintenance
  const avgMaintenanceDuration = useMemo(() => {
    const finished = resolvedPointages.filter(p => !p.isOngoing);
    if (finished.length === 0) return "N/A";

    const totalSeconds = finished.reduce((sum, p) => {
      if (p.durationSeconds !== undefined) return sum + p.durationSeconds;
      if (p.startDate && p.startTime && p.endDate && p.endTime) {
        try {
          const start = new Date(`${p.startDate}T${p.startTime}`);
          const end = new Date(`${p.endDate}T${p.endTime}`);
          const diff = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
          return sum + diff;
        } catch {
          return sum;
        }
      }
      return sum;
    }, 0);

    const avgSeconds = totalSeconds / finished.length;
    const hours = Math.floor(avgSeconds / 3600);
    const minutes = Math.round((avgSeconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }
    return `${minutes} min`;
  }, [resolvedPointages]);

  // 8. Satisfaction moyenne
  const avgSatisfaction = useMemo(() => {
    if (resolvedReviews.length === 0) return "Aucun avis";
    const counts: Record<string, number> = {};
    resolvedReviews.forEach((r: any) => {
      if (r.label) {
        const trimmed = r.label.trim();
        counts[trimmed] = (counts[trimmed] || 0) + 1;
      }
    });

    let maxCount = -1;
    let modeLabel = "N/A";
    Object.entries(counts).forEach(([label, count]) => {
      if (count > maxCount) {
        maxCount = count;
        modeLabel = label;
      }
    });
    return modeLabel;
  }, [resolvedReviews]);

  // 9. Tournées ouvertes
  const openToursCount = useMemo(() => {
    return resolvedFsmTours.filter((tour: any) => 
      tour.status === 'Brouillon' || 
      tour.status === 'À faire' || 
      tour.status === 'En cours'
    ).length;
  }, [resolvedFsmTours]);

  // Stats items structure for mapping
  const statsList = [
    { value: totalDefibs, label: "Volume Défibrillateur(s)." },
    { value: actionExpireeCount, label: "Action(s) requise(s) expirée(s) Défibrillateur(s)." },
    { value: actionUnder3mCount, label: "Action(s) requise(s) sous 3 mois Défibrillateur(s)." },
    { value: action3to6mCount, label: "Action(s) requise(s) sous 3 à 6 mois Défibrillateur(s)." },
    { value: `${complianceRate}%`, label: "Taux de conformité Défibrillateur(s)." },
    { value: totalStockValueStr, label: "Valeur pièce(s) stocké(s)." },
    { value: avgMaintenanceDuration, label: "Temps moyen durée d’une maintenance." },
    { value: avgSatisfaction, label: "Satisfaction moyenne." },
    { value: openToursCount, label: "Tournée(s) ouverte(s)." }
  ];

  // Rounded button style for Actualiser
  const roundedButtonStyle: React.CSSProperties = {
    backgroundColor: '#000000',
    color: '#ffffff',
    boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
    borderRadius: '10px',
    fontSize: '16px',
    padding: '11px 22px',
    fontWeight: '100',
    transition: 'all 0s ease-in-out',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    border: 'none',
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
  };

  const roundedButton18Style: React.CSSProperties = {
    ...roundedButtonStyle,
    fontSize: '18px',
    padding: '9px 19px',
  };

  const modalContent = (
    <div className="bg-transparent w-full flex flex-col overflow-hidden select-none" style={{ cursor: 'default' }}>
      {/* Header aligned with other sections */}
      <div 
        className="flex items-center justify-between"
        style={isPage ? {
          border: '1px solid #dadada',
          borderTop: 'none',
          borderRadius: '0px 0px 18px 18px',
          maxWidth: '98%',
          margin: 'auto',
          padding: '20px',
          backgroundColor: '#ffffff',
          width: '100%'
        } : {
          padding: '20px',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #dadada'
        }}
      >
        <div className="flex items-center gap-2">
          <div>
            <h3 className="text-2xl font-bold text-black font-gochi cursor-default" style={{ cursor: 'default' }}>{t("Statistiques")}</h3>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={roundedButton18Style}
            className="transition-all text-white bg-black rounded cursor-pointer"
          >
            <span>{t("Actualiser")}</span>
          </button>
          {!isPage && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Grid of 3 columns, perfectly styled */}
      <div 
        className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 pb-12 w-full"
        style={{ 
          maxWidth: '98%', 
          margin: '24px auto auto auto',
          padding: '0 4px'
        }}
        id="stats-cards-grid"
      >
        {statsList.map((item, index) => (
          <div 
            key={index}
            style={{
              border: '1px solid rgb(218, 218, 218)',
              borderRadius: '18px',
              padding: '28px 20px',
              backgroundColor: 'transparent',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              textAlign: 'center',
              minHeight: '140px',
              cursor: 'default'
            }}
            className="shadow-3xs transition-all hover:border-slate-350"
          >
            <div style={{ fontSize: '30px', fontWeight: 900, color: '#000000', fontFamily: "'Gochi', cursive, sans-serif", cursor: 'default' }}>
              {item.value}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 500, color: '#000000', marginTop: '8px', fontFamily: "'DefibeoMain', 'Civilprom', sans-serif", cursor: 'default', letterSpacing: 'normal' }}>
              {t(item.label)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (isPage) {
    return modalContent;
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 sm:p-6 shadow-2xl animate-fadeIn" id="stats-modal-overlay">
      <div 
        className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-y-auto border border-slate-200 flex flex-col transform transition-all animate-scaleUp max-h-[90vh]"
        id="stats-modal-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {modalContent}
      </div>
    </div>
  );
}
