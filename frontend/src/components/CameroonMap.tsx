import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

// Cameroon customs offices with coordinates
const OFFICES = [
  { id: 'DLA001', name: 'Douala Port Principal', lat: 4.0511, lng: 9.7085, type: 'Port',    color: '#3b82f6', risk: 72 },
  { id: 'DLA002', name: 'Douala Aéroport',       lat: 4.0061, lng: 9.7195, type: 'Airport', color: '#8b5cf6', risk: 55 },
  { id: 'KBI001', name: 'Kribi Port Autonome',   lat: 2.9395, lng: 9.9118, type: 'Port',    color: '#10b981', risk: 44 },
  { id: 'YDE001', name: 'Yaoundé Nsimalen',      lat: 3.7225, lng: 11.5533,type: 'Airport', color: '#f59e0b', risk: 38 },
  { id: 'YDE002', name: 'Yaoundé Centre',        lat: 3.8480, lng: 11.5021,type: 'Land',    color: '#ef4444', risk: 61 },
  { id: 'NGD001', name: 'Ngaoundéré Rail',       lat: 7.3220, lng: 13.5833,type: 'Rail',    color: '#06b6d4', risk: 68 },
];

const RISK_COLOR = (r: number) =>
  r >= 70 ? '#ef4444' : r >= 50 ? '#f97316' : r >= 35 ? '#eab308' : '#10b981';

const TYPE_ICON: Record<string, string> = {
  Port: '🚢', Airport: '✈️', Land: '🏢', Rail: '🚂',
};

interface Props {
  selectedBureau?: string;
  onSelect?: (id: string) => void;
  officeStats?: Record<string, { total_sgds: number; fraud_cases: number; efficiency_score: number; total_revenue: number }>;
}

export default function CameroonMap({ selectedBureau = 'ALL', onSelect, officeStats = {} }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  useEffect(() => {
    // Dynamically import Leaflet to avoid SSR issues
    import('leaflet').then(L => {
      if (!mapRef.current || mapInstanceRef.current) return;

      // Fix Leaflet default icon issue
      delete (L.Icon.Default.prototype as unknown as Record<string,unknown>)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapRef.current!, {
        center: [5.0, 12.0],
        zoom: 6,
        zoomControl: true,
        attributionControl: false,
      });

      // Dark CartoDB tiles
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);

      // Add markers
      OFFICES.forEach(office => {
        const stats = officeStats[office.id];
        const radius = stats ? Math.max(12, Math.min(30, Math.sqrt(stats.total_sgds) * 2)) : 16;
        const riskColor = RISK_COLOR(office.risk);

        const circle = L.circleMarker([office.lat, office.lng], {
          radius,
          fillColor: riskColor,
          color: riskColor,
          weight: 2,
          opacity: 0.9,
          fillOpacity: 0.35,
          className: `customs-marker-${office.id}`,
        }).addTo(map);

        // Pulse ring (outer circle)
        L.circleMarker([office.lat, office.lng], {
          radius: radius + 6,
          fillColor: 'transparent',
          color: riskColor,
          weight: 1,
          opacity: 0.3,
          fillOpacity: 0,
        }).addTo(map);

        // Rich popup
        const popupContent = `
          <div style="background:#0f172a;color:#f1f5f9;border-radius:12px;padding:14px;min-width:220px;border:1px solid rgba(255,255,255,0.1);font-family:Inter,sans-serif">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
              <span style="font-size:20px">${TYPE_ICON[office.type]}</span>
              <div>
                <div style="font-size:13px;font-weight:700">${office.name}</div>
                <div style="font-size:10px;color:#64748b">${office.id} · ${office.type}</div>
              </div>
            </div>
            ${stats ? `
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
                <div style="background:rgba(59,130,246,0.1);border-radius:8px;padding:8px;text-align:center">
                  <div style="font-size:16px;font-weight:800;color:#60a5fa">${stats.total_sgds}</div>
                  <div style="font-size:10px;color:#64748b">SGDs</div>
                </div>
                <div style="background:rgba(239,68,68,0.1);border-radius:8px;padding:8px;text-align:center">
                  <div style="font-size:16px;font-weight:800;color:#f87171">${stats.fraud_cases}</div>
                  <div style="font-size:10px;color:#64748b">Fraudes</div>
                </div>
              </div>
              <div style="margin-bottom:6px">
                <div style="display:flex;justify-content:space-between;margin-bottom:3px">
                  <span style="font-size:10px;color:#94a3b8">Efficacité</span>
                  <span style="font-size:11px;font-weight:700;color:#34d399">${stats.efficiency_score}%</span>
                </div>
                <div style="background:rgba(255,255,255,0.08);border-radius:4px;height:4px">
                  <div style="width:${stats.efficiency_score}%;height:100%;background:#10b981;border-radius:4px"></div>
                </div>
              </div>
            ` : ''}
            <div style="display:flex;align-items:center;gap:6px;margin-top:8px">
              <div style="width:8px;height:8px;border-radius:50%;background:${riskColor}"></div>
              <span style="font-size:11px;font-weight:700;color:${riskColor}">Risque: ${office.risk}%</span>
            </div>
            <div style="margin-top:10px;font-size:10px;color:#3b82f6;cursor:pointer;text-align:center;padding:5px;background:rgba(59,130,246,0.1);border-radius:6px;border:1px solid rgba(59,130,246,0.2)">
              Cliquer pour filtrer ce bureau
            </div>
          </div>
        `;

        circle.bindPopup(L.popup({
          className: 'customs-popup',
          maxWidth: 280,
          closeButton: false,
        }).setContent(popupContent));

        circle.on('click', () => {
          setSelected(office.id);
          onSelect?.(office.id);
        });

        circle.on('mouseover', function() {
          this.setStyle({ fillOpacity: 0.6, weight: 3 });
        });
        circle.on('mouseout', function() {
          this.setStyle({ fillOpacity: 0.35, weight: 2 });
        });
      });

      mapInstanceRef.current = map;
      setLeafletLoaded(true);
    });

    return () => {
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}
      className="relative rounded-2xl overflow-hidden" style={{ height: 340 }}>

      {/* Map container */}
      <div ref={mapRef} style={{ height: '100%', width: '100%', background: '#020817' }} />

      {/* Custom popup styles injected */}
      <style>{`
        .customs-popup .leaflet-popup-content-wrapper {
          background: transparent !important;
          border: none !important;
          box-shadow: 0 25px 50px rgba(0,0,0,0.8) !important;
          border-radius: 12px !important;
          padding: 0 !important;
        }
        .customs-popup .leaflet-popup-tip-container { display: none; }
        .customs-popup .leaflet-popup-content { margin: 0 !important; }
        .leaflet-control-zoom { border: 1px solid rgba(255,255,255,0.1) !important; background: rgba(15,23,42,0.9) !important; }
        .leaflet-control-zoom a { background: transparent !important; color: #94a3b8 !important; border-color: rgba(255,255,255,0.06) !important; }
        .leaflet-control-zoom a:hover { background: rgba(59,130,246,0.15) !important; color: #60a5fa !important; }
      `}</style>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-[1000] rounded-xl px-3 py-2"
        style={{ background: 'rgba(9,14,28,0.9)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)' }}>
        <div className="text-[9px] font-bold tracking-widest uppercase text-slate-500 mb-2">Niveau de risque</div>
        {[['#10b981','< 35%'],['#eab308','35–50%'],['#f97316','50–70%'],['#ef4444','> 70%']].map(([c,l]) => (
          <div key={l} className="flex items-center gap-1.5 mb-1">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c }} />
            <span className="text-[10px] text-slate-400">{l}</span>
          </div>
        ))}
      </div>

      {/* Selected badge */}
      {selected && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="absolute top-3 right-3 z-[1000] px-3 py-1.5 rounded-full text-xs font-bold"
          style={{ background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)', color: '#60a5fa', backdropFilter: 'blur(12px)' }}>
          📍 {OFFICES.find(o => o.id === selected)?.name} · Filtre actif
          <button onClick={() => { setSelected(null); onSelect?.('ALL'); }}
            className="ml-2 text-slate-400 hover:text-white">✕</button>
        </motion.div>
      )}
    </motion.div>
  );
}
