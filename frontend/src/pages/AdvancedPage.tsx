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
type Tab = 'fraud' | 'recommend' | 'analytique' | 'predictions';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'fraud',       icon: '🎯', label: 'Moteur de Scoring Fraude' },
  { id: 'recommend',   icon: '💡', label: 'Recommandations IA'       },
  { id: 'analytique',  icon: '📐', label: 'Patterns & Cohortes'      },
  { id: 'predictions', icon: '🔮', label: 'Prédiction ML'            },
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
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: 'rgba(59,130,246,0.3)',
      borderWidth: 1,
      textStyle: { color: '#f1f5f9', fontSize: 12 },
      formatter: (p: { name: string; value: number; percent: string }) =>
        `<span style="color:#f1f5f9"><b>${p.name}</b><br/><span style="color:#fff;font-weight:bold">${p.value}</span> <span style="color:#94a3b8">(${p.percent}%)</span></span>`,
    },
    series: [{ type: 'pie', radius: ['45%', '70%'], center: ['50%', '50%'],
      avoidLabelOverlap: true,
      label: { show: true, position: 'outside', formatter: (p: { name: string; value: number }) => `${p.name}\n${p.value}`, color: '#94a3b8', fontSize: 12 },
      labelLine: { show: true, length: 12, length2: 8, lineStyle: { color: 'rgba(148,163,184,0.4)' } },
      emphasis: { scale: true, scaleSize: 6 },
      data: [
        { name: 'Critique ≥70', value: high_risk,   itemStyle: { color: '#ef4444', borderRadius: 4, borderWidth: 2, borderColor: 'rgba(15,23,42,0.9)' } },
        { name: 'Modéré 40-70', value: medium_risk, itemStyle: { color: '#f59e0b', borderRadius: 4, borderWidth: 2, borderColor: 'rgba(15,23,42,0.9)' } },
        { name: 'Faible <40',   value: total - high_risk - medium_risk, itemStyle: { color: '#10b981', borderRadius: 4, borderWidth: 2, borderColor: 'rgba(15,23,42,0.9)' } },
      ],
    }],
  };
  return (
    <div className="space-y-5">
      <StaggerGrid className="grid grid-cols-4 gap-2">
        <KPICard compact label="Déclarations analysées" value={fmt(total)} icon="📋" color="accent" />
        <KPICard compact label="Score Critique ≥70" value={high_risk} icon="🔴" color="danger" />
        <KPICard compact label="Score Modéré 40-70" value={medium_risk} icon="🟡" color="gold" />
        <KPICard compact label="Précision algorithme" value="92%" icon="✅" color="success" />
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
// TAB 4 — RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════════
function RecommendationsTab() {
  const { filters } = useFilters();
  const qs = [filters.bureau !== 'ALL' && `bureau=${filters.bureau}`, filters.period !== 'ALL' && `period=${filters.period}`].filter(Boolean).join('&');
  const { data, loading, error } = useApi(() => fetch(`/api/advanced/recommendations${qs ? '?' + qs : ''}`).then(r => r.json()), [qs]);
  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorBox message={error} />;
  const { recommendations = [], total = 0, generated_at = '' } = data ?? {};
  type Rec = { priority: number; category: string; title: string; description: string; impact: string; action: string; entities: string[] };
  const IMPACT_COLOR: Record<string, string> = { Critique: '#ef4444', Haut: '#f97316', Élevé: '#f59e0b', Moyen: '#3b82f6' };
  const CAT_COLOR: Record<string, string> = { INSPECTION: '#ef4444', INTÉGRITÉ: '#a78bfa', CIBLAGE: '#f59e0b', EFFICACITÉ: '#3b82f6', RECOUVREMENT: '#10b981' };
  return (
    <div className="space-y-5">
      <StaggerGrid className="grid grid-cols-4 gap-2">
        <KPICard compact label="Recommandations actives" value={total} icon="💡" color="gold" />
        <KPICard compact label="Priorité critique" value={(recommendations as Rec[]).filter(r => r.impact === 'Critique').length} icon="🔴" color="danger" />
        <KPICard compact label="Impact élevé" value={(recommendations as Rec[]).filter(r => r.impact === 'Haut' || r.impact === 'Élevé').length} icon="🟠" color="accent" />
        <KPICard compact label="Générées le" value={new Date(generated_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} icon="🕐" color="teal" />
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
// TAB 8 — PATTERNS & COHORTES (merged from Analytique Avancée)
// ═══════════════════════════════════════════════════════════════════
type Cohort = { label: string; count: number; color: string; avg_risk: number };
type TariffRisk = { tariff_code: string; total_declarations: number; fraud_cases: number; fraud_rate: number; avg_cif: number; risk_level: string };
type TemporalPattern = { day: string; total: number; fraud: number; rate: number };
type CountryAnalysis = { country: string; total: number; fraud: number; revenue: number; fraud_rate: number };
const RISK_LEVEL_COLOR: Record<string, string> = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#10b981' };

function AnalytiqueTab() {
  // ① hooks first — always, unconditionally
  const { filters } = useFilters();

  const { data, loading, error, reload } = useApi(() => {
    const params = new URLSearchParams();
    if (filters.bureau !== 'ALL') params.set('bureau', filters.bureau);
    if (filters.period !== 'ALL') params.set('period', filters.period);
    const qs = params.toString();
    return fetch(`/api/analytics/cohorts${qs ? '?' + qs : ''}`).then(r => r.json());
  }, [filters.bureau, filters.period]);

  if (loading) return <><PageHeader /><Loading rows={5} /></>;
  if (error)   return <><PageHeader /><ErrorBox message={error} onRetry={reload} /></>;
  if (!data)   return null;

  const { cohorts, tariff_matrix, temporal_patterns, country_analysis } = data;

  // ② Client-side risk filter on cohorts
  const riskThreshold: Record<string, [number, number]> = {
    ALL: [0,100], CRITIQUE: [80,100], ELEVE: [60,79], MOYEN: [40,59], FAIBLE: [0,39],
  };
  const [rLo, rHi] = riskThreshold[filters.risk] ?? [0, 100];
  const filteredCohorts: Cohort[] = filters.risk === 'ALL'
    ? cohorts
    : cohorts.filter((c: Cohort) => c.avg_risk >= rLo && c.avg_risk <= rHi);

  const totalDecls = filteredCohorts.reduce((s: number, c: Cohort) => s + c.count, 0);

  // ③ Chart options
  const cohortOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(59,130,246,0.3)', borderWidth: 1, textStyle: { color: '#f1f5f9', fontSize: 12 }, formatter: (p: {name:string;value:number;percent:string}) => `<span style="color:#f1f5f9"><b>${p.name}</b><br/><span style="color:#fff;font-weight:bold">${p.value}</span> <span style="color:#94a3b8">(${p.percent}%)</span></span>` },
    series: [{
      type: 'pie', radius: ['45%', '70%'], center: ['50%', '50%'],
      avoidLabelOverlap: true,
      data: filteredCohorts.map((c: Cohort) => ({ name: c.label, value: c.count, itemStyle: { color: c.color, borderRadius: 4, borderWidth: 2, borderColor: 'rgba(15,23,42,0.9)' } })),
      label: { show: true, position: 'outside', color: '#94a3b8', fontSize: 12, formatter: '{b}\n{c}' },
      labelLine: { show: true, length: 12, length2: 8, lineStyle: { color: 'rgba(148,163,184,0.4)' } },
      emphasis: { scale: true, scaleSize: 6 },
      animationType: 'expansion', animationEasing: 'cubicOut',
    }],
  };

  const temporalOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: 'rgba(59,130,246,0.3)',
      borderWidth: 1,
      textStyle: { color: '#f1f5f9', fontSize: 12 },
      axisPointer: { type: 'shadow' },
      formatter: (params: {seriesName:string;value:number;marker:string}[]) => {
        const total  = params.find(p => p.seriesName === 'Total SGDs');
        const fraud  = params.find(p => p.seriesName === 'Cas de fraude');
        const rate   = params.find(p => p.seriesName === 'Taux fraude (%)');
        return `<span style="color:#f1f5f9">
          <b>${params[0]?.axisValueLabel ?? ''}</b><br/>
          ${total?.marker ?? ''} Total: <b>${total?.value ?? 0}</b><br/>
          ${fraud?.marker ?? ''} Fraudes: <b style="color:#f87171">${fraud?.value ?? 0}</b><br/>
          ${rate?.marker  ?? ''} Taux: <b style="color:#fbbf24">${Number(rate?.value ?? 0).toFixed(1)}%</b>
        </span>`;
      },
    },
    legend: {
      top: 0, right: 0,
      textStyle: { color: '#64748b', fontSize: 10 },
      itemWidth: 10, itemHeight: 10,
    },
    grid: { left: 8, right: 50, bottom: 20, top: 30, containLabel: true },
    xAxis: {
      type: 'category',
      data: temporal_patterns.map((d: TemporalPattern) => {
        const DAY_FULL: Record<string,string> = { 'Dim':'Dimanche','Lun':'Lundi','Mar':'Mardi','Mer':'Mercredi','Jeu':'Jeudi','Ven':'Vendredi','Sam':'Samedi' };
        return DAY_FULL[d.day] ?? d.day;
      }),
      axisLabel: { color: '#475569', fontSize: 11 },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
      axisTick: { show: false },
    },
    yAxis: [
      {
        type: 'value', name: 'SGDs', nameTextStyle: { color: '#475569', fontSize: 9 },
        axisLabel: { color: '#475569', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
        axisLine: { show: false },
      },
      {
        type: 'value', name: 'Fraudes', nameTextStyle: { color: '#f87171', fontSize: 9 },
        position: 'right',
        axisLabel: { color: '#f87171', fontSize: 10 },
        splitLine: { show: false },
        axisLine: { show: false },
      },
    ],
    series: [
      {
        name: 'Total SGDs', type: 'bar', yAxisIndex: 0,
        data: temporal_patterns.map((d: TemporalPattern) => d.total),
        itemStyle: { color: 'rgba(59,130,246,0.3)', borderRadius: [3,3,0,0] },
        barMaxWidth: 40,
      },
      {
        name: 'Cas de fraude', type: 'bar', yAxisIndex: 1,
        data: temporal_patterns.map((d: TemporalPattern) => d.fraud),
        itemStyle: { color: { type:'linear',x:0,y:0,x2:0,y2:1,
          colorStops:[{offset:0,color:'rgba(239,68,68,0.95)'},{offset:1,color:'rgba(239,68,68,0.5)'}]
        }, borderRadius: [3,3,0,0] },
        barMaxWidth: 24,
        label: { show: true, position: 'top', color: '#f87171', fontSize: 10,
          formatter: (p: {value:number}) => p.value > 0 ? String(p.value) : '' },
      },
      {
        name: 'Taux fraude (%)', type: 'line', yAxisIndex: 1,
        data: temporal_patterns.map((d: TemporalPattern) =>
          d.total > 0 ? Math.round((d.fraud / d.total) * 1000) / 10 : 0
        ),
        smooth: true,
        lineStyle: { color: '#fbbf24', width: 2 },
        itemStyle: { color: '#fbbf24' },
        symbol: 'circle', symbolSize: 5,
        showSymbol: true,
      },
    ],
  };


  const countryOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: 'rgba(59,130,246,0.3)',
      borderWidth: 1,
      textStyle: { color: '#f1f5f9', fontSize: 12 },
      axisPointer: { type: 'shadow' },
      formatter: (params: {seriesName:string;value:number;marker:string;axisValueLabel:string}[]) => {
        const total = params.find(p => p.seriesName === 'Déclarations');
        const fraud = params.find(p => p.seriesName === 'Cas de fraude');
        const t = total?.value ?? 0;
        const f = fraud?.value ?? 0;
        const rate = t > 0 ? ((f/t)*100).toFixed(1) : '0.0';
        return `<span style="color:#f1f5f9"><b>${params[0]?.axisValueLabel}</b><br/>${total?.marker ?? ''} Décl: <b>${t}</b><br/>${fraud?.marker ?? ''} Fraudes: <b style="color:#f87171">${f}</b><br/>Taux: <b style="color:#fbbf24">${rate}%</b></span>`;
      },
    },
    legend: { top: 0, right: 0, textStyle: { color: '#64748b', fontSize: 10 }, itemWidth: 10, itemHeight: 10 },
    grid: { left: 40, right: 60, top: 30, bottom: 8, containLabel: true },
    xAxis: [
      { type: 'value', axisLabel: { color: '#475569', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } }, axisLine: { show: false } },
      { type: 'value', position: 'top', axisLabel: { color: '#f87171', fontSize: 9 }, splitLine: { show: false }, axisLine: { show: false }, name: 'Fraudes', nameTextStyle: { color: '#f87171', fontSize: 9 } },
    ],
    yAxis: {
      type: 'category',
      data: country_analysis.slice(0,8).map((c: CountryAnalysis) => c.country),
      axisLabel: { color: '#94a3b8', fontSize: 11, fontWeight: 'bold' },
      axisLine: { show: false }, axisTick: { show: false },
    },
    series: [
      {
        name: 'Déclarations', type: 'bar', xAxisIndex: 0,
        data: country_analysis.slice(0,8).map((c: CountryAnalysis) => c.total),
        itemStyle: { color: 'rgba(59,130,246,0.35)', borderRadius: [0,3,3,0] },
        barMaxWidth: 18,
      },
      {
        name: 'Cas de fraude', type: 'bar', xAxisIndex: 1,
        data: country_analysis.slice(0,8).map((c: CountryAnalysis) => c.fraud),
        itemStyle: { color: { type:'linear',x:0,y:0,x2:1,y2:0,
          colorStops:[{offset:0,color:'rgba(239,68,68,0.95)'},{offset:1,color:'rgba(239,68,68,0.6)'}]
        }, borderRadius: [0,3,3,0] },
        barMaxWidth: 14,
        label: { show: true, position: 'right', color: '#f87171', fontSize: 9,
          formatter: (p: {value:number}) => p.value > 0 ? String(p.value) : '' },
      },
    ],
  };

  const tariffOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(59,130,246,0.3)', textStyle: { color: '#f1f5f9' },
      formatter: (p: { data: [number, number, string] }) => `${p.data[2]}<br/>Fraudes: ${Math.round(p.data[0])}<br/>Taux: ${p.data[1].toFixed(1)}%` },
    grid: { left: 16, right: 8, bottom: 24, top: 10, containLabel: true },
    xAxis: { type: 'value', name: 'Cas Fraude', nameTextStyle: { color: '#475569', fontSize: 10 }, axisLabel: { color: '#475569', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } } },
    yAxis: { type: 'value', name: 'Taux %', nameTextStyle: { color: '#475569', fontSize: 10 }, axisLabel: { color: '#475569', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } } },
    series: [{
      type: 'scatter',
      data: tariff_matrix.map((t: TariffRisk) => [t.fraud_cases, t.fraud_rate * 100, t.tariff_code]),
      symbolSize: (d: number[]) => Math.max(8, Math.sqrt(d[0]) * 8),
      itemStyle: { color: (p: { data: number[] }) => p.data[1] > 25 ? '#ef4444' : p.data[1] > 10 ? '#f59e0b' : '#3b82f6', opacity: 0.8 },
      label: { show: true, formatter: (p: { data: [number, number, string] }) => p.data[2], fontSize: 9, color: '#94a3b8', position: 'top' },
    }],
  };


  const activeDays = temporal_patterns.filter((d: TemporalPattern) => d.total > 0);
  const peakDay = activeDays.length > 0
    ? activeDays.reduce((b: TemporalPattern, d: TemporalPattern) => d.rate > b.rate ? d : b, activeDays[0])
    : temporal_patterns[0];
  const DAY_FULL2: Record<string,string> = { 'Dim':'Dimanche','Lun':'Lundi','Mar':'Mardi','Mer':'Mercredi','Jeu':'Jeudi','Ven':'Vendredi','Sam':'Samedi' };


  return (
    <div className="space-y-5">
      <StaggerGrid className="grid grid-cols-4 gap-2">
        <KPICard compact label="Opérateurs analysés" value={totalDecls} icon="🏢" color="accent" />
        <KPICard compact label="Codes tarifaires" value={fmt(tariff_matrix.length)} icon="🗂️" color="teal" />
        <KPICard compact label="Pays d'origine" value={fmt(country_analysis.length)} icon="🌍" color="gold" />
        <KPICard compact label="Jour pic fraude" value={DAY_FULL2[peakDay?.day] ?? peakDay?.day ?? '—'} icon="📅" color="danger" animate={false} />
      </StaggerGrid>

      {/* Row 1: Segmentation (1/3) + Fraude par jour (2/3) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 w-full items-stretch">
        <FadeIn delay={0.1} className="w-full h-full">
          <div className="card w-full h-full flex flex-col">
            <SectionTitle icon="👥">Segmentation des Importateurs</SectionTitle>
            <ReactECharts option={cohortOption} style={{ height: 310 }} />
            <div className="mt-3 p-3 rounded-xl" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
              <div className="text-[10px] text-muted mb-1 font-bold uppercase tracking-widest">💡 Recommandation IA</div>
              <p className="text-xs text-slate-400 leading-relaxed">
                <span className="font-bold text-white">{filteredCohorts.find((c: Cohort) => c.label === 'Critique / Fraude')?.count ?? 0} opérateurs critiques</span> — inspection systématique requise.
                Concentrer <span className="font-bold text-white">80%</span> des ressources sur les segments à risque élevé.
              </p>
            </div>
          </div>
        </FadeIn>
        <FadeIn delay={0.15} className="xl:col-span-2 w-full h-full">
          <div className="card w-full h-full flex flex-col">
            <SectionTitle icon="📅">Fraude par Jour de la Semaine</SectionTitle>
            <ReactECharts option={temporalOption} style={{ height: 310 }} />
            <div className="mt-3 p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <div className="text-[10px] text-red-400 mb-1 font-bold uppercase tracking-widest">⚡ Insight prédictif</div>
              <p className="text-xs text-slate-400">
                {peakDay ? `Le ${DAY_FULL2[peakDay.day] ?? peakDay.day} présente le taux de fraude le plus élevé. Renforcer les équipes d'inspection ce jour.` : '—'}
              </p>
            </div>
          </div>
        </FadeIn>
      </div>

      {/* Row 2: Matrice risque (2/3) + Flux géographiques (1/3) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 w-full items-stretch">
        <FadeIn delay={0.2} className="xl:col-span-2 w-full h-full">
          <div className="card w-full h-full flex flex-col">
            <SectionTitle icon="🗂️">Matrice Risque — Codes Tarifaires</SectionTitle>
            <ReactECharts option={tariffOption} style={{ height: 360 }} />
            <div className="flex gap-3 mt-2 justify-center">
              {[['#ef4444','Taux > 25%'],['#f59e0b','Taux 10–25%'],['#3b82f6','Taux < 10%']].map(([c,l]) => (
                <span key={l} className="flex items-center gap-1 text-[10px] text-muted">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />{l}
                </span>
              ))}
            </div>
          </div>
        </FadeIn>
        <FadeIn delay={0.25} className="w-full h-full">
          <div className="card w-full h-full flex flex-col">
            <SectionTitle icon="🌍">Flux Géographiques — Pays d'Origine</SectionTitle>
            <ReactECharts option={countryOption} style={{ height: 360 }} />
          </div>
        </FadeIn>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB 4 — PRÉDICTION ML (moved here from the standalone /predictions page)
// ═══════════════════════════════════════════════════════════════════
type Forecast = { month:string; label:string; actual:number|null; forecast:number; lower_bound:number; upper_bound:number };
type FraudVelocity = { current_month:string; velocity_index:number; acceleration:number; status:string; fraud_rate_current:number; fraud_rate_previous:number; projected_eom_loss:number; alert:string|null; monthly_series:{month:string;label:string;rate:number;velocity:number}[] };
const PRED_STATUS_COLOR: Record<string,string> = { CRITICAL:'#ef4444', WARNING:'#f97316', NORMAL:'#3b82f6', IMPROVING:'#10b981' };

function VelocityGauge({ velocity }: { velocity: FraudVelocity }) {
  const color = PRED_STATUS_COLOR[velocity.status] ?? '#3b82f6';
  const option = {
    backgroundColor:'transparent',
    series:[{
      type:'gauge', startAngle:200, endAngle:-20, min:0, max:200, radius:'90%',
      progress:{ show:true, width:16, itemStyle:{ color:{ type:'linear',x:0,y:0,x2:1,y2:0, colorStops:[{offset:0,color:'#10b981'},{offset:0.5,color:'#f59e0b'},{offset:1,color:'#ef4444'}] } } },
      axisLine:{ lineStyle:{ width:16, color:[[1,'rgba(255,255,255,0.06)']] } },
      pointer:{ length:'55%', width:5, itemStyle:{ color } },
      axisTick:{ show:false }, splitLine:{ show:false }, axisLabel:{ show:false },
      detail:{ valueAnimation:true, formatter:(v:number)=>`${Math.round(v)}`, color:'#f1f5f9', fontSize:26, fontFamily:'JetBrains Mono', offsetCenter:[0,'30%'] },
      title:{ offsetCenter:[0,'58%'], color:'#64748b', fontSize:10 },
      data:[{ value:velocity.velocity_index, name:'Indice Vélocité' }],
    }],
  };
  return (
    <div className="card text-center">
      <SectionTitle icon="⚡">Indice de Vélocité Fraude</SectionTitle>
      <ReactECharts option={option} style={{ height:200 }}/>
      <div className="mt-2 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted">Accélération</span>
          <span className="font-bold" style={{ color }}>{velocity.acceleration > 0 ? '+' : ''}{velocity.acceleration}% vs mois préc.</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted">Taux fraude actuel</span>
          <span className="font-bold text-white">{(velocity.fraud_rate_current * 100).toFixed(1)}%</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted">Perte projetée fin mois</span>
          <span className="font-bold" style={{ color:'#ef4444' }}>{fmtM(velocity.projected_eom_loss)} FCFA</span>
        </div>
        {velocity.alert && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
            className="mt-2 p-2.5 rounded-xl text-xs text-left" style={{ background:`${color}12`, border:`1px solid ${color}33`, color }}>
            ⚠️ {velocity.alert}
          </motion.div>
        )}
      </div>
    </div>
  );
}

function PredictionsTab() {
  const { filters } = useFilters();
  const params = new URLSearchParams();
  if (filters.bureau !== 'ALL') params.set('bureau', filters.bureau);
  if (filters.period !== 'ALL') params.set('period', filters.period);
  const qs = params.toString();

  const { data: baseData, loading: bLoading, error: bError, reload } = useApi(
    () => fetch(`/api/predictions${qs ? '?' + qs : ''}`).then(r => r.json()),
    [filters.bureau, filters.period]
  );
  const advQs = [
    filters.bureau && filters.bureau !== 'ALL' ? `bureau=${filters.bureau}` : '',
    filters.period && filters.period !== 'ALL' ? `period=${filters.period}` : '',
  ].filter(Boolean).join('&');
  const { data: advData } = useApi(() =>
    Promise.race([
      fetch(`/api/predictions/advanced${advQs ? '?' + advQs : ''}`).then(r => r.json()),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 8000))
    ])
  , [advQs]);

  if (bLoading) return <Loading rows={6}/>;
  if (bError) return <ErrorBox message={bError} onRetry={reload}/>;
  if (!baseData) return null;

  const { declaration_anomalies:anomalies, revenue_forecast:forecast, total_revenue_at_risk:atRisk, high_anomaly_count:highCount, forecast_shortfall:shortfall } = baseData;
  const { fraud_velocity } = advData ?? {};

  const forecastOption = {
    backgroundColor:'transparent',
    tooltip:{ trigger:'axis', backgroundColor:'rgba(15,23,42,0.95)', borderColor:'rgba(59,130,246,0.3)', textStyle:{color:'#f1f5f9'} },
    legend:{ data:['Réalisé','Prévision'], textStyle:{color:'#64748b'}, top:0 },
    grid:{ left:12, right:12, bottom:24, top:36, containLabel:true },
    xAxis:{ type:'category', data:forecast.map((f:Forecast)=>f.label), axisLabel:{color:'#475569',fontSize:11}, axisLine:{lineStyle:{color:'rgba(255,255,255,0.06)'}}, axisTick:{show:false} },
    yAxis:{ type:'value', axisLabel:{color:'#475569',fontSize:10,formatter:(v:number)=>v+'M'}, splitLine:{lineStyle:{color:'rgba(255,255,255,0.04)'}}, axisLine:{show:false} },
    series:[
      { name:'Réalisé', type:'line', data:forecast.map((f:Forecast)=>f.actual!==null?Math.round(f.actual/1e6):null), smooth:true, symbol:'circle', symbolSize:8, lineStyle:{color:'#10b981',width:2.5}, itemStyle:{color:'#10b981'}, areaStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'rgba(16,185,129,0.2)'},{offset:1,color:'rgba(16,185,129,0)'}]}} },
      { name:'Prévision', type:'line', data:forecast.map((f:Forecast)=>f.actual===null?Math.round(f.forecast/1e6):null), smooth:true, symbol:'diamond', symbolSize:8, lineStyle:{color:'#3b82f6',width:2,type:'dashed'}, itemStyle:{color:'#3b82f6'} },
    ],
  };

  const gaugeOption = fraud_velocity ? {
    backgroundColor:'transparent',
    series:[{ type:'gauge', startAngle:200, endAngle:-20, min:0, max:100, radius:'85%',
      progress:{ show:true, width:14, itemStyle:{color:{type:'linear',x:0,y:0,x2:1,y2:0,colorStops:[{offset:0,color:'#10b981'},{offset:0.5,color:'#f59e0b'},{offset:1,color:'#ef4444'}]}} },
      axisLine:{lineStyle:{width:14,color:[[1,'rgba(255,255,255,0.06)']]}},
      pointer:{length:'60%',width:5,itemStyle:{color:'#3b82f6'}},
      axisTick:{show:false}, splitLine:{show:false}, axisLabel:{show:false},
      detail:{valueAnimation:true,formatter:(v:number)=>`${Math.round(v)}%`,color:'#f1f5f9',fontSize:26,fontFamily:'JetBrains Mono',offsetCenter:[0,'30%']},
      title:{offsetCenter:[0,'58%'],color:'#64748b',fontSize:10},
      data:[{value:Math.round((highCount/Math.max(anomalies.length,1))*100),name:'% Décl. à risque'}],
    }],
  } : null;

  return (
    <div className="space-y-5">
      <StaggerGrid className="grid grid-cols-5 gap-2">
        <KPICard compact label="Anomalies" value={highCount} icon="🎯" color="danger"/>
        <KPICard compact label="Revenus à risque" value={Math.round(atRisk/1e6)} suffix=" M" icon="⚠️" color="gold"/>
        <KPICard compact label="Déficit prévu" value={shortfall>0?Math.round(shortfall/1e6):0} suffix={shortfall>0?" M":" FCFA"} icon="📉" color={shortfall>0?'danger':'success'}/>
        <KPICard compact label="Déclarations analysées" value={anomalies?.length ?? 0} icon="📋" color="teal"/>
        {fraud_velocity&&<KPICard compact label="Vélocité fraude" value={fraud_velocity.velocity_index} icon="⚡" color={fraud_velocity.status==='CRITICAL'?'danger':fraud_velocity.status==='WARNING'?'gold':'accent'}/>}
      </StaggerGrid>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <FadeIn delay={0.05} className="xl:col-span-2 w-full h-full">
          <div className="card w-full h-full">
            <SectionTitle icon="📈">Prévision Recettes — Horizon 3 Mois</SectionTitle>
            <ReactECharts option={forecastOption} style={{ height:240 }}/>
          </div>
        </FadeIn>
        <FadeIn delay={0.1} className="w-full">
          {fraud_velocity ? <VelocityGauge velocity={fraud_velocity}/> : (
            <div className="card">
              <SectionTitle icon="🎯">Indice de Risque Global</SectionTitle>
              {gaugeOption&&<ReactECharts option={gaugeOption} style={{ height:220,width:'100%' }}/>}
            </div>
          )}
        </FadeIn>
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
        {activeTab === 'fraud'       && <FraudDetectionTab />}
        {activeTab === 'recommend'   && <RecommendationsTab />}
        {activeTab === 'analytique'  && <AnalytiqueTab />}
        {activeTab === 'predictions' && <PredictionsTab />}
      </FadeIn>
    </div>
  );
}
