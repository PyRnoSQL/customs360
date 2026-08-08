import React from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from 'react-leaflet';
import { motion } from 'framer-motion';
import 'leaflet/dist/leaflet.css';

const OFFICES = [
  { id: 'LT1', name: 'Littoral 1 (Douala Port)',    region: 'Littoral',     lat: 4.0511, lng: 9.7085,  type: 'Port',    color: '#3b82f6' },
  { id: 'LT2', name: 'Littoral 2 (Douala Aéroport)', region: 'Littoral',    lat: 4.0061, lng: 9.7195,  type: 'Airport', color: '#8b5cf6' },
  { id: 'SD2', name: 'Sud 2 (Kribi Port)',          region: 'Sud',         lat: 2.9395, lng: 9.9118,  type: 'Port',    color: '#10b981' },
  { id: 'SD1', name: 'Sud 1 (Ebolowa)',             region: 'Sud',         lat: 2.9167, lng: 11.1500, type: 'Land',    color: '#059669' },
  { id: 'CTR', name: 'Centre (Yaoundé)',            region: 'Centre',      lat: 3.8480, lng: 11.5021, type: 'Land',    color: '#f59e0b' },
  { id: 'ADM', name: 'Adamaoua (Ngaoundéré)',       region: 'Adamaoua',    lat: 7.3220, lng: 13.5833, type: 'Rail',    color: '#06b6d4' },
  { id: 'OUE', name: 'Ouest (Bafoussam)',           region: 'Ouest',       lat: 5.4737, lng: 10.4179, type: 'Land',    color: '#a855f7' },
  { id: 'NRD', name: 'Nord (Garoua)',               region: 'Nord',        lat: 9.3017, lng: 13.3921, type: 'Airport', color: '#ef4444' },
  { id: 'EXN', name: 'Extrême-Nord (Maroua)',       region: 'Extrême-Nord',lat: 10.5956, lng: 14.3247, type: 'Land',    color: '#f97316' },
  { id: 'NRO', name: 'Nord-Ouest (Bamenda)',        region: 'Nord-Ouest',  lat: 5.9631, lng: 10.1591, type: 'Land',    color: '#ec4899' },
  { id: 'SUO', name: 'Sud-Ouest (Buea/Limbe)',      region: 'Sud-Ouest',   lat: 4.1560, lng: 9.2410,  type: 'Port',    color: '#14b8a6' },
  { id: 'EST', name: 'Est (Bertoua)',               region: 'Est',         lat: 4.5833, lng: 13.6833, type: 'Land',    color: '#84cc16' },
];

const RISK_COLOR = (r: number) =>
  r >= 70 ? '#ef4444' : r >= 50 ? '#f97316' : r >= 35 ? '#eab308' : '#10b981';

const TYPE_ICON: Record<string, string> = {
  Port: '🚢', Airport: '✈️', Land: '🏢', Rail: '🚂',
};

interface OfficeStats {
  total_sgds: number;
  fraud_cases: number;
  efficiency_score: number;
  total_revenue: number;
}

interface Props {
  selectedBureau?: string;
  onSelect?: (id: string) => void;
  officeStats?: Record<string, OfficeStats>;
}

function fmtRev(v: number) {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + ' Mrd';
  if (v >= 1e6) return Math.round(v / 1e6) + ' MM';
  return v.toString();
}

export default function CameroonMap({ selectedBureau = 'ALL', onSelect, officeStats = {} }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="relative rounded-2xl overflow-hidden"
      style={{ height: 420 }}
    >
      {/* CSS override — strips Leaflet default tooltip chrome */}
      <style>{`
        .cust-tip .leaflet-tooltip {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .cust-tip .leaflet-tooltip::before {
          display: none !important;
        }
        .leaflet-control-zoom {
          border: 1px solid rgba(255,255,255,0.1) !important;
          background: rgba(15,23,42,0.9) !important;
        }
        .leaflet-control-zoom a {
          background: transparent !important;
          color: #94a3b8 !important;
          border-color: rgba(255,255,255,0.06) !important;
        }
        .leaflet-control-zoom a:hover {
          background: rgba(59,130,246,0.15) !important;
          color: #60a5fa !important;
        }
        .leaflet-container { background: #020817 !important; }
      `}</style>

      <MapContainer
        center={[5.5, 12.35]}
        zoom={5}
        zoomControl={true}
        attributionControl={false}
        style={{ height: '100%', width: '100%', background: '#020817' }}
      >
        {/* Dark CartoDB tiles */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={19}
        />

        {OFFICES.map(office => {
          const stats = officeStats[office.id];
          const fraudRate = stats ? stats.fraud_cases / Math.max(stats.total_sgds, 1) : 0;
          const risk = Math.round(fraudRate * 200 + (stats ? (1 - stats.efficiency_score / 100) * 50 : 30));
          const riskColor = RISK_COLOR(Math.min(99, risk));
          const radius = stats
            ? Math.max(10, Math.min(28, Math.sqrt(stats.total_sgds) * 2.2))
            : 14;
          const isSelected = selectedBureau === office.id;
          const pathOptions = {
            fillColor: riskColor,
            color: isSelected ? '#ffffff' : riskColor,
            weight: isSelected ? 3 : 2,
            opacity: 0.9,
            fillOpacity: isSelected ? 0.55 : 0.3,
          };

          return (
            <CircleMarker
              key={office.id}
              center={[office.lat, office.lng]}
              radius={radius}
              pathOptions={pathOptions}
              eventHandlers={{
                click: () => onSelect?.(isSelected ? 'ALL' : office.id),
              }}
            >
              {/* NEXUS360-pattern tooltip */}
              <LeafletTooltip
                className="cust-tip"
                direction="top"
                offset={[0, -radius]}
                opacity={1}
              >
                <div style={{
                  background: '#0f172a',
                  border: `1px solid ${riskColor}`,
                  borderRadius: 12,
                  padding: '12px 16px',
                  minWidth: 220,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
                  fontFamily: 'Inter, sans-serif',
                }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 18 }}>{TYPE_ICON[office.type]}</span>
                    <div>
                      <div style={{ fontWeight: 700, color: office.color, fontSize: 12 }}>
                        {office.name}
                      </div>
                      <div style={{ color: '#64748b', fontSize: 10 }}>
                        {office.id} · {office.region}
                      </div>
                    </div>
                  </div>

                  {/* KPI grid */}
                  {stats ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: '#60a5fa' }}>
                            {stats.total_sgds}
                          </div>
                          <div style={{ color: '#64748b', fontSize: 9 }}>📋 SGDs traités</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: '#f87171' }}>
                            {stats.fraud_cases}
                          </div>
                          <div style={{ color: '#64748b', fontSize: 9 }}>🚨 Fraudes détectées</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: '#34d399' }}>
                            {stats.efficiency_score}%
                          </div>
                          <div style={{ color: '#64748b', fontSize: 9 }}>⚡ Efficacité</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#34d399' }}>
                            {fmtRev(stats.total_revenue)}
                          </div>
                          <div style={{ color: '#64748b', fontSize: 9 }}>💰 Recettes FCFA</div>
                        </div>
                      </div>

                      {/* Efficiency bar */}
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ color: '#94a3b8', fontSize: 9 }}>Efficacité</span>
                          <span style={{ fontWeight: 700, fontSize: 10, color: '#34d399' }}>
                            {stats.efficiency_score}%
                          </span>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 4 }}>
                          <div style={{
                            width: `${stats.efficiency_score}%`,
                            height: '100%',
                            background: '#10b981',
                            borderRadius: 4,
                          }} />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div style={{ color: '#475569', fontSize: 11, textAlign: 'center', padding: '8px 0' }}>
                      Données non disponibles
                    </div>
                  )}

                  {/* Risk badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: riskColor }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: riskColor }}>
                      Risque: {Math.min(99, risk)}% — {risk >= 70 ? 'Critique' : risk >= 50 ? 'Élevé' : risk >= 35 ? 'Moyen' : 'Faible'}
                    </span>
                  </div>
                </div>
              </LeafletTooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-[1000] rounded-xl px-3 py-2"
        style={{ background: 'rgba(9,14,28,0.9)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)' }}>
        <div className="text-[9px] font-bold tracking-widest uppercase text-slate-500 mb-2">Niveau de risque</div>
        {[['#10b981','Faible'],['#eab308','Moyen'],['#f97316','Élevé'],['#ef4444','Critique']].map(([c,l]) => (
          <div key={l} className="flex items-center gap-1.5 mb-1">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c }} />
            <span className="text-[10px] text-slate-400">{l}</span>
          </div>
        ))}
      </div>

      {/* Selected badge */}
      {selectedBureau !== 'ALL' && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-3 right-3 z-[1000] px-3 py-1.5 rounded-full text-xs font-bold"
          style={{ background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)', color: '#60a5fa', backdropFilter: 'blur(12px)' }}
        >
          📍 {OFFICES.find(o => o.id === selectedBureau)?.name} · Filtre actif
          <button
            onClick={() => onSelect?.('ALL')}
            className="ml-2 text-slate-400 hover:text-white"
          >✕</button>
        </motion.div>
      )}
    </motion.div>
  );
}
