import React, { useState } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, Cell, Legend,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { useApi } from '../hooks/useApi';
import { api, fmtM, fmt } from '../services/api';
import { KPICard, SectionTitle, Loading, ErrorBox, FadeIn, StaggerGrid, AnimatedNumber } from '../components/UI';
import { PageHeader } from '../App';
import { useFilters } from '../context/FilterContext';
import CameroonMap from '../components/CameroonMap';

const CHART_STYLE = {
  tooltip: {
    contentStyle: { background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: '#f1f5f9' },
    labelStyle: { color: '#94a3b8' },
  },
};

type Office = {
  office_id: string; name: string; total_sgds: number; total_revenue: number;
  avg_clearance_hours: number; fraud_cases: number; fraud_rate: number;
  efficiency_score: number; pct_of_total: number;
};

const COLORS = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ef4444','#06b6d4'];

export default function Offices() {
  const { data, loading, error, reload } = useApi(api.offices);
  const { filters, setFilter } = useFilters();
  const [selected, setSelected] = useState<string | null>(null);

  if (loading) return <><PageHeader /><Loading /></>;
  if (error)   return <><PageHeader /><ErrorBox message={error} onRetry={reload} /></>;
  if (!data)   return null;

  const offices: Office[] = filters.bureau === 'ALL'
    ? data
    : data.filter((o: Office) => o.office_id === filters.bureau);

  const sorted = [...offices].sort((a: Office, b: Office) => b.efficiency_score - a.efficiency_score);
  const best = sorted[0];

  // Stats for map
  const officeStats = Object.fromEntries(data.map((o: Office) => [o.office_id, {
    total_sgds: o.total_sgds, fraud_cases: o.fraud_cases,
    efficiency_score: o.efficiency_score, total_revenue: o.total_revenue,
  }]));

  // Radar data for selected office
  const radarOffice = selected ? offices.find((o: Office) => o.office_id === selected) ?? best : best;
  const radarData = radarOffice ? [
    { subject: 'Efficacité',  value: radarOffice.efficiency_score },
    { subject: 'Débit SGDs', value: Math.min(100, radarOffice.pct_of_total * 1.5) },
    { subject: 'Recettes',   value: Math.min(100, (radarOffice.total_revenue / 15e9) * 100) },
    { subject: 'Sécurité',   value: Math.max(0, 100 - radarOffice.fraud_rate * 500) },
    { subject: 'Rapidité',   value: Math.max(0, 100 - (radarOffice.avg_clearance_hours / 72) * 100) },
    { subject: 'Volume',     value: Math.min(100, (radarOffice.total_sgds / 400) * 100) },
  ] : [];

  // Pareto chart: offices by revenue + cumulative fraud
  const paretoData = [...data]
    .sort((a: Office, b: Office) => b.total_revenue - a.total_revenue)
    .map((o: Office) => ({
      name: o.name.split(' ').slice(0,2).join(' '),
      revenue: Math.round(o.total_revenue / 1e9 * 10) / 10,
      fraud: o.fraud_cases,
      efficiency: o.efficiency_score,
    }));

  // Scatter: efficiency vs clearance time
  const scatterData = data.map((o: Office) => ({
    x: o.avg_clearance_hours,
    y: o.efficiency_score,
    z: o.total_sgds,
    name: o.name.split(' ').slice(0,2).join(' '),
    id: o.office_id,
  }));

  return (
    <div className="space-y-5">
      <PageHeader />

      <StaggerGrid className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard label="Bureaux actifs" value={data.length} icon="🏛️" color="accent" />
        <KPICard label="Total recettes" value={Math.round(data.reduce((s: number, o: Office) => s + o.total_revenue, 0) / 1e9 * 10) / 10} suffix=" Mrd" icon="💰" color="success" />
        <KPICard label="Meilleure efficacité" value={best?.efficiency_score ?? 0} suffix="%" icon="🏆" color="teal" />
        <KPICard label="Total fraudes" value={data.reduce((s: number, o: Office) => s + o.fraud_cases, 0)} icon="🚨" color="danger" />
      </StaggerGrid>

      {/* Leaflet Map */}
      <FadeIn delay={0.1}>
        <div className="card">
          <SectionTitle icon="🗺️">Carte des Bureaux Douaniers — Cameroun</SectionTitle>
          <CameroonMap
            selectedBureau={filters.bureau}
            officeStats={officeStats}
            onSelect={(id) => setFilter('bureau', id === 'ALL' ? 'ALL' : id as 'DLA001' | 'KBI001' | 'DLA002' | 'YDE001' | 'YDE002')}
          />
        </div>
      </FadeIn>

      {/* Office cards */}
      <StaggerGrid className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sorted.map((o: Office, i: number) => (
          <motion.div key={o.office_id}
            onClick={() => setSelected(o.office_id === selected ? null : o.office_id)}
            className="card cursor-pointer transition-all duration-200"
            whileHover={{ scale: 1.02, boxShadow: '0 8px 32px rgba(59,130,246,0.2)' }}
            style={{ borderColor: selected === o.office_id ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.07)' }}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-lg font-bold" style={{ color: i === 0 ? '#fcd116' : COLORS[i] }}>#{i+1}</span>
                  <span className="text-sm font-bold text-white">{o.name}</span>
                </div>
                <div className="text-xs text-muted">{o.office_id} · {o.pct_of_total}% du trafic</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black" style={{ color: o.efficiency_score >= 90 ? '#10b981' : o.efficiency_score >= 75 ? '#3b82f6' : '#f59e0b' }}>
                  {o.efficiency_score}%
                </div>
                <div className="text-[9px] text-muted">Efficacité</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { l: 'SGDs', v: fmt(o.total_sgds), c: '#3b82f6' },
                { l: 'Fraudes', v: o.fraud_cases.toString(), c: '#ef4444' },
                { l: 'Délai', v: o.avg_clearance_hours + 'h', c: '#f59e0b' },
              ].map(k => (
                <div key={k.l} className="rounded-lg py-1.5 text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="text-sm font-bold" style={{ color: k.c }}>{k.v}</div>
                  <div className="text-[9px] text-muted">{k.l}</div>
                </div>
              ))}
            </div>

            {/* Efficiency bar */}
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <motion.div className="h-full rounded-full"
                initial={{ width: 0 }} animate={{ width: `${o.efficiency_score}%` }}
                transition={{ duration: 0.8, delay: i * 0.1 }}
                style={{ background: o.efficiency_score >= 90 ? '#10b981' : o.efficiency_score >= 75 ? '#3b82f6' : '#f59e0b' }} />
            </div>

            <div className="text-xs mt-2" style={{ color: '#3b82f6' }}>
              {fmtM(o.total_revenue)} FCFA recettes
            </div>
          </motion.div>
        ))}
      </StaggerGrid>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* Radar 360° for selected office */}
        <FadeIn delay={0.1}>
          <div className="card">
            <SectionTitle icon="🎯">
              Profil 360° — {radarOffice?.name?.split(' ').slice(0,2).join(' ')}
            </SectionTitle>
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(255,255,255,0.06)" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#475569', fontSize: 9 }} />
                <Radar name="Score" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} />
              </RadarChart>
            </ResponsiveContainer>
            <div className="text-center text-xs text-muted mt-1">Cliquez sur un bureau pour voir son profil</div>
          </div>
        </FadeIn>

        {/* Pareto: revenue + fraud */}
        <FadeIn delay={0.15} className="xl:col-span-2">
          <div className="card">
            <SectionTitle icon="📊">Recettes & Fraudes par Bureau</SectionTitle>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={paretoData} margin={{ left: -10, right: 10, bottom: 20, top: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} angle={-20} textAnchor="end" />
                <YAxis yAxisId="left" tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748b', fontSize: 10 }} />
                <Tooltip {...CHART_STYLE.tooltip} />
                <Legend wrapperStyle={{ color: '#64748b', fontSize: 11 }} />
                <Bar yAxisId="left" dataKey="revenue" name="Recettes (Mrd)" fill="#3b82f6" fillOpacity={0.7} radius={[4,4,0,0]}>
                  {paretoData.map((_: unknown, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.7} />)}
                </Bar>
                <Bar yAxisId="right" dataKey="fraud" name="Fraudes" fill="#ef4444" fillOpacity={0.6} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </FadeIn>
      </div>

      {/* Scatter: efficiency vs clearance */}
      <FadeIn delay={0.2}>
        <div className="card">
          <SectionTitle icon="📐">Efficacité vs Délai de Dédouanement — Analyse Comparative</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart margin={{ left: 10, right: 30, bottom: 10, top: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis type="number" dataKey="x" name="Délai (h)" tick={{ fill: '#64748b', fontSize: 10 }} label={{ value: 'Délai moyen (h)', position: 'insideBottom', offset: -5, fill: '#475569', fontSize: 10 }} />
              <YAxis type="number" dataKey="y" name="Efficacité" domain={[50, 100]} tick={{ fill: '#64748b', fontSize: 10 }} label={{ value: 'Efficacité %', angle: -90, position: 'insideLeft', fill: '#475569', fontSize: 10 }} />
              <ZAxis type="number" dataKey="z" range={[80, 400]} />
              <Tooltip {...CHART_STYLE.tooltip} cursor={{ strokeDasharray: '3 3' }}
                content={({ payload }) => {
                  if (!payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, padding: '10px 14px', color: '#f1f5f9', fontSize: 12 }}>
                      <div className="font-bold mb-1">{d.name}</div>
                      <div>Délai: <b>{d.x}h</b></div>
                      <div>Efficacité: <b>{d.y}%</b></div>
                      <div>SGDs: <b>{d.z}</b></div>
                    </div>
                  );
                }}
              />
              <Scatter data={scatterData} name="Bureaux">
                {scatterData.map((entry: { id: string; efficiency: number }, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.8} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 justify-center mt-2">
            {scatterData.map((o: { id: string; name: string }, i: number) => (
              <span key={o.id} className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{o.name}
              </span>
            ))}
          </div>
        </div>
      </FadeIn>
    </div>
  );
}
