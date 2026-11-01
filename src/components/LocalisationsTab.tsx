import React, { useState } from 'react';
import { t } from '../utils/translate';
import { Member } from '../types';
import { MapPin } from 'lucide-react';

interface LocalisationsTabProps {
  members: Member[];
}

export default function LocalisationsTab({ members }: LocalisationsTabProps) {
  // Brand aesthetic styling constants
  const thStyle: React.CSSProperties = {
    fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
    fontWeight: 100,
    letterSpacing: 'normal',
    textTransform: 'none',
    color: 'rgb(80 97 122)',
    cursor: 'default',
  };

  // Filter technicians only
  const isTechnician = (m: Member) => {
    if (!m) return false;
    const roleLower = (m.role || '').toLowerCase();
    return m.role === 'Technicien' || m.role === 'Maintenance Terrain' || roleLower.includes('tech');
  };

  const filteredMembers = members.filter(isTechnician);

  return (
    <div className="space-y-6 animate-fadeIn" id="localisations-tab-container-harmonized">
      <style>{`
        #localisations-tab-container-harmonized input:not([type="radio"]):not([type="checkbox"]),
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
        #localisations-tab-container-harmonized thead th {
          color: rgb(80 97 122) !important;
        }
        #localisations-tab-container-harmonized tbody tr:hover {
          background-color: rgb(245, 247, 250) !important;
        }
      `}</style>

      {/* Main Table Content */}
      <div className="bg-white overflow-hidden mt-6 rounded-none animate-fadeIn" style={{ border: 'none', borderRadius: '0px', boxShadow: 'none' }}>
        <div className="overflow-x-auto">
          {filteredMembers.length === 0 ? (
            <div className="p-16 text-center font-sans lg:py-24" id="no-members-view">
              <img
                src="https://civilprom.s3.eu-north-1.amazonaws.com/illustration_nodatadefibeo.svg"
                alt=""
                className="mx-auto mb-4 block select-none pointer-events-none"
                style={{ width: '200px', height: 'auto' }}
                referrerPolicy="no-referrer"
              />
              <p style={{ color: '#000000', fontSize: '16px', fontWeight: 100, marginBottom: '8px' }}>
                Aucun technicien enregistré
              </p>
              <p style={{ color: '#888888', fontSize: '13px', fontWeight: 100 }}>
                Enregistrez d'abord des techniciens dans la section Équipe.
              </p>
            </div>
          ) : (
            <table className="w-full text-left font-sans border-collapse text-xs" id="localisations-table" style={{ borderTop: 'none', borderBottom: '1px solid rgb(218, 218, 218)' }}>
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
                    <tr key={m.name} className="group hover:bg-[rgb(245,247,250)] transition-all cursor-pointer">
                      
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
