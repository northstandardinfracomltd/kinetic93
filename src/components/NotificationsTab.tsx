import React, { useState } from 'react';
import { AppNotification } from '../types';
import { t } from '../utils/translate';
import { formatNotificationTimestamp } from '../utils/dateUtils';

interface NotificationsTabProps {
  notifications: AppNotification[];
  onUpdateNotifications: (updated: AppNotification[]) => void;
}

export default function NotificationsTab({
  notifications,
  onUpdateNotifications,
}: NotificationsTabProps) {
  const [search, setSearch] = useState('');
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Harmonized search input style
  const searchInputStyle: React.CSSProperties = {
    border: '1px solid #dedede',
    borderRadius: '13px',
    padding: '9px 19px',
    fontSize: '18px',
    fontWeight: '100',
    color: '#000000',
    backgroundColor: '#ffffff',
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    outline: (isSearchHovered || isSearchFocused) ? '2.5px solid #fa53d5' : 'none',
    outlineOffset: (isSearchHovered || isSearchFocused) ? '2px' : '0px',
    transition: 'all 0s',
  };

  const handleSituationChange = (id: string, newSituation: AppNotification['situation']) => {
    const updated = notifications.map(n => n.id === id ? { ...n, situation: newSituation } : n);
    onUpdateNotifications(updated);
  };

  const allNotifications = React.useMemo(() => {
    return notifications
      .filter(n => 
        n && 
        typeof n.title === 'string' && 
        n.title.trim() && 
        typeof n.category === 'string' && 
        n.category.trim() && 
        !n.title.toUpperCase().includes('CONSTAT DE MAINTENANCE')
      )
      .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  }, [notifications]);

  const filtered = allNotifications.filter((notif) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (notif.title && notif.title.toLowerCase().includes(q)) ||
      (notif.category && notif.category.toLowerCase().includes(q)) ||
      (notif.timestamp && notif.timestamp.toLowerCase().includes(q)) ||
      (notif.situation && notif.situation.toLowerCase().includes(q))
    );
  });

  const getCategoryBadgeClass = (category: AppNotification['category']) => {
    switch (category) {
      case 'Stocks':
        return 'bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-200';
      case 'Défibrillateurs':
        return 'bg-rose-50 text-rose-800 border border-rose-200';
      case 'Interventions':
        return 'bg-indigo-50 text-indigo-800 border border-indigo-200';
      case 'Factures & Devis':
        return 'bg-cyan-50 text-cyan-800 border border-cyan-200';
      case 'Système':
        default:
        return 'bg-slate-100 text-slate-800 border border-slate-200';
    }
  };

  const getSituationClass = (situation: AppNotification['situation']) => {
    switch (situation) {
      case 'Nouveau':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'En cours':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'Terminé':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      default:
        return 'bg-slate-50 text-slate-850 border-slate-200';
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn" id="notifications-tab-container">
      <style>{`
        #notifications-tab-container select {
          cursor: pointer;
        }
        #notifications-tab-container select option {
          color: #000000 !important;
          background: #ffffff !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
        }
      `}</style>

      {/* Header Panel */}
      <div 
        className="bg-white space-y-4"
        style={{ border: '1px solid #dadada', borderTop: 'none', borderRadius: '0px 0px 18px 18px', maxWidth: '98%', margin: 'auto', padding: '20px', backgroundColor: '#ffffff' }}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap bg-white">
          <div>
            <h2 className="text-2xl font-bold tracking-tight font-gochi bg-white" style={{ color: '#000000', cursor: 'default', fontFamily: 'Gochi, sans-serif' }} id="notifications-tab-title">
              {t("Notifications")}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3 bg-white">
            <div className="relative w-full sm:w-80 bg-white">
              <input
                type="text"
                id="search-notifications-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Recherche.")}
                className="w-full text-black placeholder-[#747474] placeholder:font-light outline-none"
                style={searchInputStyle}
                onMouseEnter={() => setIsSearchHovered(true)}
                onMouseLeave={() => setIsSearchHovered(false)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table Records Panel */}
      <div className="bg-white overflow-hidden mt-6 rounded-none" style={{ border: 'none', borderRadius: '0px', boxShadow: 'none' }}>
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="p-16 text-center font-sans lg:py-24" id="no-notifications-view">
              <p style={{ color: '#000000', fontSize: '16px', fontWeight: 100 }}>
                {t("Aucun résultat.")}
              </p>
            </div>
          ) : (
            <table className="w-full text-left font-sans border-collapse text-xs" id="notifications-table" style={{ borderTop: '1px solid rgb(218, 218, 218)', borderBottom: '1px solid rgb(218, 218, 218)' }}>
              <thead>
                <tr className="bg-transparent">
                  <th className="px-4 py-3.5 text-black font-semibold" style={{ fontFamily: "'DefibeoMain', 'Civilprom', sans-serif'", cursor: 'default' }}>{t("Catégorie.")}</th>
                  <th className="px-4 py-3.5 text-black font-semibold" style={{ fontFamily: "'DefibeoMain', 'Civilprom', sans-serif'", cursor: 'default' }}>{t("Titre.")}</th>
                  <th className="px-4 py-3.5 text-black font-semibold" style={{ fontFamily: "'DefibeoMain', 'Civilprom', sans-serif'", cursor: 'default' }}>{t("Horodatage.")}</th>
                  <th className="px-4 py-3.5 text-black font-semibold w-44" style={{ fontFamily: "'DefibeoMain', 'Civilprom', sans-serif'", cursor: 'default' }}>{t("Situation.")}</th>
                </tr>
              </thead>
              <tbody className="text-slate-700 text-xs">
                {filtered.map((notif) => {
                  return (
                    <tr key={notif.id} className="group hover:bg-[#ffecf8] transition-all border-b border-slate-100 last:border-b-0">
                      
                      {/* Catégorie */}
                      <td className="px-4 py-4 font-sans whitespace-nowrap text-left" style={{ cursor: 'default' }}>
                        <div 
                          style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            border: '1px solid rgb(231, 231, 231)',
                            borderRadius: '1000px',
                            padding: '4px 12px',
                            backgroundColor: '#ffffff',
                            cursor: 'default'
                          }} 
                          className="whitespace-nowrap"
                        >
                          <span style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif', cursor: 'default' }}>
                            {t(notif.category)}
                          </span>
                        </div>
                      </td>
 
                      {/* Titre */}
                      <td className="px-4 py-4 font-sans leading-relaxed max-w-lg" style={{ fontSize: '18px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif', cursor: 'default' }}>
                        {notif.title}
                      </td>
 
                      {/* Horodatage */}
                      <td className="px-4 py-4 font-sans" style={{ fontSize: '18px', color: '#000000', fontFamily: '"DefibeoMain", "Civilprom", sans-serif', cursor: 'default' }}>
                        {formatNotificationTimestamp(notif.timestamp)}
                      </td>
 
                      {/* Situation (Select with custom color scheme) */}
                      <td className="px-4 py-4 font-sans w-44">
                        <div className="relative">
                          <select
                            value={notif.situation}
                            onChange={(e) => handleSituationChange(notif.id, e.target.value as AppNotification['situation'])}
                            style={{
                              fontSize: '18px',
                              color: '#000000',
                              borderRadius: '13px',
                              borderColor: '#EDEDED',
                              borderWidth: '1px',
                              borderStyle: 'solid',
                              backgroundColor: '#ffffff',
                              fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                              padding: '10px 24px',
                              outline: 'none',
                              width: '100%',
                              appearance: 'none',
                              WebkitAppearance: 'none',
                              MozAppearance: 'none',
                              backgroundImage: 'none',
                              textAlign: 'center',
                              textAlignLast: 'center'
                            }}
                            className="focus:outline-none"
                          >
                            <option value="Nouveau">{t("Nouveau")}</option>
                            <option value="En cours">{t("En cours")}</option>
                            <option value="Terminé">{t("Terminé")}</option>
                          </select>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
