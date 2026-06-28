import React from 'react';
import ReactECharts from 'echarts-for-react';
import { motion } from 'framer-motion';
import { useApi } from '../hooks/useApi';
import { PageHeader } from '../App';
import { KPICard, SectionTitle, Loading, ErrorBox, Code, FadeIn, StaggerGrid, AnimatedNumber } from '../components/UI';
import { fmtM, fmt } from '../services/api';

type Forecast = { month: string; label: string; actual: number | null; forecast: number; lower_bound: number; upper_bound: number };
type Trajectory = { office_id: string; name: string; trend: string; momentum_score: number; period_revenues: number[]; forecast_next: number; alert: string | null };
type Anomaly = { sgd_id: string; importer_id: string; office_id: string; tariff_code: string; anomaly_score: number; risk_factors: string[]; predicted_fraud_prob: number; revenue_at_risk: number; recommended_action: string };

const TREND_META: Record<string, { icon: string; color: string; label: string }> = {
  RISING:    { icon: '📈', color: '#10b981', label: 'En hausse'  },
  STABLE:    { icon: '➡️', color: '#3b82f6', label: 'Stable'     },
  DECLINING: { icon: '📉', color: '#ef4444', label: 'En baisse'  },
};

export default function Predictions() {
  const { data, loading, error, reload } = useApi(() => fetch('/api/predictions').then(r => r.json()));
  if (loading) return <><PageHeader /><Loading rows={5} /></>;
  if (error)   return <><PageHeader /><ErrorBox message={error} onRetry={reload} /></>;
  if (!data) return null;

  const { declaration_anomalies: anomalies, revenue_forecast: forecast, bureau_trajectories: trajectories,
    total_revenue_at_risk: atRisk, high_anomaly_count: highCount, forecast_shortfall: shortfall } = data;

  // ECharts forecast option
  const labels  = forecast.map((f: Forecast) => f.label);
  const actuals  = forecast.map((f: Forecast) => f.actual !== null ? Math.round(f.actual / 1e6) : null);
  const fcast    = forecast.map((f: Forecast) => f.actual === null ? Math.round(f.forecast / 1e6) : null);
  const upper    = forecast.map((f: Forecast) => f.actual === null ? Math.round(f.upper_bound / 1e6) : null);
  const lower    = forecast.map((f: Forecast) => f.actual === null ? Math.round(f.lower_bound / 1e6) : null);

  const forecastOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(59,130,246,0.3)', textStyle: { color: '#f1f5f9' }, formatter: (params: { seriesName: string; value: number | null }[]) => params.filter(p => p.value !== null).map(p => `${p.seriesName}: <b>${p.value}M FCFA</b>`).join('<br/>') },
    legend: { data: ['Réalisé','Prévision','Borne haute','Borne basse'], textStyle: { color: '#64748b' }, top: 0 },
    grid: { left: 12, right: 12, bottom: 24, top: 40, containLabel: true },
    xAxis: { type: 'category', data: labels, axisLabel: { color: '#475569', fontSize: 11 }, axisLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } }, axisTick: { show: false } },
    yAxis: { type: 'value', axisLabel: { color: '#475569', fontSize: 10, formatter: (v: number) => v + 'M' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } }, axisLine: { show: false } },
    series: [
      { name: 'Réalisé', type: 'line', data: actuals, smooth: true, symbol: 'circle', symbolSize: 8, lineStyle: { color: '#10b981', width: 2.5 }, itemStyle: { color: '#10b981' }, areaStyle: { color: { type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'rgba(16,185,129,0.2)'},{offset:1,color:'rgba(16,185,129,0)'}] } } },
      { name: 'Prévision', type: 'line', data: fcast, smooth: true, symbol: 'diamond', symbolSize: 8, lineStyle: { color: '#3b82f6', width: 2, type: 'dashed' }, itemStyle: { color: '#3b82f6' } },
      { name: 'Borne haute', type: 'line', data: upper, smooth: true, lineStyle: { color: 'rgba(59,130,246,0.3)', type: 'dotted' }, symbol: 'none', itemStyle: { color: 'rgba(59,130,246,0)' }, stack: 'confidence', areaStyle: { color: 'rgba(59,130,246,0.08)' } },
      { name: 'Borne basse', type: 'line', data: lower, smooth: true, lineStyle: { color: 'rgba(59,130,246,0.3)', type: 'dotted' }, symbol: 'none', stack: 'confidence', itemStyle: { color: 'rgba(59,130,246,0)' } },
    ],
  };

  // Anomaly gauge chart
  const anomalyGaugeOption = {
    backgroundColor: 'transparent',
    series: [{
      type: 'gauge', startAngle: 200, endAngle: -20, min: 0, max: 100, radius: '85%',
      progress: { show: true, width: 14, itemStyle: { color: { type:'linear',x:0,y:0,x2:1,y2:0,colorStops:[{offset:0,color:'#10b981'},{offset:0.5,color:'#f59e0b'},{offset:1,color:'#ef4444'}] } } },
      axisLine: { lineStyle: { width: 14, color: [[1,'rgba(255,255,255,0.06)']] } },
      pointer: { icon: 'path://M2090.36389,615.30999 L2090.36389,615.30999 C2091.48372,615.30999 2092.40383,616.2301 2092.40383,617.34993 L2092.40383,652.2515 C2092.40383,653.37133 2091.48372,654.29144 2090.36389,654.29144 L2090.36389,654.29144 C2089.24406,654.29144 2088.32395,653.37133 2088.32395,652.2515 L2088.32395,617.34993 C2088.32395,616.2301 2089.24406,615.30999 2090.36389,615.30999 Z', length: '60%', width: 5, itemStyle: { color: '#3b82f6' } },
      axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
      detail: { valueAnimation: true, formatter: (v: number) => `${Math.round(v)}`, color: '#f1f5f9', fontSize: 28, fontFamily: 'JetBrains Mono', offsetCenter: [0, '30%'] },
      title: { offsetCenter: [0, '60%'], color: '#64748b', fontSize: 11 },
      data: [{ value: Math.round((highCount / Math.max(anomalies.length, 1)) * 100), name: '% Déclarations à risque' }],
    }],
  };

  const actionColor = (a: string) => a.includes('immédiate') ? '#ef4444' : a.includes('prioritaire') ? '#f59e0b' : '#3b82f6';

  return (
    <div className="space-y-5">
      <PageHeader />
      <StaggerGrid className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard label="Anomalies Détectées" value={highCount} icon="🎯" color="danger" />
        <KPICard label="Revenus à Risque" value={Math.round(atRisk / 1e6)} suffix=" M FCFA" icon="⚠️" color="gold" />
        <KPICard label="Déficit Prévisionnel" value={shortfall > 0 ? Math.round(shortfall / 1e6) : 0} suffix={shortfall > 0 ? ' M FCFA' : ''} sub={shortfall > 0 ? 'Prochain mois' : 'Trajectoire stable'} icon="📉" color={shortfall > 0 ? 'danger' : 'success'} />
        <KPICard label="Bureaux Déclinants" value={(trajectories as Trajectory[]).filter(t => t.trend === 'DECLINING').length} icon="🏛️" color="teal" />
      </StaggerGrid>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <FadeIn delay={0.1} className="xl:col-span-2">
          <div className="card">
            <SectionTitle icon="📈">Prévision des Recettes — Horizon 3 Mois</SectionTitle>
            <ReactECharts option={forecastOption} style={{ height: 260 }} />
          </div>
        </FadeIn>
        <FadeIn delay={0.2}>
          <div className="card flex flex-col items-center">
            <SectionTitle icon="🎯">Indice de Risque Global</SectionTitle>
            <ReactECharts option={anomalyGaugeOption} style={{ height: 220, width: '100%' }} />
            <div className="text-center mt-2">
              <div className="text-xs text-muted">{highCount} déclarations sur {anomalies.length} signalées</div>
            </div>
          </div>
        </FadeIn>
      </div>

      {/* Bureau trajectories */}
      <FadeIn delay={0.15}>
        <div className="card">
          <SectionTitle icon="🏛️">Trajectoire des Bureaux Douaniers</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {(trajectories as Trajectory[]).map((t, idx) => {
              const tm = TREND_META[t.trend] ?? TREND_META.STABLE;
              const maxRev = Math.max(...t.period_revenues, 1);
              const sparkOption = {
                backgroundColor: 'transparent',
                grid: { left: 0, right: 0, top: 0, bottom: 0 },
                xAxis: { type: 'category', show: false },
                yAxis: { type: 'value', show: false },
                series: [{ type: 'line', data: t.period_revenues, smooth: true, symbol: 'none', lineStyle: { color: tm.color, width: 2 }, areaStyle: { color: { type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:tm.color+'40'},{offset:1,color:'transparent'}] } } }],
              };
              return (
                <motion.div key={t.office_id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.08 }}
                  className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${tm.color}25` }}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-sm font-bold text-white leading-tight">{t.name}</div>
                      <div className="text-[10px] text-muted mt-0.5">{t.office_id}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl">{tm.icon}</div>
                      <div className="text-[10px] font-bold" style={{ color: tm.color }}>{tm.label}</div>
                      <div className="text-[9px] text-muted">{t.momentum_score > 0 ? '+' : ''}{t.momentum_score}%</div>
                    </div>
                  </div>
                  <ReactECharts option={sparkOption} style={{ height: 50 }} />
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-[10px] text-muted">Prévision:</span>
                    <span className="text-xs font-bold" style={{ color: tm.color }}>{fmtM(t.forecast_next)} FCFA</span>
                  </div>
                  {t.alert && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                      className="mt-2 text-[10px] px-2 py-1 rounded" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                      ⚠ {t.alert}
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </FadeIn>

      {/* Anomaly table */}
      <FadeIn delay={0.2}>
        <div className="card">
          <SectionTitle icon="🔬">Scoring Anomalies — Déclarations Prioritaires</SectionTitle>
          <table className="tbl">
            <thead><tr><th>SGD</th><th>Importateur</th><th>Tarif</th><th>Bureau</th><th>Score Anomalie</th><th>Prob. Fraude</th><th>Revenu à Risque</th><th>Action Recommandée</th></tr></thead>
            <tbody>
              {(anomalies as Anomaly[]).slice(0, 15).map((a, i) => (
                <motion.tr key={a.sgd_id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                  <td><Code>{a.sgd_id}</Code></td>
                  <td><span className="text-xs text-slate-300">{a.importer_id}</span></td>
                  <td><Code color="#22d3ee">{a.tariff_code}</Code></td>
                  <td><span className="text-xs text-muted">{a.office_id}</span></td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${a.anomaly_score}%` }} transition={{ delay: i * 0.04 + 0.3, duration: 0.6 }}
                          style={{ background: a.anomaly_score >= 70 ? '#ef4444' : a.anomaly_score >= 45 ? '#f59e0b' : '#3b82f6' }} />
                      </div>
                      <span className="text-xs font-bold number-ticker" style={{ color: a.anomaly_score >= 70 ? '#f87171' : a.anomaly_score >= 45 ? '#fbbf24' : '#60a5fa' }}>{a.anomaly_score}</span>
                    </div>
                  </td>
                  <td><span className="text-xs font-bold" style={{ color: a.predicted_fraud_prob >= 0.7 ? '#f87171' : '#fbbf24' }}>{Math.round(a.predicted_fraud_prob * 100)}%</span></td>
                  <td><span className="text-xs font-bold text-red-400">{fmtM(a.revenue_at_risk)} FCFA</span></td>
                  <td>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: actionColor(a.recommended_action) + '18', color: actionColor(a.recommended_action), border: `1px solid ${actionColor(a.recommended_action)}35` }}>
                      {a.recommended_action}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </FadeIn>
    </div>
  );
}
