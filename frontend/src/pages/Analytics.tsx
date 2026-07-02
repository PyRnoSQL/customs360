import React from 'react';
import ReactECharts from 'echarts-for-react';
import { motion } from 'framer-motion';
import { useApi } from '../hooks/useApi';
import { PageHeader } from '../App';
import { KPICard, SectionTitle, Loading, ErrorBox, FadeIn, StaggerGrid } from '../components/UI';
import { fmt, fmtM } from '../services/api';
import { useFilters } from '../context/FilterContext';

type Cohort = { label: string; count: number; color: string; avg_risk: number };
type TariffRisk = { tariff_code: string; total_declarations: number; fraud_cases: number; fraud_rate: number; avg_cif: number; risk_level: string };
type TemporalPattern = { day: string; total: number; fraud: number; rate: number };
type CountryAnalysis = { country: string; total: number; fraud: number; revenue: number; fraud_rate: number };

const RISK_LEVEL_COLOR: Record<string, string> = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#10b981' };

export default function Analytics() {
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
      type: 'pie', radius: ['50%', '78%'], center: ['50%', '50%'],
      data: filteredCohorts.map((c: Cohort) => ({ name: c.label, value: c.count, itemStyle: { color: c.color } })),
      label: { show: true, color: '#94a3b8', fontSize: 10, formatter: '{b}\n{c}' },
      emphasis: { itemStyle: { shadowBlur: 20, shadowColor: 'rgba(0,0,0,0.5)' } },
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
  }ort React from 'react';
import ReactECharts from 'echarts-for-react';
import { motion } from 'framer-motion';
import { useApi } from '../hooks/useApi';
import { PageHeader } from '../App';
import { KPICard, SectionTitle, Loading, ErrorBox, FadeIn, StaggerGrid } from '../components/UI';
import { fmt, fmtM } from '../services/api';
import { useFilters } from '../context/FilterContext';

type Cohort = { label: string; count: number; color: string; avg_risk: number };
type TariffRisk = { tariff_code: string; total_declarations: number; fraud_cases: number; fraud_rate: number; avg_cif: number; risk_level: string };
type TemporalPattern = { day: string; total: number; fraud: number; rate: number };
type CountryAnalysis = { country: string; total: number; fraud: number; revenue: number; fraud_rate: number };

const RISK_LEVEL_COLOR: Record<string, string> = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#10b981' };

export default function Analytics() {
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
      type: 'pie', radius: ['50%', '78%'], center: ['50%', '50%'],
      data: filteredCohorts.map((c: Cohort) => ({ name: c.label, value: c.count, itemStyle: { color: c.color } })),
      label: { show: true, color: '#94a3b8', fontSize: 10, formatter: '{b}\n{c}' },
      emphasis: { itemStyle: { shadowBlur: 20, shadowColor: 'rgba(0,0,0,0.5)' } },
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
      <PageHeader />

      <StaggerGrid className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard label="Opérateurs analysés" value={totalDecls} icon="🏢" color="accent" />
        <KPICard label="Codes tarifaires" value={fmt(tariff_matrix.length)} icon="🗂️" color="teal" />
        <KPICard label="Pays d'origine" value={fmt(country_analysis.length)} icon="🌍" color="gold" />
        <KPICard label="Jour pic fraude" value={DAY_FULL2[peakDay?.day] ?? peakDay?.day ?? '—'} icon="📅" color="danger" animate={false} />
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
