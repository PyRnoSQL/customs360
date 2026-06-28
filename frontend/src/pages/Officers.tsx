import { useFilters, applyBureauFilter, applyRiskFilter } from '../context/FilterContext';
import React, { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api, fmt, fmtM, riskColor } from '../services/api';
import { PageHeader } from '../App';
import { KPICard, SectionTitle, Loading, ErrorBox, Gauge, StatusBadge } from '../components/UI';

type Officer = {
  officer_id: string; name: string; bureau_ids: string[];
  total_declarations: number; fraud_detected: number; fraud_detection_rate: number;
  avg_clearance_hours: number; bureau_baseline_hours: number; speed_score: number;
  revenue_recovered: number; revenue_recovery_rate: number; performance_index: number;
  career_status: string; promotion_readiness: number; burnout_risk: string;
  monthly_trend: { month: string; pi: number; declarations: number }[];
  rank_in_bureau: number; total_in_bureau: number; revenue_vs_taxes_gap: number;
};

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  ELIGIBLE_PROMOTION: { label: 'Eligible Promotion', color: '#10b981', bg: '#064e3b', icon: '🏆' },
  ACTIF:              { label: 'Actif',               color: '#3b82f6', bg: '#1e3a5f', icon: '✅' },
  REDEPLOYMENT_RISK:  { label: 'Risque Redéploiement',color: '#f97316', bg: '#431407', icon: '⚠️' },
  BURNOUT_ALERT:      { label: 'Alerte Surmenage',    color: '#ef4444', bg: '#450a0a', icon: '🔴' },
};
const BURNOUT_COLOR: Record<string, string> = { LOW: '#10b981', MEDIUM: '#f59e0b', HIGH: '#ef4444' };

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const w = 80; const h = 28;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(' ');
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(data.length - 1) / (data.length - 1) * w} cy={h - (data[data.length - 1] / max) * h} r="3" fill={color} />
    </svg>
  );
}

function OfficerCard({ o, onClick }: { o: Officer; onClick: () => void }) {
  const sm = STATUS_META[o.career_status] ?? STATUS_META.ACTIF;
  const piColor = o.performance_index >= 75 ? '#10b981' : o.performance_index >= 50 ? '#3b82f6' : o.performance_index >= 35 ? '#f59e0b' : '#ef4444';
  const trendData = o.monthly_trend.map(m => m.pi);
  return (
    <div onClick={onClick} className="card cursor-pointer hover:border-accent transition-all duration-150 hover:scale-[1.01]"
      style={{ borderColor: sm.color + '44' }}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span>{sm.icon}</span>
            <span className="text-sm font-black text-white">{o.name}</span>
          </div>
          <div className="text-xs text-muted">{o.officer_id} · {o.bureau_ids.join(', ')}</div>
          <div className="text-[10px] mt-1" style={{ color: sm.color }}>
            Rang #{o.rank_in_bureau}/{o.total_in_bureau} dans le bureau
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black" style={{ color: piColor }}>{o.performance_index}</div>
          <div className="text-[9px] text-muted">PI Score</div>
        </div>
      </div>
      <Gauge value={o.performance_index} color={piColor} height="h-1.5" />
      <div className="grid grid-cols-3 gap-2 mt-3 mb-3">
        {[
          { l: 'Déclarations', v: fmt(o.total_declarations) },
          { l: 'Fraudes', v: fmt(o.fraud_detected) },
          { l: 'Délai moy.', v: o.avg_clearance_hours + 'h' },
        ].map(k => (
          <div key={k.l} className="text-center rounded-lg py-1.5" style={{ background: '#0b1221' }}>
            <div className="text-xs font-bold text-white">{k.v}</div>
            <div className="text-[9px] text-muted">{k.l}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs px-2 py-0.5 rounded-full font-bold"
          style={{ background: sm.bg, color: sm.color, border: `1px solid ${sm.color}44` }}>
          {sm.label}
        </span>
        {trendData.length >= 2 && <MiniSparkline data={trendData} color={piColor} />}
        <span className="text-[10px] font-bold" style={{ color: BURNOUT_COLOR[o.burnout_risk] }}>
          Surmenage: {o.burnout_risk}
        </span>
      </div>
    </div>
  );
}

function OfficerDetail({ o, onBack }: { o: Officer; onBack: () => void }) {
  const sm = STATUS_META[o.career_status] ?? STATUS_META.ACTIF;
  const piColor = o.performance_index >= 75 ? '#10b981' : o.performance_index >= 50 ? '#3b82f6' : '#ef4444';
  const dimensions = [
    { label: 'Détection Fraude (30%)', value: Math.min(100, o.fraud_detection_rate * 300), color: '#ef4444' },
    { label: 'Vitesse Traitement (20%)', value: o.speed_score, color: '#3b82f6' },
    { label: 'Recouvrement Recettes (25%)', value: Math.min(100, o.revenue_recovery_rate * 100), color: '#10b981' },
    { label: 'Volume Traité (15%)', value: Math.min(100, (o.total_declarations / 80) * 100), color: '#f59e0b' },
    { label: 'Codes Tarif. Risqués (10%)', value: Math.min(100, (o.fraud_detected / Math.max(o.total_declarations, 1)) * 200), color: '#8b5cf6' },
  ];
  const CAREER_EVENTS = [
    { event: 'Évaluation annuelle', due: 'Déc 2026', status: o.performance_index >= 50 ? 'Prévu' : 'Prioritaire' },
    { event: 'Promotion', due: o.career_status === 'ELIGIBLE_PROMOTION' ? 'Eligible maintenant' : 'Non éligible', status: o.career_status === 'ELIGIBLE_PROMOTION' ? 'ELIGIBLE' : 'EN ATTENTE' },
    { event: 'Risque redéploiement', due: o.career_status === 'REDEPLOYMENT_RISK' ? 'Immédiat' : 'N/A', status: o.career_status === 'REDEPLOYMENT_RISK' ? 'ALERTE' : 'NON' },
    { event: 'Formation recommandée', due: o.performance_index < 60 ? 'Urgent' : 'Optionnel', status: o.performance_index < 60 ? 'RECOMMANDÉ' : 'OPTIONNEL' },
  ];
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="btn btn-ghost text-xs">← Retour</button>
        <span className="text-sm font-bold text-white">Fiche Agent — {o.name}</span>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="card xl:col-span-1">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black flex-shrink-0"
              style={{ background: sm.bg, border: `2px solid ${sm.color}` }}>
              {o.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
            </div>
            <div>
              <div className="text-base font-black text-white">{o.name}</div>
              <div className="text-xs text-muted">{o.officer_id}</div>
              <div className="text-xs mt-1" style={{ color: sm.color }}>{sm.icon} {sm.label}</div>
            </div>
          </div>
          <div className="text-center mb-4">
            <div className="text-5xl font-black mb-1" style={{ color: piColor }}>{o.performance_index}</div>
            <div className="text-xs text-muted">Performance Index</div>
            <Gauge value={o.performance_index} color={piColor} height="h-2" />
          </div>
          <div className="space-y-1.5 text-sm">
            {[
              ['Déclarations traitées', fmt(o.total_declarations)],
              ['Fraudes détectées', fmt(o.fraud_detected)],
              ['Taux détection', (o.fraud_detection_rate * 100).toFixed(1) + '%'],
              ['Délai moyen', o.avg_clearance_hours + 'h vs ' + o.bureau_baseline_hours + 'h base'],
              ['Recettes recouvrées', fmtM(o.revenue_recovered) + ' FCFA'],
              ['Rang bureau', `#${o.rank_in_bureau}/${o.total_in_bureau}`],
              ['Risque surmenage', o.burnout_risk],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-border pb-1.5">
                <span className="text-muted text-xs">{k}</span>
                <span className="font-semibold text-white text-xs">{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="xl:col-span-2 space-y-5">
          <div className="card">
            <SectionTitle icon="📊">Dimensions de Performance (5 facteurs)</SectionTitle>
            {dimensions.map(d => (
              <div key={d.label} className="mb-3">
                <div className="flex justify-between mb-1">
                  <span className="text-xs text-sub">{d.label}</span>
                  <span className="text-xs font-bold" style={{ color: d.color }}>{Math.round(d.value)}%</span>
                </div>
                <Gauge value={d.value} color={d.color} />
              </div>
            ))}
          </div>
          <div className="card">
            <SectionTitle icon="🎯">Événements de Carrière</SectionTitle>
            <table className="tbl">
              <thead><tr><th>Événement</th><th>Échéance</th><th>Statut</th></tr></thead>
              <tbody>
                {CAREER_EVENTS.map(e => (
                  <tr key={e.event}>
                    <td className="text-sm text-white">{e.event}</td>
                    <td className="text-xs text-muted">{e.due}</td>
                    <td>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: e.status === 'ELIGIBLE' ? '#064e3b' : e.status === 'ALERTE' ? '#450a0a' : '#1e3a5f', color: e.status === 'ELIGIBLE' ? '#10b981' : e.status === 'ALERTE' ? '#ef4444' : '#3b82f6' }}>
                        {e.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <SectionTitle icon="📈">Tendance Mensuelle PI Score</SectionTitle>
            <div className="flex items-end gap-1.5 h-24">
              {o.monthly_trend.map((m, i) => {
                const maxPI = Math.max(...o.monthly_trend.map(x => x.pi), 1);
                const h = Math.round((m.pi / maxPI) * 100);
                const c = m.pi >= 75 ? '#10b981' : m.pi >= 50 ? '#3b82f6' : '#ef4444';
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                    <div className="text-[8px] text-muted opacity-0 group-hover:opacity-100">{m.pi}</div>
                    <div className="w-full rounded-t-sm" style={{ height: `${h}%`, background: c, minHeight: 4 }} />
                    <div className="text-[8px] text-muted truncate w-full text-center">{m.month.slice(5)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OfficersPage() {
  const { data, loading, error, reload } = useApi(() => fetch('/api/officers').then(r => r.json()));
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('ALL');
  if (loading) return <><PageHeader /><Loading /></>;
  if (error) return <><PageHeader /><ErrorBox message={error} onRetry={reload} /></>;
  if (!data) return null;
  const { filters } = useFilters();
  const officers: Officer[] = applyRiskFilter(
    data.filter((o: Officer) => filters.bureau === 'ALL' || o.bureau_ids.includes(filters.bureau)),
    filters.risk
  );
  if (selected) {
    const o = officers.find((x: Officer) => x.officer_id === selected);
    if (o) return <OfficerDetail o={o} onBack={() => setSelected(null)} />;
  }
  const statusFilters = ['ALL', 'ELIGIBLE_PROMOTION', 'ACTIF', 'REDEPLOYMENT_RISK', 'BURNOUT_ALERT'];
  const filtered = filter === 'ALL' ? officers : officers.filter((o: Officer) => o.career_status === filter);
  const eligible = officers.filter((o: Officer) => o.career_status === 'ELIGIBLE_PROMOTION').length;
  const avgPI = Math.round(officers.reduce((s: number, o: Officer) => s + o.performance_index, 0) / Math.max(officers.length, 1));
  const burnoutHigh = officers.filter((o: Officer) => o.burnout_risk === 'HIGH').length;
  return (
    <div className="space-y-5">
      <PageHeader />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard label="Total Agents" value={fmt(officers.length)} color="accent" />
        <KPICard label="PI Moyen" value={avgPI + '/100'} sub="Performance Index" color="teal" />
        <KPICard label="Eligible Promotion" value={fmt(eligible)} color="success" />
        <KPICard label="Alerte Surmenage" value={fmt(burnoutHigh)} color="danger" />
      </div>
      <div className="flex gap-2 flex-wrap">
        {statusFilters.map(f => {
          const sm = f === 'ALL' ? { color: '#3b82f6', label: 'Tous' } : (STATUS_META[f] ?? { color: '#64748b', label: f });
          return (
            <button key={f} onClick={() => setFilter(f)}
              className="text-xs px-3 py-1.5 rounded-full font-semibold transition-all"
              style={{ background: filter === f ? sm.color + '22' : 'transparent', border: `1px solid ${filter === f ? sm.color : '#1e3a5f'}`, color: filter === f ? sm.color : '#64748b' }}>
              {f === 'ALL' ? 'Tous les agents' : (STATUS_META[f]?.label ?? f)}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((o: Officer) => <OfficerCard key={o.officer_id} o={o} onClick={() => setSelected(o.officer_id)} />)}
      </div>
    </div>
  );
}
