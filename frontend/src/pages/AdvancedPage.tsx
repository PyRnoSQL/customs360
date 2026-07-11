import React, { useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { motion } from 'framer-motion';
import { PageHeader } from '../App';
import { KPICard, SectionTitle, Loading, ErrorBox, FadeIn, StaggerGrid, PaginatedTable } from '../components/UI';
import { useApi } from '../hooks/useApi';
import { fmtM, fmt } from '../services/api';
import { useFilters } from '../context/FilterContext';

const riskColor = (s: number) => s >= 70 ? '#ef4444' : s >= 40 ? '#f59e0b' : '#10b981';
const riskLabel = (s: number) => s >= 70 ? 'CRITIQUE' : s >= 40 ? 'MODÉRÉ' : 'FAIBLE';

// ── Tab types ─────────────────────────────────────────────────────────────────
type Tab = 'fraud' | 'revenue' | 'network' | 'recommend' | 'inspectors' | 'offices' | 'importers';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'fraud',       icon: '🎯', label: 'Détection Fraude'     },
  { id: 'revenue',     icon: '📈', label: 'Prévision Recettes'   },
  { id: 'network',     icon: '🕸️', label: 'Réseau Relations'     },
  { id: 'recommend',   icon: '💡', label: 'Recommandations'      },
  { id: 'inspectors',  icon: '👮', label: 'Agents Douaniers'     },
  { id: 'offices',     icon: '🏛️', label: 'Bureaux'              },
  { id: 'importers',   icon: '🏢', label: 'Importateurs'         },
];

// ═══════════════════════════════════════════════════════════════════
// TAB 1 — FRAUD DETECTION
// ═══════════════════════════════════════════════════════════════════
function FraudDetectionTab() {
  const { filters } = useFilters();
  const qs = [filters.bureau !== 'ALL' && `bureau=${filters.bureau}`, filters.period !== 'ALL' && `period=${filters.period}`].filter(Boolean).join('&');
  const { data, loading, error } = useApi(() => fetch(`/api/advanced/fraud-score${qs ? '?' + qs : ''}`).then(r => r.json()), [qs]);
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);
  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorBox message={error} />;
  const { top_anomalies = [], high_risk = 0, medium_risk = 0, low_risk = 0, total = 0 } = data ?? {};
  const distribOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(59,130,246,0.3)', textStyle: { color: '#f1f5f9' } },
    series: [{ type: 'pie', radius: ['42%', '65%'], center: ['50%', '45%'],
      label: { show: true, formatter: (p: { name: string; value: number; percent: string }) => `${p.name}\n${p.value} (${p.percent}%)`, color: '#94a3b8', fontSize: 11 },
      labelLine: { show: true },
      data: [
        { name: 'Critique ≥70', value: high_risk,   itemStyle: { color: '#ef4444' } },
        { name: 'Modéré 40-70', value: medium_risk, itemStyle: { color: '#f59e0b' } },
        { name: 'Faible <40',   value: total - high_risk - medium_risk, itemStyle: { color: '#10b981' } },
      ],
      legend: { bottom: 0, left: 'center', orient: 'horizontal', textStyle: { color: '#94a3b8', fontSize: 10 } },
    }],
  };
  return (
    <div className="space-y-5">
      <StaggerGrid className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard label="Déclarations analysées" value={fmt(total)} icon="📋" color="accent" />
        <KPICard label="Score Critique ≥70" value={high_risk} icon="🔴" color="danger" />
        <KPICard label="Score Modéré 40-70" value={medium_risk} icon="🟡" color="gold" />
        <KPICard label="Précision algorithme" value="92%" icon="✅" color="success" />
      </StaggerGrid>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="card">
          <SectionTitle icon="🍩">Distribution des scores</SectionTitle>
          <ReactECharts option={distribOption} style={{ height: 240 }} />
        </div>
        <div className="xl:col-span-2 card">
          <SectionTitle icon="🎯">Déclarations Prioritaires — Score Anomalie</SectionTitle>
          <PaginatedTable pageSize={10} headers={
            <tr><th>SGD</th><th>Importateur</th><th>Tarif</th><th>Score</th><th>Prob. Fraude</th><th>Revenu à risque</th><th>Signaux</th></tr>
          } rows={top_anomalies.map((a: Record<string, unknown>) => (
            <tr key={a.sgd_id as string} className="cursor-pointer hover:bg-white/5 transition-colors" onClick={() => setSelectedRow(a)}>
              <td><code style={{ color: '#22d3ee', fontSize: 11 }}>{a.sgd_id as string}</code></td>
              <td><div className="text-xs font-semibold text-white">{a.importer_name as string}</div><div className="text-[10px] text-muted">{a.importer_id as string}</div></td>
              <td><div className="text-xs text-sub">{a.tariff_code as string}</div><div className="text-[10px] text-muted">{String(a.tariff_description ?? '').slice(0,20)}</div></td>
              <td>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-14 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full" style={{ width: `${a.anomaly_score as number}%`, background: riskColor(a.anomaly_score as number) }} />
                  </div>
                  <span className="text-xs font-bold" style={{ color: riskColor(a.anomaly_score as number) }}>{a.anomaly_score as number}</span>
                </div>
              </td>
              <td><span className="text-xs font-bold" style={{ color: (a.predicted_fraud_prob as number) >= 0.7 ? '#f87171' : '#fbbf24' }}>{Math.round((a.predicted_fraud_prob as number) * 100)}%</span></td>
              <td><span className="text-xs font-bold text-red-400">{fmtM(a.revenue_at_risk as number)} FCFA</span></td>
              <td><span className="text-[10px] text-muted">{(a.factors as string[]).slice(0,1).join(', ')}{(a.factors as string[]).length > 1 ? ` +${(a.factors as string[]).length - 1}` : ''}</span></td>
            </tr>
          ))} />
        </div>
      </div>
      {/* Detail panel */}
      {selectedRow && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ borderColor: riskColor(selectedRow.anomaly_score as number) + '44' }}>
          <div className="flex items-center justify-between mb-3">
            <SectionTitle icon="🔬">Analyse détaillée — {selectedRow.sgd_id as string}</SectionTitle>
            <button onClick={() => setSelectedRow(null)} className="text-xs text-muted hover:text-white">✕ Fermer</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {[['Score anomalie', `${selectedRow.anomaly_score}/100`], ['Probabilité fraude', `${Math.round((selectedRow.predicted_fraud_prob as number)*100)}%`], ['Revenu à risque', `${fmtM(selectedRow.revenue_at_risk as number)} FCFA`], ['Canal système', selectedRow.channel as string]].map(([k,v]) => (
              <div key={k} className="card-sm text-center">
                <div className="text-xs text-muted mb-1">{k}</div>
                <div className="text-lg font-bold" style={{ color: riskColor(selectedRow.anomaly_score as number) }}>{v}</div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <div className="text-xs font-bold text-white mb-2">Signaux de risque détectés ({(selectedRow.factors as string[]).length})</div>
            {(selectedRow.factors as string[]).map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: '#ef444422', color: '#ef4444' }}>{i+1}</span>
                <span className="text-slate-300">{f}</span>
              </div>
            ))}
            {(selectedRow.factors as string[]).length === 0 && <div className="text-xs text-muted">Aucun signal critique détecté</div>}
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB 2 — REVENUE FORECAST
// ═══════════════════════════════════════════════════════════════════
function RevenueForecastTab() {
  const { data, loading, error } = useApi(() => fetch('/api/advanced/revenue-forecast').then(r => r.json()));
  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorBox message={error} />;
  const { historical = [], forecast = [], stats = {} } = data ?? {};
  const allMonths = [...historical, ...forecast];
  const chartOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(59,130,246,0.3)', textStyle: { color: '#f1f5f9', fontSize: 12 }, axisPointer: { type: 'cross' },
      formatter: (params: { seriesName: string; value: number; marker: string }[]) => {
        return `<span style="color:#f1f5f9">${params.map(p => `${p.marker} ${p.seriesName}: <b>${fmtM(p.value)} FCFA</b>`).join('<br/>')}</span>`;
      }
    },
    legend: { bottom: 0, left: 'center', textStyle: { color: '#64748b', fontSize: 10 }, itemWidth: 10, itemHeight: 10 },
    grid: { left: 8, right: 8, top: 10, bottom: 40, containLabel: true },
    xAxis: { type: 'category', data: allMonths.map((m: Record<string, unknown>) => m.label as string), axisLabel: { color: '#475569', fontSize: 9, rotate: 45 }, axisLine: { show: false }, axisTick: { show: false } },
    yAxis: { type: 'value', axisLabel: { color: '#475569', fontSize: 9, formatter: (v: number) => `${fmtM(v)}M` }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } }, axisLine: { show: false } },
    series: [
      { name: 'Recettes collectées', type: 'bar', data: historical.map((m: Record<string, unknown>) => m.value), itemStyle: { color: 'rgba(59,130,246,0.6)', borderRadius: [3,3,0,0] }, barMaxWidth: 18 },
      { name: 'Évasion détectée', type: 'bar', data: historical.map((m: Record<string, unknown>) => m.evasion), itemStyle: { color: 'rgba(239,68,68,0.7)', borderRadius: [3,3,0,0] }, barMaxWidth: 12 },
      { name: 'Tendance', type: 'line', data: historical.map((m: Record<string, unknown>) => m.trend), smooth: true, lineStyle: { color: '#10b981', width: 2, type: 'dashed' }, itemStyle: { color: '#10b981' }, symbol: 'none' },
      { name: 'Prévision (J+1-3)', type: 'bar', data: [...Array(historical.length).fill(null), ...forecast.map((m: Record<string, unknown>) => m.value)], itemStyle: { color: 'rgba(168,85,247,0.6)', borderRadius: [3,3,0,0] }, barMaxWidth: 18 },
    ],
  };
  const evasionOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(59,130,246,0.3)', textStyle: { color: '#f1f5f9', fontSize: 11 } },
    grid: { left: 8, right: 8, top: 8, bottom: 30, containLabel: true },
    xAxis: { type: 'category', data: historical.map((m: Record<string, unknown>) => m.label as string), axisLabel: { color: '#475569', fontSize: 8, rotate: 45 }, axisLine: { show: false }, axisTick: { show: false } },
    yAxis: { type: 'value', axisLabel: { color: '#475569', fontSize: 9, formatter: (v: number) => `${fmtM(v)}M` }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } }, axisLine: { show: false } },
    series: [{ type: 'line', data: historical.map((m: Record<string, unknown>) => m.evasion), smooth: true, areaStyle: { color: 'rgba(239,68,68,0.15)' }, lineStyle: { color: '#ef4444', width: 2 }, itemStyle: { color: '#ef4444' }, symbol: 'circle', symbolSize: 4 }],
  };
  return (
    <div className="space-y-5">
      <StaggerGrid className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard label="Recettes totales (24 mois)" value={fmtM(stats.total_revenue ?? 0)} suffix=" MFCFA" icon="💰" color="success" />
        <KPICard label="Évasion détectée" value={fmtM(stats.total_evasion ?? 0)} suffix=" MFCFA" icon="🚨" color="danger" />
        <KPICard label="Moyenne mensuelle" value={fmtM(stats.avg_monthly ?? 0)} suffix=" MFCFA" icon="📊" color="teal" />
        <KPICard label="Prévision 3 mois" value={fmtM(stats.forecast_3m ?? 0)} suffix=" MFCFA" icon="🔮" color="accent" />
      </StaggerGrid>
      <div className="card">
        <SectionTitle icon="📈">Recettes collectées vs Évasion fiscale — Tendance 24 mois + Prévision</SectionTitle>
        <ReactECharts option={chartOption} style={{ height: 320 }} />
        <div className="mt-3 p-3 rounded-xl text-xs text-muted" style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)' }}>
          🔮 <b style={{ color: '#a78bfa' }}>Prévision J+1-3:</b> {forecast.map((f: Record<string, unknown>) => `${f.label as string}: ${fmtM(f.value as number)}M FCFA`).join(' · ')} &nbsp;|&nbsp; Méthode: régression linéaire sur 24 mois &nbsp;|&nbsp; Précision estimée: ±15%
        </div>
      </div>
      <div className="card">
        <SectionTitle icon="⚠️">Évolution mensuelle de l'évasion fiscale détectée</SectionTitle>
        <ReactECharts option={evasionOption} style={{ height: 200 }} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB 3 — NETWORK (enhanced graph)
// ═══════════════════════════════════════════════════════════════════
function NetworkTab() {
  const { data, loading, error } = useApi(() => fetch('/api/advanced/network').then(r => r.json()));
  const [filter, setFilter] = useState<'ALL'|'COLLUSION'|'HIGH_RISK'>('ALL');
  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorBox message={error} />;
  const { nodes = [], edges = [], stats = {} } = data ?? {};
  type Node = { id: string; label: string; type: string; risk: number; fraud_count: number; total: number; collusion: boolean };
  type Edge = { source: string; target: string; type: string; weight: number; fraud_count: number; collusion: boolean };
  const NODE_COLORS: Record<string, string> = { importer: '#3b82f6', declarant: '#10b981', inspector: '#a78bfa', office: '#f59e0b' };
  const visNodes = (nodes as Node[]).filter(n => filter === 'ALL' ? true : filter === 'COLLUSION' ? n.collusion : n.risk >= 50);
  const visIds = new Set(visNodes.map(n => n.id));
  const visEdges = (edges as Edge[]).filter(e => visIds.has(e.source) && visIds.has(e.target));
  // Build a chord/sankey-style edge summary
  const edgesByType: Record<string, { count: number; fraud: number; collusion: number }> = {};
  (edges as Edge[]).forEach(e => { if (!edgesByType[e.type]) edgesByType[e.type] = { count: 0, fraud: 0, collusion: 0 }; edgesByType[e.type].count += e.weight; edgesByType[e.type].fraud += e.fraud_count; if (e.collusion) edgesByType[e.type].collusion++; });
  // Top connections
  const topEdges = (edges as Edge[]).filter(e => e.fraud_count > 0).sort((a, b) => b.fraud_count - a.fraud_count).slice(0, 15);
  const nodeMap = Object.fromEntries((nodes as Node[]).map(n => [n.id, n]));
  const matrixOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', backgroundColor: 'rgba(15,23,42,0.95)', textStyle: { color: '#f1f5f9', fontSize: 11 }, formatter: (p: { name: string; value: number }) => `<b>${p.name}</b>: ${p.value} transactions` },
    series: [{
      type: 'pie', radius: ['35%', '58%'], center: ['50%', '48%'],
      label: { show: true, fontSize: 10, color: '#94a3b8', formatter: (p: { name: string; percent: string }) => `${p.name}\n${p.percent}%` },
      labelLine: { show: true },
      legend: { bottom: 0, left: 'center', orient: 'horizontal', textStyle: { color: '#94a3b8', fontSize: 10 } },
      data: Object.entries(edgesByType).map(([type, v]) => ({
        name: { 'imp-dec': 'Import→Déclarant', 'dec-ins': 'Déclarant→Inspecteur', 'ins-off': 'Inspecteur→Bureau' }[type] ?? type,
        value: v.count,
        itemStyle: { color: { 'imp-dec': '#3b82f6', 'dec-ins': '#a78bfa', 'ins-off': '#f59e0b' }[type] ?? '#64748b' },
      })),
    }],
  };
  return (
    <div className="space-y-5">
      <StaggerGrid className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard label="Total nœuds" value={stats.total_nodes ?? 0} icon="🔵" color="accent" />
        <KPICard label="Total connexions" value={stats.total_edges ?? 0} icon="🔗" color="teal" />
        <KPICard label="Liens collusion" value={stats.collusion_edges ?? 0} icon="⚠️" color="danger" />
        <KPICard label="Importateurs haut risque" value={stats.high_risk_importers ?? 0} icon="🚨" color="gold" />
      </StaggerGrid>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="card">
          <SectionTitle icon="🍩">Flux par type de relation</SectionTitle>
          <ReactECharts option={matrixOption} style={{ height: 260 }} />
        </div>
        <div className="xl:col-span-2 card">
          <div className="flex items-center gap-3 mb-4">
            <SectionTitle icon="🕸️">Connexions frauduleuses prioritaires</SectionTitle>
            <div className="ml-auto flex gap-2">
              {(['ALL', 'COLLUSION', 'HIGH_RISK'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} className="text-xs px-3 py-1 rounded-full transition-all" style={{ background: filter === f ? 'rgba(139,92,246,0.2)' : 'transparent', border: `1px solid ${filter === f ? '#a78bfa' : 'rgba(255,255,255,0.08)'}`, color: filter === f ? '#a78bfa' : '#64748b' }}>{f === 'ALL' ? 'Tous' : f === 'COLLUSION' ? '⚠️ Collusion' : '🔴 Haut risque'}</button>
              ))}
            </div>
          </div>
          <PaginatedTable pageSize={10} headers={<tr><th>Source</th><th>Type</th><th>Cible</th><th>Transactions</th><th>Fraudes</th><th>Collusion</th></tr>}
            rows={topEdges.map((e: Edge, i: number) => {
              const src = nodeMap[e.source]; const tgt = nodeMap[e.target];
              return (
                <tr key={i} style={{ background: e.collusion ? 'rgba(239,68,68,0.06)' : undefined }}>
                  <td><span style={{ color: NODE_COLORS[src?.type ?? ''] ?? '#fff', fontSize: 12 }}>●</span> <span className="text-xs text-white">{src?.label ?? e.source}</span></td>
                  <td><span className="text-[10px] text-muted px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>{{ 'imp-dec': 'IMPORT→DÉC', 'dec-ins': 'DÉC→INSP', 'ins-off': 'INSP→BURE' }[e.type] ?? e.type}</span></td>
                  <td><span style={{ color: NODE_COLORS[tgt?.type ?? ''] ?? '#fff', fontSize: 12 }}>●</span> <span className="text-xs text-white">{tgt?.label ?? e.target}</span></td>
                  <td><span className="text-xs font-bold text-white">{fmt(e.weight)}</span></td>
                  <td><span className="text-xs font-bold text-red-400">{e.fraud_count}</span></td>
                  <td>{e.collusion ? <span className="badge badge-danger text-[10px]">SUSPECT</span> : <span className="badge badge-success text-[10px]">OK</span>}</td>
                </tr>
              );
            })} />
        </div>
      </div>
      {/* Node type legend */}
      <div className="card">
        <SectionTitle icon="🔵">Annuaire des nœuds filtrés ({visNodes.length}/{(nodes as Node[]).length})</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
          {(['importer', 'declarant', 'inspector', 'office'] as const).map(type => {
            const typeNodes = visNodes.filter(n => n.type === type).sort((a, b) => b.risk - a.risk).slice(0, 8);
            return (
              <div key={type}>
                <div className="text-xs font-bold mb-2" style={{ color: NODE_COLORS[type] }}>
                  {{ importer: '🏢 Importateurs', declarant: '📋 Déclarants', inspector: '👮 Inspecteurs', office: '🏛️ Bureaux' }[type]}
                </div>
                {typeNodes.map(n => (
                  <div key={n.id} className="flex items-center gap-1.5 mb-1">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: n.collusion ? '#ef4444' : riskColor(n.risk) }} />
                    <span className="text-[10px] text-sub truncate">{n.label}</span>
                    {n.fraud_count > 0 && <span className="text-[9px] text-red-400 font-bold ml-auto">{n.fraud_count}F</span>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB 4 — RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════════
function RecommendationsTab() {
  const { data, loading, error } = useApi(() => fetch('/api/advanced/recommendations').then(r => r.json()));
  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorBox message={error} />;
  const { recommendations = [], total = 0, generated_at = '' } = data ?? {};
  type Rec = { priority: number; category: string; title: string; description: string; impact: string; action: string; entities: string[] };
  const IMPACT_COLOR: Record<string, string> = { Critique: '#ef4444', Haut: '#f97316', Élevé: '#f59e0b', Moyen: '#3b82f6' };
  const CAT_COLOR: Record<string, string> = { INSPECTION: '#ef4444', INTÉGRITÉ: '#a78bfa', CIBLAGE: '#f59e0b', EFFICACITÉ: '#3b82f6', RECOUVREMENT: '#10b981' };
  return (
    <div className="space-y-5">
      <StaggerGrid className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard label="Recommandations actives" value={total} icon="💡" color="gold" />
        <KPICard label="Priorité critique" value={(recommendations as Rec[]).filter(r => r.impact === 'Critique').length} icon="🔴" color="danger" />
        <KPICard label="Impact élevé" value={(recommendations as Rec[]).filter(r => r.impact === 'Haut' || r.impact === 'Élevé').length} icon="🟠" color="accent" />
        <KPICard label="Générées le" value={new Date(generated_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} icon="🕐" color="teal" />
      </StaggerGrid>
      <div className="space-y-4">
        {(recommendations as Rec[]).map((rec, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }} className="card" style={{ borderLeft: `3px solid ${IMPACT_COLOR[rec.impact] ?? '#64748b'}` }}>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-black text-sm" style={{ background: IMPACT_COLOR[rec.impact] + '22', color: IMPACT_COLOR[rec.impact] ?? '#64748b' }}>
                {rec.priority}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1 flex-wrap">
                  <span className="text-sm font-bold text-white">{rec.title}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: (CAT_COLOR[rec.category] ?? '#64748b') + '22', color: CAT_COLOR[rec.category] ?? '#64748b', border: `1px solid ${(CAT_COLOR[rec.category] ?? '#64748b')}44` }}>{rec.category}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto" style={{ background: (IMPACT_COLOR[rec.impact] ?? '#64748b') + '22', color: IMPACT_COLOR[rec.impact] ?? '#64748b' }}>Impact: {rec.impact}</span>
                </div>
                <p className="text-xs text-sub mb-2">{rec.description}</p>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] text-muted">Action:</span>
                  <span className="text-xs font-semibold" style={{ color: IMPACT_COLOR[rec.impact] ?? '#64748b' }}>{rec.action}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {rec.entities.map((e, j) => (
                    <span key={j} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}>{e}</span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB 5 — INSPECTOR ANALYTICS
// ═══════════════════════════════════════════════════════════════════
function InspectorAnalyticsTab() {
  const { data: allData, loading, error } = useApi(() => fetch('/api/advanced/inspector-deep').then(r => r.json()));
  const [selected, setSelected] = useState<string | null>(null);
  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorBox message={error} />;
  const inspectors: Record<string, unknown>[] = allData ?? [];
  const sel = selected ? inspectors.find(i => i.inspector_id === selected) : null;
  const kpis = (sel?.kpis ?? {}) as Record<string, number | boolean>;
  const piColor = (pi: number) => pi >= 70 ? '#10b981' : pi >= 45 ? '#f59e0b' : '#ef4444';
  const radarOption = sel ? {
    backgroundColor: 'transparent',
    radar: { indicator: [{ name: 'Fraude', max: 100 }, { name: 'Proactivité', max: 100 }, { name: 'Vitesse', max: 100 }, { name: 'Recettes', max: 100 }, { name: 'Écart Fiscal', max: 100 }, { name: 'Saisies', max: 100 }], axisName: { color: '#64748b', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } }, splitArea: { show: false }, axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } } },
    series: [{ type: 'radar', data: [{ value: [Math.min(100, (kpis.fraud_rate as number) * 300), Math.min(100, (kpis.proactive_rate as number) * 200), Math.min(100, (kpis.speed_ratio as number) * 100), Math.min(100, (kpis.revenue_collected as number) / Math.max(kpis.taxes_assessed as number, 1) * 100), Math.min(100, (kpis.tax_gap_recovered as number) / Math.max(kpis.taxes_assessed as number, 1) * 200), Math.min(100, (kpis.seizures as number) * 10)], areaStyle: { color: 'rgba(59,130,246,0.15)' }, lineStyle: { color: '#3b82f6', width: 2 }, itemStyle: { color: '#3b82f6' } }] }],
    tooltip: { trigger: 'item', backgroundColor: 'rgba(15,23,42,0.95)', textStyle: { color: '#f1f5f9' } },
  } : null;
  const trendOption = sel ? {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', textStyle: { color: '#f1f5f9', fontSize: 11 }, axisPointer: { type: 'shadow' } },
    legend: { bottom: 0, left: 'center', textStyle: { color: '#64748b', fontSize: 9 }, itemWidth: 8, itemHeight: 8 },
    grid: { left: 8, right: 8, top: 8, bottom: 40, containLabel: true },
    xAxis: { type: 'category', data: (sel.monthly_trend as Record<string, unknown>[]).map(m => m.label as string), axisLabel: { color: '#475569', fontSize: 8, rotate: 45 }, axisLine: { show: false }, axisTick: { show: false } },
    yAxis: [{ type: 'value', axisLabel: { color: '#475569', fontSize: 9 }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } }, axisLine: { show: false } }, { type: 'value', position: 'right', axisLabel: { color: '#f87171', fontSize: 9 }, splitLine: { show: false }, axisLine: { show: false } }],
    series: [
      { name: 'Déclarations', type: 'bar', yAxisIndex: 0, data: (sel.monthly_trend as Record<string, unknown>[]).map(m => m.decls), itemStyle: { color: 'rgba(59,130,246,0.4)', borderRadius: [2,2,0,0] }, barMaxWidth: 16 },
      { name: 'Fraudes', type: 'bar', yAxisIndex: 1, data: (sel.monthly_trend as Record<string, unknown>[]).map(m => m.fraud), itemStyle: { color: 'rgba(239,68,68,0.8)', borderRadius: [2,2,0,0] }, barMaxWidth: 10, label: { show: true, position: 'top', color: '#f87171', fontSize: 8, formatter: (p: { value: number }) => p.value > 0 ? String(p.value) : '' } },
      { name: 'Proactif', type: 'line', yAxisIndex: 1, data: (sel.monthly_trend as Record<string, unknown>[]).map(m => m.proactive), lineStyle: { color: '#10b981', width: 2 }, itemStyle: { color: '#10b981' }, symbol: 'circle', symbolSize: 4 },
    ],
  } : null;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Inspector list */}
        <div className="card xl:col-span-1">
          <SectionTitle icon="👮">Classement Performance</SectionTitle>
          <div className="space-y-2 mt-2" style={{ maxHeight: 480, overflowY: 'auto' }}>
            {inspectors.map((ins, i) => {
              const pi = ins.performance_index as number;
              const kp = (ins.kpis ?? {}) as Record<string, number>;
              return (
                <button key={ins.inspector_id as string} onClick={() => setSelected(sel?.inspector_id === ins.inspector_id ? null : ins.inspector_id as string)} className="w-full text-left p-3 rounded-xl transition-all" style={{ background: selected === ins.inspector_id ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selected === ins.inspector_id ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted w-4">{i+1}</span>
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-white">{ins.name as string}</div>
                      <div className="text-[10px] text-muted">{ins.grade as string} · {ins.bureau as string}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black" style={{ color: piColor(pi) }}>{pi}</div>
                      <div className="text-[9px] text-muted">PI</div>
                    </div>
                  </div>
                  <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${pi}%`, background: piColor(pi) }} />
                  </div>
                  <div className="flex gap-3 mt-1.5 text-[10px] text-muted">
                    <span>🎯 {kp.fraud_detected} fraudes</span>
                    <span>⚡ {kp.proactive_detections} proactif</span>
                    <span>⏱️ {kp.avg_clearance_hours}h</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        {/* Detail panel */}
        {sel ? (
          <div className="xl:col-span-2 space-y-4">
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl font-black" style={{ background: `${piColor(sel.performance_index as number)}22`, color: piColor(sel.performance_index as number) }}>{sel.performance_index as number}</div>
                <div><div className="font-bold text-white">{sel.name as string}</div><div className="text-xs text-muted">{sel.grade as string} · Bureau {sel.bureau as string}</div></div>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[['Déclarations', kpis.total_declarations, '📋'], ['Fraudes', kpis.fraud_detected, '🎯'], ['Proactif', kpis.proactive_detections, '⚡'], ['Saisies', kpis.seizures, '🔒'], ['Overrides', kpis.overrides, '🔄'], ['Collusion', kpis.collusion_cases, '⚠️']].map(([l, v, ic]) => (
                  <div key={l as string} className="card-sm text-center">
                    <div className="text-base">{ic as string}</div>
                    <div className="text-lg font-black text-white">{String(v)}</div>
                    <div className="text-[10px] text-muted">{l as string}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {radarOption && <div><div className="text-xs font-bold text-white mb-2">Profil de compétences</div><ReactECharts option={radarOption} style={{ height: 220 }} /></div>}
                <div><div className="text-xs font-bold text-white mb-2">Types de fraude détectés</div>
                  {Object.entries((sel.fraud_types ?? {}) as Record<string, number>).map(([type, count]) => (
                    <div key={type} className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] text-sub flex-1">{type.replace(/_/g,' ')}</span>
                      <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}><div className="h-full rounded-full bg-blue-500" style={{ width: `${(count / (sel.kpis as Record<string,number>).fraud_detected) * 100}%` }} /></div>
                      <span className="text-[10px] font-bold text-white w-4">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {trendOption && <div className="card"><SectionTitle icon="📈">Tendance mensuelle — Déclarations & Fraudes (24 mois)</SectionTitle><ReactECharts option={trendOption} style={{ height: 220 }} /></div>}
          </div>
        ) : (
          <div className="xl:col-span-2 card flex items-center justify-center" style={{ minHeight: 300 }}>
            <div className="text-center text-muted"><div className="text-4xl mb-3">👮</div><div className="text-sm">Sélectionnez un inspecteur pour voir son profil détaillé</div></div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB 6 — OFFICE ANALYTICS
// ═══════════════════════════════════════════════════════════════════
function OfficeAnalyticsTab() {
  const { data: allData, loading, error } = useApi(() => fetch('/api/advanced/office-deep').then(r => r.json()));
  const [selected, setSelected] = useState<string | null>(null);
  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorBox message={error} />;
  const offices: Record<string, unknown>[] = allData ?? [];
  const sel = selected ? offices.find(o => o.office_id === selected) : null;
  const kpis = ((sel?.kpis) ?? {}) as Record<string, unknown>;
  const radarOption = sel ? {
    backgroundColor: 'transparent',
    radar: { indicator: [{ name: 'Volume', max: 100 }, { name: 'Détection', max: 100 }, { name: 'Vitesse', max: 100 }, { name: 'Recettes', max: 100 }, { name: 'Saisies', max: 100 }, { name: 'Sécurité', max: 100 }], axisName: { color: '#64748b', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } }, splitArea: { show: false }, axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } } },
    series: [{ type: 'radar', data: [{ value: [Math.min(100, (kpis.total_sgds as number) / 930 * 100), Math.min(100, (kpis.fraud_count as number) / (kpis.total_sgds as number) * 300), kpis.efficiency_score as number, Math.min(100, (kpis.revenue_collected as number) / 1.09e9 * 100), Math.min(100, (kpis.seizures as number) * 3), Math.max(0, 100 - (kpis.fraud_rate as number) * 500)], areaStyle: { color: 'rgba(245,158,11,0.15)' }, lineStyle: { color: '#f59e0b', width: 2 }, itemStyle: { color: '#f59e0b' } }] }],
    tooltip: { trigger: 'item', backgroundColor: 'rgba(15,23,42,0.95)', textStyle: { color: '#f1f5f9' } },
  } : null;
  const trendOption = sel ? {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', textStyle: { color: '#f1f5f9', fontSize: 11 } },
    legend: { bottom: 0, left: 'center', textStyle: { color: '#64748b', fontSize: 9 }, itemWidth: 8, itemHeight: 8 },
    grid: { left: 8, right: 8, top: 8, bottom: 40, containLabel: true },
    xAxis: { type: 'category', data: (sel.monthly_trend as Record<string, unknown>[]).map(m => m.label as string), axisLabel: { color: '#475569', fontSize: 8, rotate: 45 }, axisLine: { show: false }, axisTick: { show: false } },
    yAxis: [{ type: 'value', axisLabel: { color: '#475569', fontSize: 9, formatter: (v: number) => `${fmtM(v)}M` }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } }, axisLine: { show: false } }, { type: 'value', position: 'right', axisLabel: { color: '#f87171', fontSize: 9 }, splitLine: { show: false }, axisLine: { show: false } }],
    series: [
      { name: 'Recettes', type: 'bar', yAxisIndex: 0, data: (sel.monthly_trend as Record<string, unknown>[]).map(m => m.rev), itemStyle: { color: 'rgba(245,158,11,0.5)', borderRadius: [2,2,0,0] }, barMaxWidth: 16 },
      { name: 'Fraudes', type: 'bar', yAxisIndex: 1, data: (sel.monthly_trend as Record<string, unknown>[]).map(m => m.fraud), itemStyle: { color: 'rgba(239,68,68,0.8)', borderRadius: [2,2,0,0] }, barMaxWidth: 10, label: { show: true, position: 'top', color: '#f87171', fontSize: 8, formatter: (p: { value: number }) => p.value > 0 ? String(p.value) : '' } },
    ],
  } : null;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="card xl:col-span-1">
          <SectionTitle icon="🏛️">Classement des Bureaux</SectionTitle>
          <div className="space-y-2 mt-2">
            {offices.map((off, i) => {
              const k = (off.kpis ?? {}) as Record<string, number>;
              return (
                <button key={off.office_id as string} onClick={() => setSelected(sel?.office_id === off.office_id ? null : off.office_id as string)} className="w-full text-left p-3 rounded-xl transition-all" style={{ background: selected === off.office_id ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selected === off.office_id ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted w-4">{i+1}</span>
                    <div className="flex-1"><div className="text-xs font-semibold text-white">{off.name as string}</div><div className="text-[10px] text-muted">{off.office_id as string}</div></div>
                    <div className="text-right"><div className="text-sm font-black" style={{ color: riskColor(100 - k.efficiency_score) }}>{k.efficiency_score}%</div><div className="text-[9px] text-muted">Eff.</div></div>
                  </div>
                  <div className="flex gap-3 mt-1.5 text-[10px] text-muted">
                    <span>📋 {fmt(k.total_sgds)} SGDs</span>
                    <span>🚨 {k.fraud_count} fraudes ({Math.round(k.fraud_rate*100)}%)</span>
                    <span>💰 {fmtM(k.revenue_collected)}M</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        {sel ? (
          <div className="xl:col-span-2 space-y-4">
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl">🏛️</div>
                <div><div className="font-bold text-white">{sel.name as string}</div><div className="text-xs text-muted">Standard: {sel.baseline_hours as number}h · Moy. actuelle: {(kpis.avg_clearance_hours as number)}h</div></div>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[['SGDs', fmt(kpis.total_sgds as number), '📋'], ['Fraudes', kpis.fraud_count, '🚨'], ['Efficience', `${kpis.efficiency_score}%`, '⚡'], ['Recettes', `${fmtM(kpis.revenue_collected as number)}M`, '💰'], ['Saisies', kpis.seizures, '🔒'], ['Écart fiscal', `${fmtM(kpis.tax_gap_recovered as number)}M`, '📊']].map(([l, v, ic]) => (
                  <div key={l as string} className="card-sm text-center"><div className="text-base">{ic as string}</div><div className="text-sm font-black text-white">{String(v)}</div><div className="text-[10px] text-muted">{l as string}</div></div>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {radarOption && <div><div className="text-xs font-bold text-white mb-2">Profil du bureau</div><ReactECharts option={radarOption} style={{ height: 220 }} /></div>}
                <div>
                  <div className="text-xs font-bold text-white mb-2">Top inspecteurs</div>
                  {((sel.inspectors as Record<string, unknown>[]) ?? []).slice(0,5).map(ins => (
                    <div key={ins.id as string} className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] text-sub flex-1">{ins.name as string}</span>
                      <span className="text-[10px] font-bold text-red-400">{ins.fraud as number}F</span>
                      <span className="text-[10px] text-muted">/{ins.total as number}</span>
                    </div>
                  ))}
                  <div className="text-xs font-bold text-white mt-3 mb-2">Canaux de contrôle</div>
                  {Object.entries((kpis.channel_distribution as Record<string, number>) ?? {}).map(([ch, cnt]) => (
                    <div key={ch} className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] w-12" style={{ color: ch==='ROUGE'?'#ef4444':ch==='JAUNE'?'#f59e0b':'#10b981' }}>{ch}</span>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div className="h-full rounded-full" style={{ width: `${cnt/(kpis.total_sgds as number)*100}%`, background: ch==='ROUGE'?'#ef4444':ch==='JAUNE'?'#f59e0b':'#10b981' }} />
                      </div>
                      <span className="text-[10px] font-bold text-white w-8">{cnt}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {trendOption && <div className="card"><SectionTitle icon="📈">Recettes & Fraudes mensuelles (24 mois)</SectionTitle><ReactECharts option={trendOption} style={{ height: 220 }} /></div>}
          </div>
        ) : (
          <div className="xl:col-span-2 card flex items-center justify-center" style={{ minHeight: 300 }}>
            <div className="text-center text-muted"><div className="text-4xl mb-3">🏛️</div><div className="text-sm">Sélectionnez un bureau pour voir son profil détaillé</div></div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB 7 — IMPORTER ANALYTICS
// ═══════════════════════════════════════════════════════════════════
function ImporterAnalyticsTab() {
  const { data: allData, loading, error } = useApi(() => fetch('/api/advanced/importer-deep').then(r => r.json()));
  const [selected, setSelected] = useState<string | null>(null);
  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorBox message={error} />;
  const importers: Record<string, unknown>[] = allData ?? [];
  const sel = selected ? importers.find(i => i.importer_id === selected) : null;
  const kpis = ((sel?.kpis) ?? {}) as Record<string, unknown>;
  const trendOption = sel ? {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', textStyle: { color: '#f1f5f9', fontSize: 11 } },
    legend: { bottom: 0, left: 'center', textStyle: { color: '#64748b', fontSize: 9 }, itemWidth: 8, itemHeight: 8 },
    grid: { left: 8, right: 8, top: 8, bottom: 40, containLabel: true },
    xAxis: { type: 'category', data: (sel.monthly_trend as Record<string, unknown>[]).map(m => m.label as string), axisLabel: { color: '#475569', fontSize: 8, rotate: 45 }, axisLine: { show: false }, axisTick: { show: false } },
    yAxis: [{ type: 'value', axisLabel: { color: '#475569', fontSize: 9, formatter: (v: number) => `${fmtM(v)}M` }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } }, axisLine: { show: false } }, { type: 'value', position: 'right', axisLabel: { color: '#f87171', fontSize: 9 }, splitLine: { show: false }, axisLine: { show: false } }],
    series: [
      { name: 'CIF déclarée', type: 'bar', yAxisIndex: 0, data: (sel.monthly_trend as Record<string, unknown>[]).map(m => m.cif), itemStyle: { color: 'rgba(59,130,246,0.4)', borderRadius: [2,2,0,0] }, barMaxWidth: 16 },
      { name: 'Recettes', type: 'line', yAxisIndex: 0, data: (sel.monthly_trend as Record<string, unknown>[]).map(m => m.rev), lineStyle: { color: '#10b981', width: 2 }, itemStyle: { color: '#10b981' }, symbol: 'none' },
      { name: 'Fraudes', type: 'bar', yAxisIndex: 1, data: (sel.monthly_trend as Record<string, unknown>[]).map(m => m.fraud), itemStyle: { color: 'rgba(239,68,68,0.8)', borderRadius: [2,2,0,0] }, barMaxWidth: 8, label: { show: true, position: 'top', color: '#f87171', fontSize: 8, formatter: (p: { value: number }) => p.value > 0 ? String(p.value) : '' } },
    ],
  } : null;
  const PROFILE_COLOR: Record<string, string> = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#10b981' };
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="card xl:col-span-1" style={{ maxHeight: 580, display: 'flex', flexDirection: 'column' }}>
          <SectionTitle icon="🏢">Classement par Score Risque</SectionTitle>
          <div className="space-y-2 mt-2 overflow-y-auto flex-1">
            {importers.map((imp, i) => {
              const k = (imp.kpis ?? {}) as Record<string, number | boolean>;
              return (
                <button key={imp.importer_id as string} onClick={() => setSelected(sel?.importer_id === imp.importer_id ? null : imp.importer_id as string)} className="w-full text-left p-3 rounded-xl transition-all" style={{ background: selected === imp.importer_id ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selected === imp.importer_id ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted w-4">{i+1}</span>
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-white truncate">{imp.name as string}</div>
                      <div className="flex gap-1.5 mt-0.5">
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: PROFILE_COLOR[imp.risk_profile as string] + '22', color: PROFILE_COLOR[imp.risk_profile as string] }}>{imp.risk_profile as string}</span>
                        {k.repeat_offender && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: '#ef444422', color: '#ef4444' }}>RÉCIDIVISTE</span>}
                        {k.collusion_suspected && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: '#a78bfa22', color: '#a78bfa' }}>COLLUSION</span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0"><div className="text-sm font-black" style={{ color: riskColor(imp.risk_score as number) }}>{imp.risk_score as number}</div><div className="text-[9px] text-muted">Risque</div></div>
                  </div>
                  <div className="flex gap-3 mt-1.5 text-[10px] text-muted">
                    <span>📋 {k.total_declarations} SGDs</span>
                    <span>🚨 {k.fraud_count} ({Math.round((k.fraud_rate as number)*100)}%)</span>
                    <span>💸 {fmtM(k.total_evasion as number)}M évasion</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        {sel ? (
          <div className="xl:col-span-2 space-y-4">
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl font-black" style={{ background: riskColor(sel.risk_score as number) + '22', color: riskColor(sel.risk_score as number) }}>{sel.risk_score as number}</div>
                <div>
                  <div className="font-bold text-white">{sel.name as string}</div>
                  <div className="flex gap-2 mt-0.5">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: PROFILE_COLOR[sel.risk_profile as string] + '22', color: PROFILE_COLOR[sel.risk_profile as string] }}>{sel.risk_profile as string} RISK</span>
                    {(kpis.repeat_offender as boolean) && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: '#ef444422', color: '#ef4444' }}>RÉCIDIVISTE</span>}
                    {(kpis.collusion_suspected as boolean) && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: '#a78bfa22', color: '#a78bfa' }}>COLLUSION SUSPECTE</span>}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[['Déclarations', fmt(kpis.total_declarations as number), '📋'], ['Fraudes', kpis.fraud_count, '🚨'], ['Évasion', `${fmtM(kpis.total_evasion as number)}M`, '💸'], ['Pénalités', `${fmtM(kpis.total_penalty as number)}M`, '⚖️'], ['Récupéré', `${fmtM(kpis.total_recovered as number)}M`, '💰'], ['Perte nette', `${fmtM(kpis.total_loss as number)}M`, '📉'], ['Taux récup.', `${Math.round((kpis.recovery_rate as number)*100)}%`, '📊'], ['Taux fraude', `${Math.round((kpis.fraud_rate as number)*100)}%`, '🎯']].map(([l, v, ic]) => (
                  <div key={l as string} className="card-sm text-center"><div className="text-base">{ic as string}</div><div className="text-xs font-black text-white">{String(v)}</div><div className="text-[10px] text-muted">{l as string}</div></div>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-bold text-white mb-2">Types de fraude</div>
                  {Object.entries((sel.fraud_types ?? {}) as Record<string, number>).map(([type, count]) => (
                    <div key={type} className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] text-sub flex-1">{type.replace(/_/g,' ')}</span>
                      <span className="text-[10px] font-bold text-red-400">{count}</span>
                    </div>
                  ))}
                  <div className="text-xs font-bold text-white mt-3 mb-2">Pays d'origine</div>
                  {((sel.countries as Record<string, unknown>[]) ?? []).map((c: Record<string, unknown>) => (
                    <div key={c.country as string} className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] w-8 font-bold text-sub">{c.country as string}</span>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${(c.count as number)/((kpis.total_declarations as number))*100}%` }} />
                      </div>
                      <span className="text-[10px] text-white">{c.count as number}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-xs font-bold text-white mb-2">Réseau déclarants</div>
                  {((sel.declarants as Record<string, unknown>[]) ?? []).slice(0,5).map(d => (
                    <div key={d.id as string} className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] text-sub flex-1">{d.name as string}</span>
                      <span className="text-[10px] text-white">{d.count as number} SGDs</span>
                      {(d.fraud as number) > 0 && <span className="text-[10px] text-red-400 font-bold">{d.fraud as number}F</span>}
                    </div>
                  ))}
                  <div className="text-xs font-bold text-white mt-3 mb-2">Statuts dossiers fraude</div>
                  {Object.entries((sel.case_status ?? {}) as Record<string, number>).map(([st, cnt]) => (
                    <div key={st} className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] text-muted flex-1">{st.replace(/_/g,' ')}</span>
                      <span className="text-[10px] font-bold text-white">{cnt}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {trendOption && <div className="card"><SectionTitle icon="📈">Activité mensuelle (24 mois)</SectionTitle><ReactECharts option={trendOption} style={{ height: 220 }} /></div>}
          </div>
        ) : (
          <div className="xl:col-span-2 card flex items-center justify-center" style={{ minHeight: 300 }}>
            <div className="text-center text-muted"><div className="text-4xl mb-3">🏢</div><div className="text-sm">Sélectionnez un importateur pour son dossier complet</div></div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════
export default function AdvancedPage() {
  const [activeTab, setActiveTab] = useState<Tab>('fraud');
  return (
    <div className="space-y-5">
      <PageHeader />
      {/* Tab bar */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all" style={{ background: activeTab === t.id ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)', border: `1px solid ${activeTab === t.id ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.07)'}`, color: activeTab === t.id ? '#60a5fa' : '#64748b' }}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>
      {/* Tab content */}
      <FadeIn key={activeTab}>
        {activeTab === 'fraud'      && <FraudDetectionTab />}
        {activeTab === 'revenue'    && <RevenueForecastTab />}
        {activeTab === 'network'    && <NetworkTab />}
        {activeTab === 'recommend'  && <RecommendationsTab />}
        {activeTab === 'inspectors' && <InspectorAnalyticsTab />}
        {activeTab === 'offices'    && <OfficeAnalyticsTab />}
        {activeTab === 'importers'  && <ImporterAnalyticsTab />}
      </FadeIn>
    </div>
  );
}
