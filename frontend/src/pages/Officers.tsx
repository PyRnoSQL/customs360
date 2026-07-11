import React, { useState } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, BarChart, Bar, PieChart, Pie,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { useApi } from '../hooks/useApi';
import { PageHeader } from '../App';
import { KPICard, SectionTitle, Loading, ErrorBox, Gauge, FadeIn, StaggerGrid } from '../components/UI';
import { fmt, fmtM } from '../services/api';
import { useFilters, applyRiskFilter } from '../context/FilterContext';

type Officer = {
  officer_id: string; name: string; grade: string; bureau_ids: string[];
  total_declarations: number; fraud_detected: number; proactive_detections: number;
  fraud_detection_rate: number;
  avg_clearance_hours: number; bureau_baseline_hours: number; speed_score: number;
  revenue_recovered: number; revenue_recovery_rate: number;
  total_tax_gap_recovered: number; avg_risk_score: number;
  high_risk_tariff_count: number; seizures_made: number;
  performance_index: number;
  career_status: string; promotion_readiness: number; burnout_risk: string;
  monthly_trend: { month: string; pi: number; declarations: number; fraud: number }[];
  rank_in_bureau: number; total_in_bureau: number; revenue_vs_taxes_gap: number;
};

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  ELIGIBLE_PROMOTION: { label: 'Eligible Promotion', color: '#10b981', bg: 'rgba(16,185,129,0.1)', icon: '🏆' },
  ACTIF:              { label: 'Actif',               color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', icon: '✅' },
  REDEPLOYMENT_RISK:  { label: 'Risque Redéploiement',color: '#f97316', bg: 'rgba(249,115,22,0.1)', icon: '⚠️' },
  BURNOUT_ALERT:      { label: 'Alerte Surmenage',    color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: '🔴' },
};
const BURNOUT_COLOR: Record<string, string> = { LOW: '#10b981', MEDIUM: '#f59e0b', HIGH: '#ef4444' };
const CHART_STYLE = {
  tooltip: { contentStyle: { background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: '#f1f5f9' }, labelStyle: { color: '#94a3b8' } },
};

// Circular gauge SVG
function CircularGauge({ value, color, size = 64 }: { value: number; color: string; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
      <motion.circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeLinecap="round" strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: circ - dash }}
        transition={{ duration: 1.2, ease: 'easeOut' }} />
    </svg>
  );
}

function OfficerDetail({ o, onBack }: { o: Officer; onBack: () => void }) {
  const sm = STATUS_META[o.career_status] ?? STATUS_META.ACTIF;
  const piColor = o.performance_index >= 75 ? '#10b981' : o.performance_index >= 50 ? '#3b82f6' : '#ef4444';

  // Two-layer radar: Layer 1 = actual scores, Layer 2 = bureau benchmark (fixed 60%)
  const radarData = [
    {
      subject: 'Fraude',
      score:     Math.round(Math.min(100, o.fraud_detection_rate * 300)),
      benchmark: 60,
    },
    {
      subject: 'Proactivité',
      score:     Math.round(Math.min(100, (o.proactive_detections / Math.max(o.total_declarations, 1)) * 500)),
      benchmark: 40,
    },
    {
      subject: 'Vitesse',
      score:     o.speed_score,
      benchmark: 60,
    },
    {
      subject: 'Recettes',
      score:     Math.round(Math.min(100, o.revenue_recovery_rate * 100)),
      benchmark: 60,
    },
    {
      subject: 'Écart Fiscal',
      score:     Math.round(Math.min(100, (o.total_tax_gap_recovered / Math.max(o.revenue_recovered, 1)) * 200)),
      benchmark: 40,
    },
    {
      subject: 'Fiabilité',
      score:     o.burnout_risk === 'LOW' ? 90 : o.burnout_risk === 'MEDIUM' ? 55 : 20,
      benchmark: 60,
    },
  ];

  const trendData = o.monthly_trend.map(m => ({ month: m.month.slice(5), pi: m.pi, decls: m.declarations }));

  const fraudPct = o.total_declarations > 0
    ? Math.round((o.fraud_detected / o.total_declarations) * 100)
    : 0;
  const pieData = o.fraud_detected === 0 && o.total_declarations === 0 ? [] : [
    { name: `Fraudes (${fraudPct}%)`, value: Math.max(o.fraud_detected, 0), fill: '#ef4444' },
    { name: `Normal (${100 - fraudPct}%)`, value: Math.max(o.total_declarations - o.fraud_detected, 0), fill: 'rgba(59,130,246,0.4)' },
  ].filter(d => d.value > 0);

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="btn btn-ghost text-xs">← Retour</button>
        <span className="text-sm font-bold text-white">Fiche Agent — {o.name}</span>
        <span className="ml-auto text-xs px-2 py-1 rounded-full font-bold"
          style={{ background: sm.bg, color: sm.color, border: `1px solid ${sm.color}44` }}>
          {sm.icon} {sm.label}
        </span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Profile card */}
        <div className="card text-center">
          <div className="relative inline-flex items-center justify-center mb-3">
            <CircularGauge value={o.performance_index} color={piColor} size={80} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div>
                <div className="text-xl font-black" style={{ color: piColor }}>{o.performance_index}</div>
                <div className="text-[8px] text-muted">PI</div>
              </div>
            </div>
          </div>
          <div className="text-base font-black text-white mb-0.5">{o.name}</div>
          <div className="text-xs text-muted mb-3">{o.officer_id} · {o.bureau_ids.join(', ')}</div>
          <div className="space-y-1.5 text-left">
            {[
              ['Grade', o.grade],
              ['Déclarations traitées', fmt(o.total_declarations)],
              ['Fraudes détectées', o.fraud_detected.toString()],
              ['Détections proactives', o.proactive_detections.toString()],
              ['Taux détection', (o.fraud_detection_rate * 100).toFixed(1) + '%'],
              ['Saisies effectuées', o.seizures_made.toString()],
              ['Délai moyen', o.avg_clearance_hours + 'h (base ' + o.bureau_baseline_hours + 'h)'],
              ['Recettes recouvrées', fmtM(o.revenue_recovered) + ' FCFA'],
              ['Écart fiscal récupéré', fmtM(o.total_tax_gap_recovered) + ' FCFA'],
              ['Score risque moyen', o.avg_risk_score + '/100'],
              ['Rang bureau', `#${o.rank_in_bureau}/${o.total_in_bureau}`],
              ['Risque surmenage', o.burnout_risk],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span className="text-xs text-muted">{k}</span>
                <span className="text-xs font-semibold text-white">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Radar 360° — two-layer animated */}
        <div className="card">
          <SectionTitle icon="🎯">Profil 360° — 6 Dimensions</SectionTitle>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData} margin={{ top: 10, right: 28, left: 28, bottom: 10 }}>
              <PolarGrid stroke="#1e3a5f" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
              />
              <PolarRadiusAxis
                domain={[0, 100]}
                tick={{ fill: '#475569', fontSize: 8 }}
                tickCount={4}
              />
              {/* Layer 1 — bureau benchmark (grey reference) */}
              <Radar
                name="Benchmark Bureau"
                dataKey="benchmark"
                stroke="#334155"
                fill="#334155"
                fillOpacity={0.15}
                strokeWidth={1}
                strokeDasharray="4 2"
                isAnimationActive
                animationDuration={800}
                animationEasing="ease-out"
              />
              {/* Layer 2 — agent score (coloured, staggered by 300ms) */}
              <Radar
                name="Score Agent"
                dataKey="score"
                stroke={piColor}
                fill={piColor}
                fillOpacity={0.25}
                strokeWidth={2}
                dot={{ fill: piColor, r: 4, strokeWidth: 0 }}
                isAnimationActive
                animationBegin={300}
                animationDuration={1200}
                animationEasing="ease-out"
              />
              <Tooltip
                contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }}
                formatter={(value: number, name: string) => [`${value}%`, name]}
              />
            </RadarChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="flex justify-center gap-5 mt-1">
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="w-4 h-0.5 rounded" style={{ background: piColor }} />
              Score Agent
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="w-4 h-0.5 rounded border-t border-dashed" style={{ borderColor: '#334155' }} />
              Benchmark (60%)
            </span>
          </div>
        </div>

        {/* Fraud pie */}
        <div className="card">
          <SectionTitle icon="📊">Déclarations — Répartition</SectionTitle>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={pieData.length ? pieData : [{ name: 'Aucune donnée', value: 1, fill: 'rgba(59,130,246,0.15)' }]}
                cx="50%" cy="50%" innerRadius={45} outerRadius={65} dataKey="value" strokeWidth={2}
                stroke="rgba(15,23,42,0.8)">
                {(pieData.length ? pieData : [{ name: '', value: 1, fill: 'rgba(59,130,246,0.15)' }]).map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip {...CHART_STYLE.tooltip} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4">
            {pieData.map(d => (
              <span key={d.name} className="flex items-center gap-1.5 text-xs text-muted">
                <span className="w-2 h-2 rounded-full" style={{ background: d.fill }} />{d.name}
              </span>
            ))}
          </div>

          {/* Career events */}
          <div className="mt-4 space-y-2">
            {[
              { e: 'Promotion', s: o.career_status === 'ELIGIBLE_PROMOTION' ? 'ELIGIBLE' : 'EN ATTENTE', c: o.career_status === 'ELIGIBLE_PROMOTION' ? '#10b981' : '#64748b' },
              { e: 'Surmenage', s: o.burnout_risk, c: BURNOUT_COLOR[o.burnout_risk] },
              { e: 'Redéploiement', s: o.career_status === 'REDEPLOYMENT_RISK' ? 'ALERTE' : 'NON', c: o.career_status === 'REDEPLOYMENT_RISK' ? '#ef4444' : '#64748b' },
            ].map(r => (
              <div key={r.e} className="flex justify-between items-center">
                <span className="text-xs text-muted">{r.e}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: r.c + '18', color: r.c, border: `1px solid ${r.c}33` }}>{r.s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trend chart */}
      <div className="card">
        <SectionTitle icon="📈">Évolution mensuelle — PI Score & Volume</SectionTitle>
        {trendData.length === 0
          ? <div className="h-[200px] flex items-center justify-center text-muted text-sm">Aucune donnée mensuelle disponible</div>
          : <ResponsiveContainer width="100%" height={200}>
<BarChart data={trendData} margin={{ left: -10, right: 10, bottom: 5, top: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 10 }} />
            <YAxis yAxisId="left" domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748b', fontSize: 10 }} />
            <Tooltip {...CHART_STYLE.tooltip} />
            <Bar yAxisId="left" dataKey="pi" name="PI Score" fill={piColor} fillOpacity={0.7} radius={[4,4,0,0]}>
              {trendData.map((_: unknown, i: number) => <Cell key={i} fill={piColor} fillOpacity={0.5 + (i / trendData.length) * 0.5} />)}
            </Bar>
            <Bar yAxisId="right" dataKey="decls" name="Déclarations" fill="#8b5cf6" fillOpacity={0.4} radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>}

      </div>
    </motion.div>
  );
}

export default function OfficersPage() {
  const { data, loading, error, reload } = useApi(() => fetch('/api/officers').then(r => r.json()));
  const { filters } = useFilters();
  const [selected, setSelected] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  if (loading) return <><PageHeader /><Loading /></>;
  if (error)   return <><PageHeader /><ErrorBox message={error} onRetry={reload} /></>;
  if (!data)   return null;

  // Risk filter maps to performance_index: Critique=low PI, Faible=high PI
  const PI_RANGE: Record<string,[number,number]> = {
    ALL:[0,100], CRITIQUE:[0,34], ELEVE:[35,49], MOYEN:[50,74], FAIBLE:[75,100],
  };
  const [piLo, piHi] = PI_RANGE[filters.risk] ?? [0,100];
  const officers: Officer[] = data
    .filter((o: Officer) => filters.bureau === 'ALL' || o.bureau_ids.includes(filters.bureau))
    .filter((o: Officer) => filters.risk === 'ALL' || (o.performance_index >= piLo && o.performance_index <= piHi))
    .filter((o: Officer) =>
      search === '' || o.name.toLowerCase().includes(search.toLowerCase()) || o.officer_id.toLowerCase().includes(search.toLowerCase())
    );

  if (selected) {
    const o = officers.find((x: Officer) => x.officer_id === selected);
    if (o) return <OfficerDetail o={o} onBack={() => setSelected(null)} />;
  }

  const statusFilters = ['ALL', 'ELIGIBLE_PROMOTION', 'ACTIF', 'REDEPLOYMENT_RISK', 'BURNOUT_ALERT'];
  const filtered = statusFilter === 'ALL' ? officers : officers.filter((o: Officer) => o.career_status === statusFilter);
  const eligible = officers.filter((o: Officer) => o.career_status === 'ELIGIBLE_PROMOTION').length;
  const avgPI = Math.round(officers.reduce((s: number, o: Officer) => s + o.performance_index, 0) / Math.max(officers.length, 1));
  const burnoutHigh = officers.filter((o: Officer) => o.burnout_risk === 'HIGH').length;

  // Scatter: PI vs fraud detection rate
  const scatterData = officers.map((o: Officer) => ({
    x: Math.round(o.fraud_detection_rate * 100),
    y: o.performance_index,
    z: o.total_declarations,
    name: o.name,
    id: o.officer_id,
    status: o.career_status,
    grade: o.grade,
    proactive: o.proactive_detections,
    seizures: o.seizures_made,
    taxGap: fmtM(o.total_tax_gap_recovered),
  }));

  const STATUS_COLORS: Record<string,string> = {
    ELIGIBLE_PROMOTION: '#10b981', ACTIF: '#3b82f6',
    REDEPLOYMENT_RISK: '#f97316', BURNOUT_ALERT: '#ef4444',
  };

  return (
    <div className="space-y-5">
      <PageHeader />
      <StaggerGrid className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard label="Total Agents" value={officers.length} icon="👤" color="accent" />
        <KPICard label="PI Moyen" value={avgPI} suffix="/100" icon="📊" color="teal" />
        <KPICard label="Fraudes Détectées" value={officers.reduce((s: number, o: Officer) => s + o.fraud_detected, 0)} icon="🎯" color="danger" />
        <KPICard label="Détections Proactives" value={officers.reduce((s: number, o: Officer) => s + o.proactive_detections, 0)} icon="⚡" color="success" />
      </StaggerGrid>
      <StaggerGrid className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard label="Eligible Promotion" value={eligible} icon="🏆" color="success" />
        <KPICard label="Alerte Surmenage" value={burnoutHigh} icon="🔴" color="danger" />
        <KPICard label="Saisies Totales" value={officers.reduce((s: number, o: Officer) => s + o.seizures_made, 0)} icon="🔒" color="accent" />
        <KPICard label="Écart Fiscal Récupéré" value={fmtM(officers.reduce((s: number, o: Officer) => s + o.total_tax_gap_recovered, 0))} suffix=" MFCFA" icon="💰" color="teal" />
      </StaggerGrid>

      {/* Scatter: PI vs fraud rate */}
      <FadeIn delay={0.1}>
        <div className="card">
          <SectionTitle icon="📐">Performance Index vs Taux Détection Fraude — Attrition Map</SectionTitle>
          {scatterData.length === 0
          ? <div className="h-[280px] flex items-center justify-center text-muted text-sm">Aucune donnée disponible</div>
          : <ResponsiveContainer width="100%" height={380}>
            <ScatterChart margin={{ left: 10, right: 30, bottom: 10, top: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis type="number" dataKey="x" name="Taux fraude %" tick={{ fill: '#64748b', fontSize: 10 }}
                label={{ value: 'Taux détection fraude (%)', position: 'insideBottom', offset: -5, fill: '#475569', fontSize: 10 }} />
              <YAxis type="number" dataKey="y" name="PI Score" domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }}
                label={{ value: 'PI Score', angle: -90, position: 'insideLeft', fill: '#475569', fontSize: 10 }} />
              <ZAxis type="number" dataKey="z" range={[60, 300]} />
              <Tooltip {...CHART_STYLE.tooltip}
                content={({ payload }) => {
                  if (!payload?.length) return null;
                  const d = payload[0]?.payload;
                  const sm = STATUS_META[d.status] ?? STATUS_META.ACTIF;
                  return (
                    <div style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, padding: '10px 14px', color: '#f1f5f9', fontSize: 12 }}>
                      <div className="font-bold mb-1">{d.name}</div>
                      <div className="text-[10px] text-slate-400 mb-1">{d.grade}</div>
                      <div>PI Score: <b style={{ color: '#60a5fa' }}>{d.y}</b></div>
                      <div>Taux détection: <b style={{ color: '#f87171' }}>{d.x}%</b></div>
                      <div>Détections proactives: <b style={{ color: '#10b981' }}>{d.proactive}</b></div>
                      <div>Saisies: <b>{d.seizures}</b></div>
                      <div>Écart fiscal récupéré: <b style={{ color: '#f59e0b' }}>{d.taxGap} MFCFA</b></div>
                      <div>Déclarations: <b>{d.z}</b></div>
                      <div style={{ color: sm.color, marginTop: 4 }}>{sm.icon} {sm.label}</div>
                    </div>
                  );
                }}
              />
              <Scatter data={scatterData} name="Agents">
                {scatterData.map((entry: { status: string; id: string }, i: number) => (
                  <Cell key={i} fill={STATUS_COLORS[entry.status] ?? '#64748b'} fillOpacity={0.8} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>}
          <div className="flex flex-wrap gap-4 justify-center mt-2">
            {Object.entries(STATUS_META).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="w-2 h-2 rounded-full" style={{ background: v.color }} />{v.label}
              </span>
            ))}
          </div>
        </div>
      </FadeIn>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input className="input w-48 text-sm" placeholder="🔍 Rechercher agent…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <div className="flex gap-2 flex-wrap">
          {statusFilters.map(f => {
            const sm = f === 'ALL' ? { color: '#3b82f6', label: 'Tous' } : (STATUS_META[f] ?? { color: '#64748b', label: f });
            return (
              <motion.button key={f} onClick={() => setStatusFilter(f)}
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                className="text-xs px-3 py-1.5 rounded-full font-semibold transition-all"
                style={{
                  background: statusFilter === f ? sm.color + '22' : 'transparent',
                  border: `1px solid ${statusFilter === f ? sm.color : '#1e3a5f'}`,
                  color: statusFilter === f ? sm.color : '#64748b',
                }}>
                {f === 'ALL' ? 'Tous les agents' : sm.label}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Agent cards with circular gauges */}
      <StaggerGrid className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((o: Officer) => {
          const sm = STATUS_META[o.career_status] ?? STATUS_META.ACTIF;
          const piColor = o.performance_index >= 75 ? '#10b981' : o.performance_index >= 50 ? '#3b82f6' : '#ef4444';
          return (
            <motion.div key={o.officer_id}
              onClick={() => setSelected(o.officer_id)}
              className="card cursor-pointer"
              whileHover={{ scale: 1.02, boxShadow: `0 8px 32px ${sm.color}22` }}
              style={{ borderColor: sm.color + '33' }}>
              <div className="flex items-start gap-3 mb-3">
                {/* Circular gauge */}
                <div className="relative flex-shrink-0" style={{ width: 52, height: 52 }}>
                  <CircularGauge value={o.performance_index} color={piColor} size={52} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-black" style={{ color: piColor }}>{o.performance_index}</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white truncate">{o.name}</div>
                  <div className="text-[10px] text-muted">{o.officer_id} · {o.bureau_ids[0]}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: sm.color }}>{sm.icon} {sm.label}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs font-bold" style={{ color: BURNOUT_COLOR[o.burnout_risk] }}>
                    {o.burnout_risk === 'HIGH' ? '🔴' : o.burnout_risk === 'MEDIUM' ? '🟡' : '🟢'}
                  </div>
                  <div className="text-[9px] text-muted">Surmenage</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-2">
                {[
                  { l: 'Déclarations', v: o.total_declarations, c: '#3b82f6' },
                  { l: 'Fraudes', v: o.fraud_detected, c: '#ef4444' },
                  { l: 'Rang', v: `#${o.rank_in_bureau}`, c: '#f59e0b' },
                ].map(k => (
                  <div key={k.l} className="rounded-lg py-1 text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <div className="text-xs font-bold" style={{ color: k.c }}>{k.v}</div>
                    <div className="text-[9px] text-muted">{k.l}</div>
                  </div>
                ))}
              </div>
              <Gauge value={o.performance_index} color={piColor} />
            </motion.div>
          );
        })}
      </StaggerGrid>

      {/* Collusion Exposure — moved from Prédictions IA */}
      <OfficerCollusionExposure />
    </div>
  );
}

// Sub-component: collusion exposure per inspector
function OfficerCollusionExposure() {
  const { filters } = useFilters();
  const advQs = [filters.bureau !== 'ALL' && `bureau=${filters.bureau}`, filters.period !== 'ALL' && `period=${filters.period}`].filter(Boolean).join('&');
  const { data } = useApi(() =>
    Promise.race([
      fetch(`/api/predictions/advanced${advQs ? '?' + advQs : ''}`).then(r => r.json()),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 8000)),
    ])
  , [advQs]);
  if (!data) return null;

  type CollusionExp = { officer_id: string; name: string; bureau_id: string; high_risk_count: number; total_declarations: number; exposure_rate: number; exposure_score: number; integrity_flag: string; alert: string | null };
  const { collusion_exposure = [] } = data as { collusion_exposure?: CollusionExp[] };
  if (!(collusion_exposure as CollusionExp[]).length) return null;

  const INTEGRITY_COLOR: Record<string,string> = { CLEAN:'#10b981', MONITORED:'#f59e0b', AT_RISK:'#ef4444' };

  return (
    <div className="card">
      <SectionTitle icon="🕵️">Score d'Exposition à la Collusion — Agents Douaniers</SectionTitle>
      <p className="text-xs text-muted mb-4">Mesure le % de déclarations traitées pour des importateurs frauduleux confirmés</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {(collusion_exposure as CollusionExp[]).slice(0, 9).map((e: CollusionExp, i: number) => {
          const ic = INTEGRITY_COLOR[e.integrity_flag] ?? '#64748b';
          return (
            <motion.div key={e.officer_id} initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay: i*0.06 }}
              className="rounded-xl p-4" style={{ background:`${ic}0a`, border:`1px solid ${ic}25` }}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-sm font-bold text-white">{e.name}</div>
                  <div className="text-[10px] text-muted">{e.officer_id} · {e.bureau_id}</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-black" style={{ color:ic }}>{e.exposure_score}</div>
                  <div className="text-[9px]" style={{ color:ic }}>{e.integrity_flag}</div>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background:'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full" style={{ width:`${e.exposure_score}%`, background:ic }} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center rounded-lg py-1" style={{ background:'rgba(255,255,255,0.04)' }}>
                  <div className="text-xs font-bold" style={{ color:ic }}>{e.high_risk_count}</div>
                  <div className="text-[9px] text-muted">Décl. risquées</div>
                </div>
                <div className="text-center rounded-lg py-1" style={{ background:'rgba(255,255,255,0.04)' }}>
                  <div className="text-xs font-bold text-white">{Math.round(e.exposure_rate*100)}%</div>
                  <div className="text-[9px] text-muted">Taux exposition</div>
                </div>
              </div>
              {e.alert && <div className="mt-2 text-[10px] p-1.5 rounded-lg" style={{ background:`${ic}15`, color:ic }}>⚠️ {e.alert.slice(0,60)}</div>}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
