import React, { useState } from 'react';
import { VeilleRecord } from '../types';
import { t } from '../utils/translate';
import HelpBubble from './HelpBubble';

interface VeillesTabProps {
  veilles: VeilleRecord[];
  onDeleteVeille: (id: string) => void;
}

export default function VeillesTab({ veilles, onDeleteVeille }: VeillesTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

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

  const thStyle: React.CSSProperties = {
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    fontWeight: 100,
    letterSpacing: 'normal',
    textTransform: 'none',
    color: '#000000',
    cursor: 'default',
  };

  const tdStyle: React.CSSProperties = {
    fontSize: '18px',
    color: '#000000',
    fontWeight: 100,
    fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
  };

  const actionButton18Style: React.CSSProperties = {
    backgroundColor: '#000',
    color: '#fff',
    boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
    borderRadius: '0.75rem',
    fontSize: '18px',
    padding: '11px 22px',
    fontWeight: '100',
    transition: 'all 0s ease-in-out',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.4rem',
    cursor: 'pointer',
    border: 'none',
  };

  const filteredVeilles = veilles.filter((v) => {
    const term = searchTerm.toLowerCase();
    return (
      v.commune.toLowerCase().includes(term) ||
      v.mainteneurActuel.toLowerCase().includes(term) ||
      v.contactNomPrenom.toLowerCase().includes(term) ||
      v.contactEmail.toLowerCase().includes(term) ||
      v.contactTelephone.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 animate-fadeIn" id="veilles-tab-container">
      {/* Header Panel */}
      <div 
        className="bg-white space-y-4"
        style={{ border: '1px solid #dadada', borderTop: 'none', borderRadius: '0px 0px 18px 18px', maxWidth: '98%', margin: 'auto', padding: '20px', backgroundColor: '#ffffff' }}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap bg-white">
          <div>
            <h2 className="text-2xl font-bold tracking-tight font-gochi bg-white" style={{ color: '#000000', cursor: 'default', fontFamily: 'Gochi, sans-serif' }} id="veilles-tab-title">
              {t('Relevé Concurrentiel')}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3 bg-white">
            <div className="relative w-full sm:w-80 bg-white">
              <input
                type="text"
                id="search-veilles-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Recherche."
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

      <HelpBubble 
        cacheKey="help_dismissed_veilles" 
        text="Le relevé concurrentiel vous permet d’enregistrer des informations sur les parcs de défibrillateurs de communes ou d'entreprises qui ne sont pas encore vos clients. Notez qui est le mainteneur actuel, la date d’échéance de leur marché public, et les coordonnées du contact. Cela vous permettra de les relancer au bon moment pour leur proposer une offre concurrente." 
      />

      {/* Table Records Panel */}
      <div className="bg-white overflow-hidden mt-6 rounded-none" style={{ border: 'none', borderRadius: '0px', boxShadow: 'none' }}>
        <div className="overflow-x-auto">
          {filteredVeilles.length === 0 ? (
            <div className="p-16 text-center font-sans lg:py-24" id="no-veilles-view">
              <p style={{ color: '#000000', fontSize: '16px', fontWeight: 100 }}>
                Aucun résultat.
              </p>
            </div>
          ) : (
            <table className="w-full text-left font-sans border-collapse text-xs" id="veilles-table" style={{ borderTop: '1px solid rgb(218, 218, 218)', borderBottom: '1px solid rgb(218, 218, 218)' }}>
              <thead>
                <tr className="bg-transparent">
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Commune.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Volume.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Mainteneur.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Prochaine.Maint.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Contact.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Email.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap" style={thStyle}>Téléphone.</th>
                  <th className="px-4 py-3.5 text-right w-24 whitespace-nowrap" style={thStyle}>Actions.</th>
                </tr>
              </thead>
              <tbody className="text-slate-700 text-xs">
                {filteredVeilles.map((v) => (
                  <tr key={v.id} className="group hover:bg-[#ffecf8] transition-all cursor-pointer border-b border-slate-100">
                    <td className="px-4 py-5 whitespace-nowrap" style={tdStyle}>
                      <div className="font-bold text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif"' }}>{v.commune}</div>
                    </td>
                    <td className="px-4 py-5 whitespace-nowrap" style={tdStyle}>
                      {v.volume}
                    </td>
                    <td className="px-4 py-5 whitespace-nowrap" style={tdStyle}>
                      {v.mainteneurActuel}
                    </td>
                    <td className="px-4 py-5 whitespace-nowrap" style={tdStyle}>
                      {v.prochaineMaintenance ? new Date(v.prochaineMaintenance).toLocaleDateString('fr-FR') : '-'}
                    </td>
                    <td className="px-4 py-5 whitespace-nowrap" style={tdStyle}>
                      {v.contactNomPrenom}
                    </td>
                    <td className="px-4 py-5 whitespace-nowrap" style={tdStyle}>
                      <a href={`mailto:${v.contactEmail}`} className="text-blue-600 hover:underline">
                        {v.contactEmail}
                      </a>
                    </td>
                    <td className="px-4 py-5 whitespace-nowrap text-slate-500" style={tdStyle}>
                      {v.contactTelephone}
                    </td>
                    <td className="px-4 py-5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onDeleteVeille(v.id)}
                        style={actionButton18Style}
                        className="cursor-pointer font-sans bg-black rounded"
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
