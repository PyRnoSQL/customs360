import React from 'react';
import ReactECharts from 'echarts-for-react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import { useApi } from '../hooks/useApi';
import { api, fmtM, fmt } from '../services/api';
import { KPICard, SectionTitle, Loading, ErrorBox, StatusBadge, FadeIn, StaggerGrid } from '../components/UI';
import { PageHeader } from '../App';
import { useFilters, applyPeriodFilter, applyBureauFilter } from '../context/FilterContext';

export default function Dashboard() {
  const { data, loading, error, reload } = useApi(api.overview);
  const { data: fraud } = useApi(api.fraud);
  const { filters } = useFilters();

  if (loading) return <><PageHeader /><Loading rows={4} /></>;
  if (error)   return <><PageHeader /><ErrorBox message={error} onRetry={reload} /></>;
  if (!data)   return null;

  // Apply filters
  const filteredRevenue = applyPeriodFilter(data.monthly_revenue, filters.period);
  const filteredOffices = applyBureauFilter(data.office_distribution, filters.bureau);
  const filteredCases   = fraud ? applyPeriodFilter(
    applyBureauFilter(fraud.cases, filters.bureau), filters.period
  ) : [];

  // Filtered KPIs
  const filteredSGD     = filters.bureau === 'ALL' ? data.total_sgd
    : (filteredOffices.find(o => o.office_id === filters.bureau)?.count ?? 0);
  const filteredRevTotal = filteredRevenue.reduce((s: number, m: { collected: number }) => s + m.collected, 0);
  const filteredFraud   = filteredCases.filter((f: { status: string }) => f.status === 'CLOTURE_AMIABLE' || f.status === 'CLOTURE_CONTENTIEUX' || f.status === 'TRANSMIS_JUSTICE').length;
  const filteredLoss    = fraud
    ? applyPeriodFilter(applyBureauFilter(fraud.cases, filters.bureau), filters.period)
        .reduce((s: number, f: { loss_net: number }) => s + f.loss_net, 0)
    : 0;

  const revenueOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: 'rgba(59,130,246,0.3)',
      textStyle: { color: '#f1f5f9' },
    },
    legend: { data: ['Prévisions','Collectées','Pertes'], textStyle: { color: '#64748b' }, top: 0 },
    grid: { left: 12, right: 12, bottom: 24, top: 40, containLabel: true },
    xAxis: {
      type: 'category',
      data: filteredRevenue.map((m: { label: string }) => m.label),
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
      axisLabel: { color: '#475569', fontSize: 11 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#475569', fontSize: 10, formatter: (v: number) => v + 'M' },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
      axisLine: { show: false },
    },
    series: [
      {
        name: 'Prévisions', type: 'bar',
        data: filteredRevenue.map((m: { expected: number }) => Math.round(m.expected / 1e6)),
        itemStyle: { color: 'rgba(59,130,246,0.35)', borderRadius: [4,4,0,0] }, barGap: '10%',
      },
      {
        name: 'Collectées', type: 'bar',
        data: filteredRevenue.map((m: { collected: number }) => Math.round(m.collected / 1e6)),
        itemStyle: { color: { type:'linear',x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:'rgba(16,185,129,0.9)'},{offset:1,color:'rgba(16,185,129,0.3)'}] }, borderRadius: [4,4,0,0] },
      },
      {
        name: 'Pertes', type: 'bar',
        data: filteredRevenue.map((m: { lost_fraud: number }) => Math.round(m.lost_fraud / 1e6)),
        itemStyle: { color: 'rgba(239,68,68,0.5)', borderRadius: [4,4,0,0] },
      },
    ],
  };

  const officeOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(59,130,246,0.3)', textStyle: { color: '#f1f5f9' }, formatter: '{b}: <b>{c}%</b>' },
    series: [{
      type: 'pie', radius: ['55%','80%'], center: ['50%','50%'],
      data: filteredOffices.map((o: { name?: string; office_id: string; pct: number }, i: number) => ({
        name: o.name ?? o.office_id, value: o.pct,
        itemStyle: { color: ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ef4444','#06b6d4'][i] },
      })),
      label: { show: true, color: '#94a3b8', fontSize: 10, formatter: '{b}\n{c}%' },
      emphasis: { itemStyle: { shadowBlur: 20, shadowColor: 'rgba(59,130,246,0.4)' } },
    }],
  };

  // Recharts radar: two layers — actual fraud counts + avg benchmark
  const radarData = fraud ? (() => {
    const types = Object.entries(fraud.by_type as Record<string,number>).slice(0, 6);
    const maxVal = Math.max(...types.map(([,v]) => v), 1);
    const avg = Math.round(types.reduce((s,[,v]) => s + v, 0) / Math.max(types.length, 1));
    const avgPct = Math.round((avg / maxVal) * 100);
    return types.map(([k, v]) => ({
      subject: k.replace('Sous-évaluation','Sous-éval.').replace('classification','class.').slice(0, 14),
      score:     Math.round((v / maxVal) * 100),
      benchmark: avgPct,
    }));
  })() : null;

  return (
    <div className="space-y-5">
      <PageHeader />
      <StaggerGrid className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        <KPICard label="SGDs" value={filteredSGD} icon="📋" color="accent" />
        <KPICard label="Recettes" value={Math.round(filteredRevTotal / 1e9 * 10) / 10} suffix=" Mrd" icon="💰" color="success" />
        <KPICard label="Fraudes confirmées" value={filteredFraud} icon="🚨" color="danger" />
        <KPICard label="Pertes estimées" value={Math.round(filteredLoss / 1e6)} suffix=" M FCFA" icon="⚠️" color="gold" />
      </StaggerGrid>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 w-full">
        <FadeIn delay={0.1} className="xl:col-span-2 w-full">
          <div className="card w-full">
            <SectionTitle icon="📈">Recettes Mensuelles {filters.period !== 'ALL' ? `— ${filters.period}` : ''}</SectionTitle>
            {filteredRevenue.length > 0
              ? <ReactECharts option={revenueOption} style={{ height: 240 }} />
              : <div className="h-60 flex items-center justify-center text-muted text-sm">Aucune donnée pour cette période</div>}
          </div>
        </FadeIn>
        <FadeIn delay={0.2} className="w-full">
          <div className="card w-full">
            <SectionTitle icon="🗺️">Distribution {filters.bureau !== 'ALL' ? `— ${filters.bureau}` : 'par Bureau'}</SectionTitle>
            <ReactECharts option={officeOption} style={{ height: 240 }} />
          </div>
        </FadeIn>
      </div>

      {fraud && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 w-full">
          <FadeIn delay={0.1} className="xl:col-span-2 w-full">
            <div className="card w-full">
              <SectionTitle icon="🚨">
                Cas de Fraude
                {filters.bureau !== 'ALL' && <span className="ml-2 text-xs text-muted font-normal">· {filters.bureau}</span>}
                {filters.period !== 'ALL' && <span className="ml-1 text-xs text-muted font-normal">· {filters.period}</span>}
              </SectionTitle>
              {filteredCases.length === 0
                ? <div className="py-8 text-center text-muted text-sm">Aucun cas pour les filtres sélectionnés</div>
                : (
                  <table className="tbl">
                    <thead><tr><th>Cas</th><th>SGD</th><th>Type</th><th>Perte</th><th>IA %</th><th>Statut</th></tr></thead>
                    <tbody>
                      {filteredCases.slice(0, 8).map((f: { case_id: string; sgd_id: string; fraud_type: string; loss_net: number; ai_risk_score: number; status: string }, i: number) => (
                        <motion.tr key={f.case_id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                          <td><code style={{ color: '#22d3ee', fontSize: 11 }}>{f.case_id}</code></td>
                          <td><code style={{ color: '#60a5fa', fontSize: 11 }}>{f.sgd_id}</code></td>
                          <td><span className="text-xs text-slate-400">{f.fraud_type}</span></td>
                          <td><span className="text-xs font-bold text-red-400">{fmtM(f.loss_net)}</span></td>
                          <td>
                            <div className="flex items-center gap-1.5">
                              <div className="h-1 w-10 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                                <div className="h-full rounded-full" style={{ width: `${f.ai_risk_score}%`, background: f.ai_risk_score >= 80 ? '#ef4444' : '#f59e0b' }} />
                              </div>
                              <span className="text-xs font-bold" style={{ color: f.ai_risk_score >= 80 ? '#f87171' : '#fbbf24' }}>{f.ai_risk_score}%</span>
                            </div>
                          </td>
                          <td><StatusBadge status={f.status} /></td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </div>
          </FadeIn>
          {radarData && (
            <FadeIn delay={0.2} className="w-full">
              <div className="card w-full">
                <SectionTitle icon="🎯">Répartition des Types de Fraude</SectionTitle>
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={radarData} margin={{ top:10, right:28, left:28, bottom:10 }}>
                    <PolarGrid stroke="#1e3a5f" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill:'#94a3b8', fontSize:9, fontWeight:600 }} />
                    <PolarRadiusAxis domain={[0,100]} tick={{ fill:'#475569', fontSize:8 }} tickCount={4} />
                    <Radar name="Moyenne" dataKey="benchmark"
                      stroke="#334155" fill="#334155" fillOpacity={0.15}
                      strokeWidth={1} strokeDasharray="4 2"
                      isAnimationActive animationDuration={800} animationEasing="ease-out" />
                    <Radar name="Cas Fraude" dataKey="score"
                      stroke="#ef4444" fill="#ef4444" fillOpacity={0.25}
                      strokeWidth={2} dot={{ fill:'#ef4444', r:4, strokeWidth:0 }}
                      isAnimationActive animationBegin={300} animationDuration={1200} animationEasing="ease-out" />
                    <Tooltip contentStyle={{ background:'rgba(15,23,42,0.95)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:8, color:'#f1f5f9', fontSize:12 }}
                      formatter={(v:number, name:string) => [`${v}%`, name]} />
                  </RadarChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-5 mt-1">
                  <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="w-4 h-0.5 rounded" style={{ background:'#ef4444' }}/>Cas Fraude
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="w-4 h-0.5 rounded" style={{ background:'#334155', borderTop:'1px dashed #334155' }}/>Moyenne
                  </span>
                </div>
              </div>
            </FadeIn>
          )}
        </div>
      )}
    </div>
  );
}
