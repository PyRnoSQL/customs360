import React, { useRef, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { motion } from 'framer-motion';
import { useApi } from '../hooks/useApi';
import { api, fmtM, fmt } from '../services/api';
import { KPICard, SectionTitle, Loading, ErrorBox, StatusBadge, FadeIn, StaggerGrid, AnimatedNumber } from '../components/UI';
import { PageHeader } from '../App';

const ECHART_THEME = {
  backgroundColor: 'transparent',
  textStyle: { color: '#64748b', fontFamily: 'Inter, sans-serif' },
};

export default function Dashboard() {
  const { data, loading, error, reload } = useApi(api.overview);
  const { data: fraud } = useApi(api.fraud);

  if (loading) return <><PageHeader /><Loading rows={4} /></>;
  if (error)   return <><PageHeader /><ErrorBox message={error} onRetry={reload} /></>;
  if (!data)   return null;

  const revenueOption = {
    ...ECHART_THEME,
    tooltip: {
      trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: 'rgba(59,130,246,0.3)', textStyle: { color: '#f1f5f9' },
      formatter: (params: { seriesName: string; value: number }[]) =>
        params.map(p => `${p.seriesName}: <b>${fmtM(p.value * 1e6)} FCFA</b>`).join('<br/>'),
    },
    legend: { data: ['Prévisions','Collectées','Pertes fraude'], textStyle: { color: '#64748b' }, top: 0 },
    grid: { left: 12, right: 12, bottom: 24, top: 40, containLabel: true },
    xAxis: { type: 'category', data: data.monthly_revenue.map((m: { label: string }) => m.label), axisLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } }, axisLabel: { color: '#475569', fontSize: 11 }, axisTick: { show: false } },
    yAxis: { type: 'value', axisLabel: { color: '#475569', fontSize: 10, formatter: (v: number) => v + 'M' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } }, axisLine: { show: false } },
    series: [
      { name: 'Prévisions', type: 'bar', data: data.monthly_revenue.map((m: { expected: number }) => Math.round(m.expected / 1e6)), itemStyle: { color: 'rgba(59,130,246,0.35)', borderRadius: [4,4,0,0] }, barGap: '10%' },
      { name: 'Collectées', type: 'bar', data: data.monthly_revenue.map((m: { collected: number }) => Math.round(m.collected / 1e6)), itemStyle: { color: { type:'linear', x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:'rgba(16,185,129,0.9)'},{offset:1,color:'rgba(16,185,129,0.3)'}] }, borderRadius: [4,4,0,0] } },
      { name: 'Pertes fraude', type: 'bar', data: data.monthly_revenue.map((m: { lost_fraud: number }) => Math.round(m.lost_fraud / 1e6)), itemStyle: { color: 'rgba(239,68,68,0.5)', borderRadius: [4,4,0,0] } },
    ],
  };

  const officeOption = {
    ...ECHART_THEME,
    tooltip: { trigger: 'item', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(59,130,246,0.3)', textStyle: { color: '#f1f5f9' }, formatter: '{b}: <b>{c}%</b>' },
    series: [{
      type: 'pie', radius: ['55%', '80%'], center: ['50%', '50%'],
      data: data.office_distribution.map((o: { name: string; pct: number }, i: number) => ({
        name: o.name ?? o.office_id,
        value: o.pct,
        itemStyle: { color: ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ef4444','#06b6d4'][i] },
      })),
      label: { show: true, color: '#94a3b8', fontSize: 10, formatter: '{b}\n{c}%' },
      emphasis: { itemStyle: { shadowBlur: 20, shadowColor: 'rgba(59,130,246,0.4)' } },
    }],
  };

  const radarOption = fraud ? {
    ...ECHART_THEME,
    tooltip: { backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(59,130,246,0.3)', textStyle: { color: '#f1f5f9' } },
    radar: {
      indicator: [
        { name: 'Sous-évaluation', max: 100 }, { name: 'Fausse class.', max: 100 },
        { name: 'Marchandises\nfantômes', max: 100 }, { name: 'Faux docs', max: 100 },
        { name: 'Collusion', max: 100 },
      ],
      splitArea: { areaStyle: { color: ['rgba(59,130,246,0.02)','rgba(59,130,246,0.04)'] } },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
      axisName: { color: '#64748b', fontSize: 10 },
    },
    series: [{
      type: 'radar',
      data: [{
        value: Object.values(fraud.by_type as Record<string,number>).slice(0, 5).map((v: number) => Math.min(100, (v / Math.max(...Object.values(fraud.by_type as Record<string,number>), 1)) * 100)),
        name: 'Fraudes',
        areaStyle: { color: 'rgba(239,68,68,0.15)' },
        lineStyle: { color: '#ef4444', width: 2 },
        itemStyle: { color: '#ef4444' },
      }],
    }],
  } : null;

  return (
    <div className="space-y-5">
      <PageHeader />

      {/* KPI grid */}
      <StaggerGrid className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KPICard label="Total SGDs" value={data.total_sgd} icon="📋" color="accent" />
        <KPICard label="Recettes" value={Math.round(data.total_revenue / 1e9 * 10) / 10} suffix=" Mrd" icon="💰" color="success" />
        <KPICard label="Fraudes" value={data.fraud_confirmed} icon="🚨" color="danger" />
        <KPICard label="Pertes" value={Math.round(data.revenue_loss / 1e6)} suffix=" M FCFA" icon="⚠️" color="gold" />
        <KPICard label="Haut Risque" value={data.high_risk_importers} icon="🎯" color="teal" />
        <KPICard label="Délai moy." value={data.avg_clearance_hours} suffix="h" icon="⏱️" color="purple" />
      </StaggerGrid>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <FadeIn delay={0.2} className="xl:col-span-2">
          <div className="card">
            <SectionTitle icon="📈">Analyse des Recettes Mensuelles</SectionTitle>
            <ReactECharts option={revenueOption} style={{ height: 240 }} />
          </div>
        </FadeIn>
        <FadeIn delay={0.3}>
          <div className="card">
            <SectionTitle icon="🗺️">Distribution par Bureau</SectionTitle>
            <ReactECharts option={officeOption} style={{ height: 240 }} />
          </div>
        </FadeIn>
      </div>

      {/* Fraud + radar */}
      {fraud && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <FadeIn delay={0.1}>
            <div className="card">
              <SectionTitle icon="🚨">Derniers Cas de Fraude</SectionTitle>
              <table className="tbl">
                <thead><tr><th>Cas</th><th>SGD</th><th>Type</th><th>Perte</th><th>IA %</th><th>Statut</th></tr></thead>
                <tbody>
                  {fraud.cases.slice(0, 8).map((f: { case_id: string; sgd_id: string; fraud_type: string; loss_amount: number; ai_probability: number; status: string }, i: number) => (
                    <motion.tr key={f.case_id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                      <td><code style={{ color: '#22d3ee', fontSize: 11 }}>{f.case_id}</code></td>
                      <td><code style={{ color: '#60a5fa', fontSize: 11 }}>{f.sgd_id}</code></td>
                      <td><span className="text-xs text-slate-400">{f.fraud_type}</span></td>
                      <td><span className="text-xs font-bold text-red-400">{fmtM(f.loss_amount)}</span></td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <div className="h-1 w-10 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <div className="h-full rounded-full" style={{ width: `${f.ai_probability}%`, background: f.ai_probability >= 80 ? '#ef4444' : '#f59e0b' }} />
                          </div>
                          <span className="text-xs font-bold" style={{ color: f.ai_probability >= 80 ? '#f87171' : '#fbbf24' }}>{f.ai_probability}%</span>
                        </div>
                      </td>
                      <td><StatusBadge status={f.status} /></td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FadeIn>
          {radarOption && (
            <FadeIn delay={0.2}>
              <div className="card">
                <SectionTitle icon="🎯">Répartition des Types de Fraude</SectionTitle>
                <ReactECharts option={radarOption} style={{ height: 280 }} />
              </div>
            </FadeIn>
          )}
        </div>
      )}
    </div>
  );
}
