import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Member } from '../types';

interface LocalisationsTabProps {
  members: Member[];
  tenantId?: string;
  onClose?: () => void;
}

interface TechLiveLocation {
  name: string;
  email?: string;
  lat: number;
  lng: number;
  updatedAt?: number;
}

function formatTimeAgo(updatedAt: number | undefined, now: number): string {
  if (!updatedAt || isNaN(updatedAt) || updatedAt <= 0) {
    return 'Il y a un moment';
  }
  const diffSec = Math.max(0, Math.floor((now - updatedAt) / 1000));
  if (diffSec < 60) {
    return "Il y a moins d'1 min";
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `Il y a ${diffMin} min`;
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return `Il y a ${diffHours} h`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `Il y a ${diffDays} j`;
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function AutoFitTechBounds({
  points,
  mapRef,
}: {
  points: TechLiveLocation[];
  mapRef: React.MutableRefObject<L.Map | null>;
}) {
  const map = useMap();
  const hasFittedRef = useRef<boolean>(false);

  useEffect(() => {
    mapRef.current = map;
    const timer = setTimeout(() => {
      try {
        map.invalidateSize();
      } catch (_) {}
    }, 100);
    return () => clearTimeout(timer);
  }, [map, mapRef]);

  useEffect(() => {
    if (hasFittedRef.current || points.length === 0) return;
    hasFittedRef.current = true;
    try {
      if (points.length === 1) {
        map.setView([points[0].lat, points[0].lng], 12, { animate: false });
      } else {
        const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
        map.fitBounds(bounds, { padding: [70, 70], maxZoom: 13, animate: false });
      }
    } catch (_) {}
  }, [points, map]);

  return null;
}

export default function LocalisationsTab({ members, tenantId, onClose }: LocalisationsTabProps) {
  const mapRef = useRef<L.Map | null>(null);

  const effectiveTenantId = useMemo(() => {
    if (tenantId) return tenantId;
    try {
      return localStorage.getItem('defib_tenant_id') || 'demo';
    } catch (_) {
      return 'demo';
    }
  }, [tenantId]);

  const [serverLocations, setServerLocations] = useState<Record<string, TechLiveLocation>>({});
  const [nowTs, setNowTs] = useState<number>(() => Date.now());

  useEffect(() => {
    let isMounted = true;

    const fetchLocations = async () => {
      try {
        const res = await fetch(`/api/tech-locations?tenantId=${encodeURIComponent(effectiveTenantId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && data && typeof data.locations === 'object' && data.locations !== null) {
          setServerLocations(data.locations);
        }
      } catch (_) {}
      if (isMounted) {
        setNowTs(Date.now());
      }
    };

    fetchLocations();
    const intervalId = setInterval(fetchLocations, 15000);
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [effectiveTenantId]);

  const isTechnician = (m: Member) => {
    if (!m) return false;
    const roleLower = (m.role || '').toLowerCase();
    return m.role === 'Technicien' || m.role === 'Maintenance Terrain' || roleLower.includes('tech');
  };

  const technicianPoints = useMemo<TechLiveLocation[]>(() => {
    const techMembers = (members || []).filter(isTechnician);
    const results: TechLiveLocation[] = [];
    const seenKeys = new Set<string>();

    for (const m of techMembers) {
      const name = String(m.name || '').trim();
      if (!name) continue;
      const normKey = name.toLowerCase();
      seenKeys.add(normKey);

      const srv = serverLocations[normKey];
      let lat: number | undefined = srv?.lat;
      let lng: number | undefined = srv?.lng;
      let updatedAt: number | undefined = srv?.updatedAt;

      if ((lat === undefined || isNaN(lat) || lng === undefined || isNaN(lng)) && m.lastKnownLat !== undefined && m.lastKnownLng !== undefined) {
        const mLat = Number(m.lastKnownLat);
        const mLng = Number(m.lastKnownLng);
        if (!isNaN(mLat) && !isNaN(mLng)) {
          lat = mLat;
          lng = mLng;
          updatedAt = m.lastKnownLocationAt ? Number(m.lastKnownLocationAt) : undefined;
        }
      }

      if (lat === undefined || isNaN(lat) || lng === undefined || isNaN(lng)) {
        try {
          const localLat = parseFloat(localStorage.getItem(`defib_${effectiveTenantId}_tech_live_lat_${name}`) || '');
          const localLng = parseFloat(localStorage.getItem(`defib_${effectiveTenantId}_tech_live_lng_${name}`) || '');
          const localAt = parseInt(localStorage.getItem(`defib_${effectiveTenantId}_tech_live_at_${name}`) || '', 10);
          if (!isNaN(localLat) && !isNaN(localLng)) {
            lat = localLat;
            lng = localLng;
            if (!isNaN(localAt)) updatedAt = localAt;
          }
        } catch (_) {}
      }

      if ((lat === undefined || isNaN(lat) || lng === undefined || isNaN(lng)) && m.startAddressLat !== undefined && m.startAddressLng !== undefined) {
        const sLat = Number(m.startAddressLat);
        const sLng = Number(m.startAddressLng);
        if (!isNaN(sLat) && !isNaN(sLng) && sLat !== 0 && sLng !== 0) {
          lat = sLat;
          lng = sLng;
        }
      }

      if (lat !== undefined && !isNaN(lat) && lng !== undefined && !isNaN(lng)) {
        results.push({
          name,
          email: m.email,
          lat,
          lng,
          updatedAt,
        });
      }
    }

    // Include any live technician position reported to server even if not yet in filtered local list
    for (const [key, rawSrv] of Object.entries(serverLocations)) {
      const srv = rawSrv as TechLiveLocation | undefined;
      if (!seenKeys.has(key) && srv && !isNaN(Number(srv.lat)) && !isNaN(Number(srv.lng))) {
        results.push({
          name: srv.name || key,
          email: srv.email,
          lat: Number(srv.lat),
          lng: Number(srv.lng),
          updatedAt: srv.updatedAt,
        });
      }
    }

    return results;
  }, [members, serverLocations, effectiveTenantId]);

  const handleSelectTechnician = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedName = e.target.value;
    if (!selectedName) return;
    const target = technicianPoints.find((pt) => pt.name === selectedName);
    if (target && mapRef.current) {
      try {
        mapRef.current.setView([target.lat, target.lng], 15, { animate: true });
      } catch (_) {}
    }
  };

  return (
    <div
      className="w-full h-full flex-1 relative overflow-hidden bg-[#1a1a1a]"
      id="localisations-tab-map-fullheight"
      style={{ width: '100%', height: '100%', minHeight: '100vh' }}
    >
      <style>{`
        @keyframes defibeo-tech-sonar {
          0% {
            box-shadow: 0 0 0 6px rgba(210, 45, 11, 0.38), 0 0 0 0 rgba(210, 45, 11, 0.55);
          }
          70% {
            box-shadow: 0 0 0 8px rgba(210, 45, 11, 0.32), 0 0 0 18px rgba(210, 45, 11, 0);
          }
          100% {
            box-shadow: 0 0 0 6px rgba(210, 45, 11, 0.38), 0 0 0 0 rgba(210, 45, 11, 0);
          }
        }
      `}</style>

      <div className="absolute top-4 right-4 z-[4000] flex items-center gap-3">
        <div className="relative inline-block">
          <button
            type="button"
            id="btn-localisations-select-tech"
            style={{
              backgroundColor: 'rgb(46, 84, 255)',
              boxShadow: 'none',
              borderRadius: '12px',
              fontSize: '18px',
              padding: '9px 19px',
              fontWeight: 'normal',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
              transition: 'all 0.1s ease-in-out',
            }}
            className="hover:opacity-90 cursor-pointer select-none"
          >
            Sélectionner un technicien
          </button>
          <select
            aria-label="Sélectionner un technicien"
            value=""
            onChange={handleSelectTechnician}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
            <option value="" disabled>
              {technicianPoints.length > 0 ? 'Sélectionner un technicien' : 'Aucun technicien localisé'}
            </option>
            {technicianPoints.map((pt) => (
              <option key={pt.name} value={pt.name}>
                {pt.name}
              </option>
            ))}
          </select>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            id="btn-localisations-map-close"
            style={{
              backgroundColor: 'rgb(210, 45, 11)',
              boxShadow: 'none',
              borderRadius: '12px',
              fontSize: '18px',
              padding: '9px 19px',
              fontWeight: 'normal',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              fontFamily: "'DefibeoMain', 'Civilprom', sans-serif",
              transition: 'all 0.1s ease-in-out',
            }}
            className="hover:opacity-90 cursor-pointer select-none"
          >
            Fermer
          </button>
        )}
      </div>

      <MapContainer
        center={[46.603354, 1.888334]}
        zoom={6}
        style={{ width: '100%', height: '100%', minHeight: '100vh', backgroundColor: '#1a1a1a' }}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={20}
        />

        <AutoFitTechBounds points={technicianPoints} mapRef={mapRef} />

        {technicianPoints.map((pt) => {
          const safeName = escapeHtml(pt.name);
          const timeAgoLabel = escapeHtml(formatTimeAgo(pt.updatedAt, nowTs));

          const icon = L.divIcon({
            className: 'defibeo-raw-tech-location-pin',
            html: `
              <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                transform: translate(-50%, calc(-100% + 7px));
                pointer-events: auto;
              ">
                <div style="
                  background-color: #ffffff;
                  border: none;
                  border-radius: 10px;
                  padding: 6px 10px;
                  font-family: 'DefibeoMain', 'Civilprom', sans-serif;
                  white-space: nowrap;
                  text-align: left;
                  margin-bottom: 10px;
                ">
                  <div style="font-size: 14px; font-weight: bold; color: #000000; line-height: 1.25;">${safeName}</div>
                  <div style="font-size: 13px; font-weight: 100; color: #000000; line-height: 1.25; margin-top: 1px;">${timeAgoLabel}</div>
                </div>
                <div style="
                  width: 14px;
                  height: 14px;
                  border-radius: 50%;
                  background-color: rgb(210, 45, 11);
                  border: none;
                  box-shadow: 0 0 0 7px rgba(210, 45, 11, 0.35);
                  animation: defibeo-tech-sonar 2s infinite ease-out;
                  flex-shrink: 0;
                "></div>
              </div>
            `,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          });

          return <Marker key={pt.name} position={[pt.lat, pt.lng]} icon={icon} />;
        })}
      </MapContainer>
    </div>
  );
}
