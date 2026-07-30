import React, { useState } from 'react';
import { t } from '../utils/translate';
import { Member } from '../types';
import { MapPin } from 'lucide-react';

interface LocalisationsTabProps {
  members: Member[];
}

export default function LocalisationsTab({ members }: LocalisationsTabProps) {
  // Search States
  const [search, setSearch] = useState('');
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Brand aesthetic styling constants
  const thStyle: React.CSSProperties = {
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    fontWeight: 100,
    letterSpacing: 'normal',
    textTransform: 'none',
    color: '#000000',
    cursor: 'default',
  };

  const linkButtonStyle: React.CSSProperties = {
    backgroundColor: '#000',
    color: '#fff',
    boxShadow: 'inset 0 1px 1px #ffffff00, 0 1px 2px #08080833, 0 4px 4px #ffffff00, 0 7px 0 -12px #000000, inset 0 6px 12px #ffffff36',
    borderRadius: '10px',
    fontSize: '18px',
    padding: '11px 22px',
    fontWeight: '100',
    transition: 'all 0s ease-in-out',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    border: 'none',
  };

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

  // Searching logic
  const filteredMembers = members.filter((m) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-fadeIn" id="localisations-tab-container-harmonized">
      <style>{`
        #localisations-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):not(#search-localisations-input),
        #localisations-tab-container-harmonized select,
        #localisations-tab-container-harmonized textarea {
          padding: 12px !important;
          border: 1px solid #dedede !important;
          border-radius: 13px !important;
          font-size: 16px !important;
          font-weight: 100 !important;
          background: #ffffff !important;
          color: #000000 !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          box-sizing: border-box !important;
          outline: none !important;
          transition: all 0s !important;
        }
        #localisations-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):hover:not(:disabled):not(#search-localisations-input),
        #localisations-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]):focus:not(:disabled):not(#search-localisations-input),
        #localisations-tab-container-harmonized #search-localisations-input:hover,
        #localisations-tab-container-harmonized #search-localisations-input:focus {
          outline: 2.5px solid #fa53d5 !important;
          outline-offset: 2px !important;
          transition: all 0s !important;
        }
        #localisations-tab-container-harmonized input#search-localisations-input {
          font-size: 18px !important;
        }
        #localisations-tab-container-harmonized input#search-localisations-input::placeholder {
          font-size: 18px !important;
          font-family: "DefibeoMain", "Civilprom", sans-serif !important;
          font-weight: 100 !important;
        }
      `}</style>
      
      {/* Header Box aligned with other modules */}
      <div 
        className="bg-white space-y-4 animate-fadeIn"
        style={{ border: '1px solid #dadada', borderTop: 'none', borderRadius: '0px 0px 18px 18px', maxWidth: '98%', margin: 'auto', padding: '20px', backgroundColor: '#ffffff' }}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-wrap bg-white">
          <div>
            <h2 className="text-2xl font-bold tracking-tight font-gochi bg-white" style={{ color: '#000000', cursor: 'default' }} id="localisations-tab-title">Localisations</h2>
          </div>

          <div className="flex flex-wrap items-center gap-3 bg-white">
            {/* Search Bar Input */}
            <div className="relative w-full sm:w-80 bg-white">
              <input
                type="text"
                id="search-localisations-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
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

      {/* Main Table Content */}
      <div className="bg-white overflow-hidden mt-6 rounded-none animate-fadeIn" style={{ border: 'none', borderRadius: '0px', boxShadow: 'none' }}>
        <div className="overflow-x-auto">
          {filteredMembers.length === 0 ? (
            <div className="p-16 text-center font-sans lg:py-24" id="no-members-view">
              <p style={{ color: '#000000', fontSize: '16px', fontWeight: 100, marginBottom: '8px' }}>
                {search ? "Aucun résultat." : "Aucun collaborateur enregistré"}
              </p>
              {!search && (
                <p style={{ color: '#888888', fontSize: '13px', fontWeight: 100 }}>
                  Enregistrez d'abord des collaborateurs dans la section Équipe.
                </p>
              )}
            </div>
          ) : (
            <table className="w-full text-left font-sans border-collapse text-xs" id="localisations-table" style={{ borderTop: '1px solid rgb(218, 218, 218)', borderBottom: '1px solid rgb(218, 218, 218)' }}>
              <thead>
                <tr className="bg-transparent">
                  <th className="px-5 py-3.5 w-[50%]" style={thStyle}>{t("Technicien.")}</th>
                  <th className="px-5 py-3.5 w-[50%]" style={thStyle}>{t("Situation du partage.")}</th>
                </tr>
              </thead>
              <tbody className="text-slate-700 text-xs">
                {filteredMembers.map((m) => {
                  const locationLink = m.gpsSharingLink || localStorage.getItem(`defib_tech_location_link_${m.name}`) || "";

                  return (
                    <tr key={m.name} className="group hover:bg-[#ffecf8] transition-all cursor-pointer">
                      
                      {/* Name only (no email, no role, no address) */}
                      <td className="px-5 py-5 font-sans" style={{ fontSize: '16px', color: '#000000', fontWeight: 100, fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>
                        <div className="font-bold text-black" style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}>{m.name}</div>
                      </td>

                      {/* Situation du partage status text */}
                      <td className="px-5 py-5 font-sans bg-transparent" onClick={(e) => e.stopPropagation()}>
                        {locationLink === "Partagé" ? (
                          <span className="text-emerald-600 font-bold text-[18px]">{t("Partagé")}</span>
                        ) : (
                          <span className="text-rose-600 font-bold text-[18px]">{t("Non partagé")}</span>
                        )}
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
