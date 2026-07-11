import React from 'react';
import ReactECharts from 'echarts-for-react';
import { motion } from 'framer-motion';
import { useApi } from '../hooks/useApi';
import { api, fmtM, fmt } from '../services/api';
import { KPICard, SectionTitle, Loading, ErrorBox, FadeIn, StaggerGrid, AnimatedNumber, StatusBadge } from '../components/UI';
import { PageHeader } from '../App';
import { useFilters, applyPeriodFilter, applyBureauFilter } from '../context/FilterContext';

// ── helpers ───────────────────────────────────────────────────────────────────
const riskColor = (r: number) => r >= 70 ? '#ef4444' : r >= 40 ? '#f59e0b' : '#10b981';
const eff_color = (e: number) => e >= 75 ? '#10b981' : e >= 55 ? '#f59e0b' : '#ef4444';
const CHANNEL_COLORS: Record<string,string> = { VERT:'#10b981', JAUNE:'#f59e0b', ROUGE:'#ef4444' };
const OFF_COLORS = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ef4444','#06b6d4','#f97316','#a78bfa'];
const CHART_TT = { backgroundColor:'rgba(15,23,42,0.95)', borderColor:'rgba(59,130,246,0.3)', borderWidth:1, textStyle:{color:'#f1f5f9',fontSize:12} };

export default function Dashboard() {
  const { data, loading, error, reload } = useApi(api.overview);
  const { data: fraud } = useApi(api.fraud);
  const { filters } = useFilters();

  if (loading) return <><PageHeader /><Loading rows={4} /></>;
  if (error)   return <><PageHeader /><ErrorBox message={error} onRetry={reload} /></>;
  if (!data)   return null;

  // Apply filters
  const filteredRevenue = applyPeriodFilter(data.monthly_revenue ?? [], filters.period);
  const filteredOffices = filters.bureau === 'ALL'
    ? (data.office_distribution ?? [])
    : (data.office_distribution ?? []).filter((o: {office_id:string}) => o.office_id === filters.bureau);
  const filteredCases = fraud
    ? applyPeriodFilter(applyBureauFilter(fraud.cases ?? [], filters.bureau), filters.period)
    : [];
  const filteredTrend = applyPeriodFilter(data.fraud_trend ?? [], filters.period);

  // KPI derivations from filtered data
  const filteredRevTotal  = filteredRevenue.reduce((s: number, m: {collected:number}) => s + m.collected, 0);
  const filteredFraudConf = filteredCases.filter((f: {status:string}) =>
    ['CLOTURE_AMIABLE','CLOTURE_CONTENTIEUX','TRANSMIS_JUSTICE'].includes(f.status)).length;
  const filteredLoss = filteredCases.reduce((s: number, f: {loss_net:number}) => s + (f.loss_net ?? 0), 0);
  const filteredEvasion = filteredCases.reduce((s: number, f: {tax_evasion_amount?:number}) => s + (f.tax_evasion_amount ?? 0), 0);
  const filteredPenalties = filteredCases.reduce((s: number, f: {penalty_amount?:number}) => s + (f.penalty_amount ?? 0), 0);
  const filteredRecovered = filteredCases.reduce((s: number, f: {amount_recovered?:number}) => s + (f.amount_recovered ?? 0), 0);
  const filteredRecoveryRate = (filteredEvasion + filteredPenalties) > 0
    ? Math.round(filteredRecovered / (filteredEvasion + filteredPenalties) * 100) : 0;

  // ── Chart options ─────────────────────────────────────────────────────────

  // 1. Revenue vs Assessed vs Evasion bars
  const revenueOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger:'axis', ...CHART_TT, axisPointer:{type:'shadow'},
      formatter: (p: {seriesName:string;value:number;marker:string}[]) =>
        `<span style="color:#f1f5f9">${p.map(s=>`${s.marker} ${s.seriesName}: <b>${s.value}M FCFA</b>`).join('<br/>')}</span>` },
    legend: { data:['Taxes évaluées','Recettes collectées','Évasion détectée'], textStyle:{color:'#64748b',fontSize:10}, top:0, itemWidth:10, itemHeight:10 },
    grid: { left:8, right:8, bottom:24, top:36, containLabel:true },
    xAxis: { type:'category', data:filteredRevenue.map((m:{label:string})=>m.label), axisLine:{lineStyle:{color:'rgba(255,255,255,0.06)'}}, axisLabel:{color:'#475569',fontSize:10}, axisTick:{show:false} },
    yAxis: { type:'value', axisLabel:{color:'#475569',fontSize:9,formatter:(v:number)=>`${v}M`}, splitLine:{lineStyle:{color:'rgba(255,255,255,0.04)'}}, axisLine:{show:false} },
    series: [
      { name:'Taxes évaluées', type:'bar', data:filteredRevenue.map((m:{expected:number})=>Math.round(m.expected/1e6)), itemStyle:{color:'rgba(59,130,246,0.35)',borderRadius:[3,3,0,0]}, barGap:'5%' },
      { name:'Recettes collectées', type:'bar', data:filteredRevenue.map((m:{collected:number})=>Math.round(m.collected/1e6)), itemStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'rgba(16,185,129,0.9)'},{offset:1,color:'rgba(16,185,129,0.4)'}]},borderRadius:[3,3,0,0]} },
      { name:'Évasion détectée', type:'bar', data:filteredRevenue.map((m:{lost_fraud:number})=>Math.round(m.lost_fraud/1e6)), itemStyle:{color:'rgba(239,68,68,0.65)',borderRadius:[3,3,0,0]} },
    ],
  };

  // 2. Recovery waterfall (horizontal stacked bar)
  const waterfallOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger:'item', ...CHART_TT, formatter:(p:{name:string;value:number})=>`<span style="color:#f1f5f9"><b>${p.name}</b><br/>${fmtM(p.value)} FCFA</span>` },
    grid: { left:120, right:16, top:8, bottom:8, containLabel:false },
    xAxis: { type:'value', show:false },
    yAxis: { type:'category', inverse:true, data:['Évasion fiscale','Pénalités levées','Montant récupéré','Perte nette'], axisLabel:{color:'#94a3b8',fontSize:11}, axisLine:{show:false}, axisTick:{show:false} },
    series: [{
      type:'bar', barWidth:20,
      data:[
        {value:filteredEvasion||data.tax_evasion_total, itemStyle:{color:'rgba(239,68,68,0.7)',borderRadius:[0,4,4,0]}},
        {value:filteredPenalties||data.penalties_raised, itemStyle:{color:'rgba(249,115,22,0.7)',borderRadius:[0,4,4,0]}},
        {value:filteredRecovered||data.amount_recovered, itemStyle:{color:'rgba(16,185,129,0.8)',borderRadius:[0,4,4,0]}},
        {value:filteredLoss||data.net_loss, itemStyle:{color:'rgba(239,68,68,0.4)',borderRadius:[0,4,4,0]}},
      ],
      label:{show:true,position:'right',color:'#94a3b8',fontSize:10,formatter:(p:{value:number})=>`${fmtM(p.value)}M`},
    }],
  };

  // 3. Fraud trend line + bars (dual axis)
  const trendData = filteredTrend.length > 0 ? filteredTrend : data.fraud_trend ?? [];
  const fraudTrendOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger:'axis', ...CHART_TT, axisPointer:{type:'shadow'},
      formatter:(p:{seriesName:string;value:number;marker:string;axisValueLabel?:string}[])=>`<span style="color:#f1f5f9"><b>${p[0]?.axisValueLabel??''}</b><br/>${p.map(s=>`${s.marker} ${s.seriesName}: <b>${s.value}${s.seriesName.includes('Taux')?'%':''}</b>`).join('<br/>')}</span>` },
    legend: { textStyle:{color:'#64748b',fontSize:10}, top:0, right:0, itemWidth:10, itemHeight:10 },
    grid: { left:8, right:50, bottom:24, top:28, containLabel:true },
    xAxis: { type:'category', data:trendData.map((m:{label:string})=>m.label), axisLabel:{color:'#475569',fontSize:9,rotate:30}, axisLine:{lineStyle:{color:'rgba(255,255,255,0.06)'}}, axisTick:{show:false} },
    yAxis: [
      { type:'value', name:'Cas', nameTextStyle:{color:'#475569',fontSize:9}, axisLabel:{color:'#475569',fontSize:9}, splitLine:{lineStyle:{color:'rgba(255,255,255,0.04)'}}, axisLine:{show:false} },
      { type:'value', name:'Taux%', nameTextStyle:{color:'#f59e0b',fontSize:9}, position:'right', axisLabel:{color:'#f59e0b',fontSize:9,formatter:(v:number)=>`${v}%`}, splitLine:{show:false}, axisLine:{show:false} },
    ],
    series: [
      { name:'Cas fraude', type:'bar', yAxisIndex:0, data:trendData.map((m:{count:number})=>m.count), itemStyle:{color:'rgba(239,68,68,0.6)',borderRadius:[2,2,0,0]}, barMaxWidth:18,
        label:{show:true,position:'top',color:'#f87171',fontSize:9,formatter:(p:{value:number})=>p.value>0?String(p.value):''} },
      { name:'Taux fraude', type:'line', yAxisIndex:1, data:trendData.map((m:{rate:number})=>Math.round(m.rate*1000)/10), smooth:true, lineStyle:{color:'#f59e0b',width:2}, itemStyle:{color:'#f59e0b'}, symbol:'circle', symbolSize:4 },
    ],
  };

  // 4. Case status pipeline (donut)
  const statusDist = data.case_status_dist ?? [];
  const STATUS_COLORS: Record<string,string> = { 'En cours':'#3b82f6','Clôturé amiable':'#10b981','Contentieux':'#f59e0b','Justice':'#ef4444','Abandonné':'#64748b' };
  const pipelineOption = {
    backgroundColor:'transparent',
    tooltip:{trigger:'item',...CHART_TT,formatter:(p:{name:string;value:number;percent:string})=>`<span style="color:#f1f5f9"><b>${p.name}</b><br/>Dossiers: <b>${p.value}</b> (${p.percent}%)</span>`},
    series:[{
      type:'pie', radius:['42%','65%'], center:['50%','45%'],
      label:{show:true,position:'outside',color:'#94a3b8',fontSize:10,formatter:(p:{name:string;value:number})=>`${p.name}\n${p.value}`},
      labelLine:{show:true,length:8,length2:6,lineStyle:{color:'rgba(148,163,184,0.4)'}},
      legend:{bottom:0,left:'center',orient:'horizontal',textStyle:{color:'#94a3b8',fontSize:9}},
      emphasis:{scale:true,scaleSize:5},
      data:statusDist.map((s:{status:string;count:number})=>({
        name:s.status, value:s.count,
        itemStyle:{color:STATUS_COLORS[s.status]??'#64748b',borderRadius:3,borderWidth:2,borderColor:'rgba(15,23,42,0.9)'},
      })),
    }],
  };

  // 5. Channel distribution (horizontal bars)
  const channelDist = data.channel_distribution ?? [];
  const channelOption = {
    backgroundColor:'transparent',
    tooltip:{trigger:'item',...CHART_TT,formatter:(p:{name:string;value:number})=>`<span style="color:#f1f5f9"><b>${p.name}</b><br/>${fmt(p.value)} SGDs</span>`},
    grid:{left:60,right:50,top:8,bottom:8,containLabel:false},
    xAxis:{type:'value',show:false},
    yAxis:{type:'category',data:channelDist.map((c:{channel:string})=>c.channel),axisLabel:{color:'#94a3b8',fontSize:12,fontWeight:'bold'},axisLine:{show:false},axisTick:{show:false}},
    series:[{
      type:'bar',barWidth:22,
      data:channelDist.map((c:{channel:string;count:number})=>({value:c.count,itemStyle:{color:CHANNEL_COLORS[c.channel]??'#64748b',borderRadius:[0,4,4,0]}})),
      label:{show:true,position:'right',color:'#94a3b8',fontSize:10,formatter:(p:{value:number})=>`${fmt(p.value)}`},
    }],
  };

  // 6. Office league table bars
  const sortedOffices = [...(data.office_distribution??[])].sort((a:{revenue:number},b:{revenue:number})=>b.revenue-a.revenue);
  const officeBarOption = {
    backgroundColor:'transparent',
    tooltip:{trigger:'axis',...CHART_TT,axisPointer:{type:'shadow'},
      formatter:(p:{seriesName:string;value:number;marker:string}[])=>`<span style="color:#f1f5f9">${p.map(s=>`${s.marker} ${s.seriesName}: <b>${s.seriesName.includes('Fraude')?s.value+'%':fmtM(s.value)+'M FCFA'}</b>`).join('<br/>')}</span>`},
    legend:{textStyle:{color:'#64748b',fontSize:9},top:0,right:0,itemWidth:8,itemHeight:8},
    grid:{left:8,right:50,bottom:20,top:28,containLabel:true},
    xAxis:{type:'category',data:sortedOffices.map((o:{name:string})=>o.name.split(' ')[0]),axisLabel:{color:'#475569',fontSize:9},axisLine:{lineStyle:{color:'rgba(255,255,255,0.06)'}},axisTick:{show:false}},
    yAxis:[
      {type:'value',axisLabel:{color:'#475569',fontSize:9,formatter:(v:number)=>`${v}M`},splitLine:{lineStyle:{color:'rgba(255,255,255,0.04)'}},axisLine:{show:false}},
      {type:'value',position:'right',axisLabel:{color:'#f87171',fontSize:9,formatter:(v:number)=>`${v}%`},splitLine:{show:false},axisLine:{show:false}},
    ],
    series:[
      {name:'Recettes',type:'bar',yAxisIndex:0,data:sortedOffices.map((o:{revenue:number})=>Math.round(o.revenue/1e6)),itemStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'rgba(59,130,246,0.8)'},{offset:1,color:'rgba(59,130,246,0.3)'}]},borderRadius:[3,3,0,0]},barMaxWidth:28},
      {name:'Taux fraude',type:'line',yAxisIndex:1,data:sortedOffices.map((o:{fraud_rate:number})=>Math.round(o.fraud_rate*1000)/10),lineStyle:{color:'#ef4444',width:2},itemStyle:{color:'#ef4444'},symbol:'circle',symbolSize:5},
    ],
  };

  const topInspectors = data.top_inspectors ?? [];
  const alertFeed = [
    { label:'Dossiers EN_COURS', value:data.cases_open, color:'#3b82f6', icon:'📂', urgent: data.cases_open > 50 },
    { label:'Suspicion collusion', value:data.collusion_suspected, color:'#a78bfa', icon:'🕵️', urgent: data.collusion_suspected > 100 },
    { label:'Décl. en retard (>1.5×)', value:data.clearance_overdue_count, color:'#f59e0b', icon:'⏱️', urgent: (data.clearance_overdue_pct??0) > 10 },
    { label:'Transmis à la justice', value:data.cases_justice, color:'#ef4444', icon:'⚖️', urgent: data.cases_justice > 30 },
  ];

  return (
    <div className="space-y-5">
      <PageHeader />

      {/* ── ROW 0: 8 Headline KPIs ── */}
      <StaggerGrid className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <KPICard label="SGDs traités" value={fmt(filters.bureau==='ALL'?data.total_sgd:(filteredOffices[0]?.count??0))} icon="📋" color="accent"/>
        <KPICard label="Recettes" value={`${Math.round(filteredRevTotal/1e9*10)/10} Mrd`} icon="💰" color="success"/>
        <KPICard label="Évasion détectée" value={`${fmtM(filteredEvasion||data.tax_evasion_total)}M`} icon="🚨" color="danger"/>
        <KPICard label="Pénalités levées" value={`${fmtM(filteredPenalties||data.penalties_raised)}M`} icon="⚖️" color="gold"/>
        <KPICard label="Montant récupéré" value={`${fmtM(filteredRecovered||data.amount_recovered)}M`} icon="💚" color="success"/>
        <KPICard label="Perte nette" value={`${fmtM(filteredLoss||data.net_loss)}M`} icon="📉" color="danger"/>
        <KPICard label="Taux recouvrement" value={`${filteredRecoveryRate||Math.round((data.recovery_rate??0)*100)}%`} icon="🔄" color={filteredRecoveryRate>60?'success':filteredRecoveryRate>40?'gold':'danger'}/>
        <KPICard label="Fraudes confirmées" value={filteredFraudConf||data.fraud_confirmed} icon="🎯" color="teal"/>
      </StaggerGrid>

      {/* ── ROW 1: Revenue trend + Recovery waterfall ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <FadeIn delay={0.05} className="xl:col-span-2">
          <div className="card">
            <SectionTitle icon="📈">Recettes Mensuelles — Taxes Évaluées vs Collectées vs Évasion</SectionTitle>
            {filteredRevenue.length > 0
              ? <ReactECharts option={revenueOption} style={{height:240}}/>
              : <div className="h-60 flex items-center justify-center text-muted text-sm">Aucune donnée pour cette période</div>}
          </div>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div className="card h-full">
            <SectionTitle icon="💧">Cycle de Recouvrement Fraude</SectionTitle>
            <div className="flex items-center justify-between mb-3">
              <div className="text-center">
                <div className="text-2xl font-black" style={{color: filteredRecoveryRate>60?'#10b981':filteredRecoveryRate>40?'#f59e0b':'#ef4444'}}>
                  {filteredRecoveryRate||Math.round((data.recovery_rate??0)*100)}%
                </div>
                <div className="text-[10px] text-muted">Taux de recouvrement</div>
              </div>
              <div className="h-1.5 flex-1 mx-4 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.06)'}}>
                <div className="h-full rounded-full" style={{width:`${filteredRecoveryRate||Math.round((data.recovery_rate??0)*100)}%`,background:filteredRecoveryRate>60?'#10b981':'#f59e0b'}}/>
              </div>
            </div>
            <ReactECharts option={waterfallOption} style={{height:160}}/>
          </div>
        </FadeIn>
      </div>

      {/* ── ROW 2: Fraud trend + Case pipeline + Channel ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <FadeIn delay={0.05} className="xl:col-span-1">
          <div className="card h-full">
            <SectionTitle icon="📡">Tendance Fraude Mensuelle</SectionTitle>
            {trendData.length > 0
              ? <ReactECharts option={fraudTrendOption} style={{height:220}}/>
              : <div className="h-56 flex items-center justify-center text-muted text-sm">Aucune donnée</div>}
          </div>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div className="card h-full">
            <SectionTitle icon="⚖️">Pipeline des Dossiers Fraude</SectionTitle>
            {statusDist.length > 0
              ? <ReactECharts option={pipelineOption} style={{height:240}}/>
              : <div className="h-60 flex items-center justify-center text-muted text-sm">Aucune donnée</div>}
          </div>
        </FadeIn>
        <FadeIn delay={0.15}>
          <div className="card h-full">
            <SectionTitle icon="🚦">Canaux de Contrôle Douanier</SectionTitle>
            <ReactECharts option={channelOption} style={{height:120}}/>
            <div className="mt-4 space-y-2">
              {channelDist.map((c:{channel:string;count:number;pct:number}) => (
                <div key={c.channel} className="flex items-center gap-3">
                  <span className="text-xs font-bold w-14" style={{color:CHANNEL_COLORS[c.channel]??'#fff'}}>{c.channel}</span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.06)'}}>
                    <div className="h-full rounded-full" style={{width:`${c.pct}%`,background:CHANNEL_COLORS[c.channel]??'#64748b'}}/>
                  </div>
                  <span className="text-xs font-bold text-white w-8 text-right">{c.pct}%</span>
                </div>
              ))}
              <p className="text-[10px] text-muted mt-2 pt-2 border-t border-white/5">
                ROUGE = inspection obligatoire · JAUNE = contrôle documentaire · VERT = passage libre
              </p>
            </div>
          </div>
        </FadeIn>
      </div>

      {/* ── ROW 3: Office league table ── */}
      <FadeIn delay={0.1}>
        <div className="card">
          <SectionTitle icon="🏛️">Classement des Bureaux Douaniers — Recettes & Taux de Fraude</SectionTitle>
          <ReactECharts option={officeBarOption} style={{height:200}}/>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 mt-4">
            {sortedOffices.map((o:{office_id:string;name:string;count:number;revenue:number;fraud_count:number;fraud_rate:number;efficiency:number}, i:number) => (
              <div key={o.office_id} className="rounded-xl p-3 text-center" style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
                <div className="text-[10px] font-bold mb-1" style={{color:OFF_COLORS[i]}}>{o.name.split(' ').slice(0,2).join(' ')}</div>
                <div className="text-sm font-black text-white">{fmtM(o.revenue)}M</div>
                <div className="text-[10px] text-muted">{fmt(o.count)} SGDs</div>
                <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.06)'}}>
                  <div className="h-full rounded-full" style={{width:`${o.fraud_rate*100*5}%`,background:riskColor(o.fraud_rate*100*5)}}/>
                </div>
                <div className="text-[9px] mt-0.5" style={{color:riskColor(o.fraud_rate*100*5)}}>{Math.round(o.fraud_rate*100)}% fraude</div>
                <div className="text-[9px] mt-0.5" style={{color:eff_color(o.efficiency)}}>Eff. {o.efficiency}%</div>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>

      {/* ── ROW 4: Top Agents + Alert Feed ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <FadeIn delay={0.05}>
          <div className="card h-full">
            <SectionTitle icon="🏆">Top 5 Agents — Détection Fraude</SectionTitle>
            <div className="space-y-3 mt-2">
              {topInspectors.map((ins:{id:string;name:string;bureau:string;fraud_detected:number;total:number;detection_rate:number}, i:number) => {
                const rate = Math.round(ins.detection_rate * 100);
                return (
                  <motion.div key={ins.id} initial={{opacity:0,x:-16}} animate={{opacity:1,x:0}} transition={{delay:i*0.07}} className="flex items-center gap-3 p-3 rounded-xl" style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0" style={{background:i===0?'rgba(251,191,36,0.2)':i===1?'rgba(148,163,184,0.15)':i===2?'rgba(180,83,9,0.15)':'rgba(255,255,255,0.06)',color:i===0?'#fbbf24':i===1?'#94a3b8':i===2?'#b45309':'#475569'}}>
                      {i+1}
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-white">{ins.name}</div>
                      <div className="text-[10px] text-muted">{ins.bureau}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-white">{ins.fraud_detected} <span className="text-[10px] text-muted font-normal">fraudes</span></div>
                      <div className="text-[10px]" style={{color:rate>14?'#10b981':rate>12?'#f59e0b':'#94a3b8'}}>{rate}% taux détection</div>
                    </div>
                    <div className="w-16">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.06)'}}>
                        <div className="h-full rounded-full" style={{width:`${rate*5}%`,background:rate>14?'#10b981':rate>12?'#f59e0b':'#3b82f6'}}/>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div className="card h-full">
            <SectionTitle icon="🔔">Alertes — Actions Prioritaires</SectionTitle>
            <div className="grid grid-cols-2 gap-3 mt-2">
              {alertFeed.map((a, i) => (
                <motion.div key={a.label} initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} transition={{delay:i*0.08}}
                  className="rounded-xl p-4 flex flex-col" style={{background:`${a.color}0d`,border:`1px solid ${a.color}${a.urgent?'55':'22'}`}}>
                  <div className="flex items-start justify-between mb-1">
                    <span className="text-xl">{a.icon}</span>
                    {a.urgent && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{background:`${a.color}22`,color:a.color}}>URGENT</span>}
                  </div>
                  <div className="text-2xl font-black mt-1" style={{color:a.color}}>
                    <AnimatedNumber value={a.value ?? 0}/>
                  </div>
                  <div className="text-[10px] text-muted mt-0.5">{a.label}</div>
                </motion.div>
              ))}
            </div>
            {/* Clearance overdue mini-bar */}
            <div className="mt-4 p-3 rounded-xl" style={{background:'rgba(245,158,11,0.06)',border:'1px solid rgba(245,158,11,0.15)'}}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold" style={{color:'#f59e0b'}}>Taux déclarations en retard</span>
                <span className="text-xs font-black" style={{color:'#f59e0b'}}>{data.clearance_overdue_pct ?? 0}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.06)'}}>
                <div className="h-full rounded-full transition-all" style={{width:`${Math.min(100,data.clearance_overdue_pct??0)*4}%`,background:'#f59e0b'}}/>
              </div>
              <div className="text-[10px] text-muted mt-1">{fmt(data.clearance_overdue_count??0)} déclarations dépassant 1.5× le délai standard du bureau</div>
            </div>
            {/* Cases awaiting recovery */}
            <div className="mt-3 p-3 rounded-xl" style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.15)'}}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-red-400">Perte potentielle — dossiers EN_COURS</span>
                <span className="text-xs font-black text-red-400">{fmtM(filteredCases.filter((f:{status:string})=>f.status==='EN_COURS').reduce((s:number,f:{loss_net:number})=>s+(f.loss_net??0),0)||0)}M FCFA</span>
              </div>
              <div className="text-[10px] text-muted mt-0.5">{data.cases_open} dossiers encore ouverts · recouvrement en cours</div>
            </div>
          </div>
        </FadeIn>
      </div>

      {/* ── ROW 5: Recent fraud cases table (latest 10, no pagination on dashboard) ── */}
      {fraud && filteredCases.length > 0 && (
        <FadeIn delay={0.15}>
          <div className="card">
            <SectionTitle icon="🚨">Derniers Cas de Fraude</SectionTitle>
            <div style={{overflowX:'auto'}}>
              <table className="tbl">
                <thead>
                  <tr><th>Cas</th><th>Importateur</th><th>Type</th><th>Évasion</th><th>Score IA</th><th>Bureau</th><th>Statut</th></tr>
                </thead>
                <tbody>
                  {filteredCases.slice(0,10).map((f:{case_id:string;importer_id:string;importer_name?:string;fraud_type:string;tax_evasion_amount?:number;loss_net:number;ai_risk_score:number;office_name?:string;office_id:string;status:string}) => (
                    <tr key={f.case_id}>
                      <td><code style={{color:'#22d3ee',fontSize:11}}>{f.case_id}</code></td>
                      <td>
                        <div className="text-xs font-semibold text-white">{f.importer_name??f.importer_id}</div>
                        <div className="text-[10px] text-muted">{f.importer_id}</div>
                      </td>
                      <td><span className="text-xs text-slate-400">{f.fraud_type?.replace(/_/g,' ')}</span></td>
                      <td><span className="text-xs font-bold text-red-400">{fmtM(f.tax_evasion_amount??f.loss_net)}M FCFA</span></td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <div className="h-1 w-10 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.06)'}}>
                            <div className="h-full rounded-full" style={{width:`${f.ai_risk_score}%`,background:f.ai_risk_score>=70?'#ef4444':'#f59e0b'}}/>
                          </div>
                          <span className="text-xs font-bold" style={{color:f.ai_risk_score>=70?'#f87171':'#fbbf24'}}>{f.ai_risk_score}</span>
                        </div>
                      </td>
                      <td><span className="text-xs text-muted">{f.office_name??f.office_id}</span></td>
                      <td><StatusBadge status={f.status}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </FadeIn>
      )}
    </div>
  );
}
