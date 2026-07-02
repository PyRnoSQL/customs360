import React, { useState } from 'react';
import ReactECharts from 'echarts-for-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line, ReferenceLine,
  PieChart, Pie,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { useApi } from '../hooks/useApi';
import { PageHeader } from '../App';
import { KPICard, SectionTitle, Loading, ErrorBox, FadeIn, StaggerGrid, Gauge, AnimatedNumber, PaginatedTable } from '../components/UI';
import { fmtM, fmt } from '../services/api';
import { useFilters } from '../context/FilterContext';

const CHART_TT = {
  contentStyle: { background:'rgba(15,23,42,0.95)', border:'1px solid rgba(59,130,246,0.3)', borderRadius:8, color:'#f1f5f9' },
  labelStyle: { color:'#94a3b8' },
};

type Forecast = { month:string; label:string; actual:number|null; forecast:number; lower_bound:number; upper_bound:number };
type Trajectory = { office_id:string; name:string; trend:string; momentum_score:number; period_revenues:number[]; forecast_next:number; alert:string|null };
type Anomaly = { sgd_id:string; importer_id:string; importer_name:string; office_id:string; office_name:string; tariff_code:string; tariff_description:string; anomaly_score:number; risk_factors:string[]; predicted_fraud_prob:number; revenue_at_risk:number; recommended_action:string };
type RiskDrift = { importer_id:string; importer_name:string; current_score:number; prev_score:number; drift:number; trend:string; velocity:number; alert:string|null; periods:{month:string;score:number}[] };
type NextDecl = { importer_id:string; importer_name:string; next_fraud_prob:number; confidence:string; key_signals:string[]; recommended_action:string };
type FraudVelocity = { current_month:string; velocity_index:number; acceleration:number; status:string; fraud_rate_current:number; fraud_rate_previous:number; projected_eom_loss:number; alert:string|null; monthly_series:{month:string;label:string;rate:number;velocity:number}[] };
type DelayCause = { sgd_id:string; office_id:string; office_name:string; importer_id:string; importer_name:string; actual_hours:number; baseline_hours:number; overshoot:number; cause:string; cause_label:string; confidence:number; action:string };
type CollusionExp = { officer_id:string; name:string; exposure_score:number; high_risk_count:number; total_declarations:number; exposure_rate:number; integrity_flag:string; alert:string|null };

const TREND_META: Record<string,{icon:string;color:string;label:string}> = {
  RISING:    { icon:'📈', color:'#10b981', label:'En hausse'  },
  STABLE:    { icon:'➡️', color:'#3b82f6', label:'Stable'     },
  DECLINING: { icon:'📉', color:'#ef4444', label:'En baisse'  },
};
const DRIFT_META: Record<string,{color:string;icon:string;label:string}> = {
  ACCELERATING: { color:'#ef4444', icon:'🔺', label:'Accélération' },
  STABLE:       { color:'#3b82f6', icon:'➡️', label:'Stable'       },
  IMPROVING:    { color:'#10b981', icon:'🔻', label:'Amélioration'  },
};
const CAUSE_COLOR: Record<string,string> = {
  INTENTIONAL:'#ef4444', DOCUMENT_ISSUE:'#f59e0b',
  INSPECTION_BACKLOG:'#8b5cf6', SYSTEM_ERROR:'#06b6d4', NORMAL:'#10b981',
};
const STATUS_COLOR: Record<string,string> = { CRITICAL:'#ef4444', WARNING:'#f97316', NORMAL:'#3b82f6', IMPROVING:'#10b981' };
const INTEGRITY_COLOR: Record<string,string> = { HIGH:'#ef4444', MEDIUM:'#f59e0b', LOW:'#10b981' };

// ── Velocity Gauge ─────────────────────────────────────────────────────────────
function VelocityGauge({ velocity }: { velocity: FraudVelocity }) {
  const color = STATUS_COLOR[velocity.status] ?? '#3b82f6';
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

// ── Risk Drift Chart ───────────────────────────────────────────────────────────
function RiskDriftPanel({ drifts }: { drifts: RiskDrift[] }) {
  const [selected, setSelected] = useState<RiskDrift | null>(null);
  const top = drifts.filter(d => d.trend !== 'STABLE' || d.current_score >= 40).slice(0, 10);

  const barData = top.map(d => ({
    id: d.importer_id,
    current: d.current_score,
    drift: Math.abs(d.drift),
    color: DRIFT_META[d.trend]?.color ?? '#64748b',
    trend: d.trend,
  }));

  return (
    <div className="card">
      <SectionTitle icon="📡">Dérive du Risque Importateurs — Tendance 3 Mois</SectionTitle>
      <p className="text-xs text-muted mb-4">Détecte les opérateurs dont le profil de risque évolue — <span style={{color:'#ef4444'}}>rouge = aggravation</span> · <span style={{color:'#10b981'}}>vert = amélioration</span></p>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={barData} layout="vertical" margin={{ left:60, right:20, top:5, bottom:5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false}/>
            <XAxis type="number" domain={[0,100]} tick={{ fill:'#64748b', fontSize:10 }}/>
            <YAxis type="category" dataKey="id" tick={{ fill:'#94a3b8', fontSize:9 }} width={58}/>
            <Tooltip {...CHART_TT} formatter={(v:number, name:string) => [`${v}%`, name === 'current' ? 'Score actuel' : 'Variation']}/>
            <Bar dataKey="current" name="Score actuel" radius={[0,4,4,0]}>
              {barData.map((d,i) => <Cell key={i} fill={d.color} fillOpacity={0.7}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        <div className="space-y-2 overflow-y-auto" style={{ maxHeight:260 }}>
          {top.map(d => {
            const dm = DRIFT_META[d.trend];
            return (
              <motion.div key={d.importer_id} onClick={() => setSelected(s => s?.importer_id === d.importer_id ? null : d)}
                whileHover={{ scale:1.01 }} className="flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all"
                style={{ background: selected?.importer_id === d.importer_id ? `${dm.color}18` : 'rgba(255,255,255,0.03)', border:`1px solid ${dm.color}33` }}>
                <span className="text-sm">{dm.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white truncate">{d.importer_name ?? d.importer_id}</div>
                  <div className="text-[10px]" style={{ color: dm.color }}>{dm.label} · {d.velocity > 0 ? '+' : ''}{d.velocity}/mois</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-black" style={{ color: dm.color }}>{d.current_score}%</div>
                  <div className="text-[10px] text-muted">{d.drift > 0 ? '+' : ''}{d.drift}pts</div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Trend sparkline for selected */}
      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }}
            className="mt-4 p-4 rounded-xl overflow-hidden"
            style={{ background:'rgba(59,130,246,0.06)', border:'1px solid rgba(59,130,246,0.2)' }}>
            <div className="text-xs font-bold text-white mb-2">{selected.importer_name ?? selected.importer_id} — Évolution du Score de Risque</div>
            <ResponsiveContainer width="100%" height={80}>
              <LineChart data={selected.periods}>
                <XAxis dataKey="month" tick={{ fill:'#475569', fontSize:9 }} tickFormatter={(v:string) => v.slice(5)}/>
                <YAxis domain={[0,100]} tick={{ fill:'#475569', fontSize:9 }} width={25}/>
                <Tooltip {...CHART_TT}/>
                <ReferenceLine y={70} stroke="rgba(239,68,68,0.4)" strokeDasharray="3 2"/>
                <Line type="monotone" dataKey="score" stroke={DRIFT_META[selected.trend]?.color ?? '#3b82f6'}
                  strokeWidth={2} dot={{ r:3, fill: DRIFT_META[selected.trend]?.color ?? '#3b82f6' }}/>
              </LineChart>
            </ResponsiveContainer>
            {selected.alert && <div className="text-xs mt-2 p-2 rounded-lg" style={{ background:'rgba(239,68,68,0.1)', color:'#f87171', border:'1px solid rgba(239,68,68,0.2)' }}>⚠️ {selected.alert}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Next Declaration Prediction ────────────────────────────────────────────────
function NextDeclPanel({ predictions }: { predictions: NextDecl[] }) {
  const high = predictions.filter(p => p.next_fraud_prob >= 60);
  const CONF_COLOR: Record<string,string> = { HIGH:'#10b981', MEDIUM:'#f59e0b', LOW:'#ef4444' };
  const ACTION_COLOR = (a:string) => a.includes('obligatoire') ? '#ef4444' : a.includes('prioritaire') ? '#f59e0b' : '#3b82f6';

  const pieSegments = [
    { name:'Haut risque (≥70%)',   value: predictions.filter(p=>p.next_fraud_prob>=70).length,                        color:'#ef4444' },
    { name:'Risque moyen (45-70%)', value: predictions.filter(p=>p.next_fraud_prob>=45&&p.next_fraud_prob<70).length, color:'#f59e0b' },
    { name:'Faible risque (<45%)', value: predictions.filter(p=>p.next_fraud_prob<45).length,                         color:'#10b981' },
  ];
  const pieTotal = pieSegments.reduce((s,d) => s + d.value, 0);
  const pieOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: 'rgba(59,130,246,0.3)',
      borderWidth: 1,
      textStyle: { color: '#f1f5f9', fontSize: 12 },
      formatter: (p: {name:string;value:number;percent:string}) =>
        `<span style="color:#f1f5f9"><b>${p.name}</b><br/>Importateurs: <b style="color:#fff">${p.value}</b> &nbsp;<span style="color:#94a3b8">(${p.percent}%)</span></span>`,
    },
    legend: {
      orient: 'horizontal',
      bottom: 0,
      left: 'center',
      itemWidth: 10, itemHeight: 10, itemGap: 14,
      textStyle: { color: '#94a3b8', fontSize: 10 },
      formatter: (name: string) => {
        const seg = pieSegments.find(s => s.name === name);
        const val = seg?.value ?? 0;
        const pct = pieTotal > 0 ? Math.round((val / pieTotal) * 100) : 0;
        return `${name}   ${val} (${pct}%)`;
      },
    },
    series: [{
      type: 'pie',
      radius: ['32%', '54%'],
      center: ['50%', '38%'],
      avoidLabelOverlap: true,
      label: {
        show: true,
        position: 'outside',
        color: '#94a3b8',
        fontSize: 10,
        fontWeight: '500',
        formatter: (p: {name:string;percent:string;value:number}) =>
          p.value > 0 ? `${p.name}
${p.percent}%` : '',
      },
      labelLine: {
        show: true,
        length: 12, length2: 8,
        lineStyle: { color: 'rgba(148,163,184,0.5)', width: 1 },
        showAbove: true,
      },
      emphasis: { scale: true, scaleSize: 6 },
      data: pieSegments.map(d => ({
        name: d.name, value: d.value,
        itemStyle: { color: d.color, borderRadius: 3, borderWidth: 2, borderColor: 'rgba(15,23,42,0.9)' },
        label: { show: d.value > 0 },
        labelLine: { show: d.value > 0 },
      })),
    }],
  };

  return (
    <div className="card">
      <SectionTitle icon="🔮">Prédiction Prochaine Déclaration — Probabilité Fraude</SectionTitle>
      <p className="text-xs text-muted mb-4">Basé sur les 5 dernières déclarations de chaque importateur · Modèle multi-facteurs · <span style={{color:'#10b981'}}>Confiance = quantité de données disponibles</span></p>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Pie */}
        <div>
          {pieTotal === 0
            ? <div className="h-[220px] flex items-center justify-center text-muted text-sm">Aucune donnée disponible</div>
            : <ReactECharts option={pieOption} style={{ height: 280 }} />
          }
        </div>

        {/* Top predictions table */}
        <div className="xl:col-span-2 overflow-y-auto" style={{ maxHeight:280 }}>
          <table className="tbl">
            <thead><tr><th>Importateur</th><th>Proba. Fraude</th><th>Confiance</th><th>Action</th></tr></thead>
            <tbody>
              {predictions.slice(0, 15).map(p => (
                <motion.tr key={p.importer_id} initial={{ opacity:0 }} animate={{ opacity:1 }}>
                  <td><div className="text-xs font-bold text-white">{p.importer_name ?? p.importer_id}</div><div className="text-[10px] text-muted">{p.importer_id}</div></td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background:'rgba(255,255,255,0.06)' }}>
                        <motion.div className="h-full rounded-full" initial={{ width:0 }} animate={{ width:`${p.next_fraud_prob}%` }}
                          transition={{ duration:0.8 }} style={{ background: p.next_fraud_prob>=70?'#ef4444':p.next_fraud_prob>=45?'#f59e0b':'#10b981' }}/>
                      </div>
                      <span className="text-xs font-black" style={{ color: p.next_fraud_prob>=70?'#f87171':p.next_fraud_prob>=45?'#fbbf24':'#34d399' }}>{p.next_fraud_prob}%</span>
                    </div>
                  </td>
                  <td><span className="text-[10px] font-bold" style={{ color: CONF_COLOR[p.confidence] }}>{p.confidence}</span></td>
                  <td><span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: ACTION_COLOR(p.recommended_action)+'18', color: ACTION_COLOR(p.recommended_action), border:`1px solid ${ACTION_COLOR(p.recommended_action)}33` }}>{p.recommended_action.slice(0,28)}…</span></td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Delay Cause Classifier ─────────────────────────────────────────────────────
function DelayClassifierPanel({ delays }: { delays: DelayCause[] }) {
  const byCause = delays.reduce<Record<string,number>>((a,d) => { a[d.cause]=(a[d.cause]??0)+1; return a; }, {});
  const causeData = Object.entries(byCause).map(([cause,count]) => ({ cause, label: { INTENTIONAL:'Intentionnel',DOCUMENT_ISSUE:'Document',INSPECTION_BACKLOG:'Congestion',SYSTEM_ERROR:'Système',NORMAL:'Normal' }[cause]??cause, count, color: CAUSE_COLOR[cause]??'#64748b' }));

  return (
    <div className="card">
      <SectionTitle icon="🔍">Classificateur de Causes — Délais de Dédouanement</SectionTitle>
      <p className="text-xs text-muted mb-4">Classification ML des causes de retard · <span style={{color:'#ef4444'}}>Rouge = intentionnel</span> · Taille barre = nombre de cas</p>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={causeData} margin={{ left:-10, right:10, bottom:20, top:5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)"/>
              <XAxis dataKey="label" tick={{ fill:'#64748b', fontSize:9 }} angle={-20} textAnchor="end"/>
              <YAxis tick={{ fill:'#64748b', fontSize:10 }}/>
              <Tooltip {...CHART_TT}/>
              <Bar dataKey="count" name="Cas" radius={[4,4,0,0]}>
                {causeData.map((d,i) => <Cell key={i} fill={d.color} fillOpacity={0.8}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="xl:col-span-2 overflow-y-auto" style={{ maxHeight:260 }}>
          <table className="tbl">
            <thead><tr><th>SGD</th><th>Bureau</th><th>Cause</th><th>Dépassement</th><th>Confiance</th><th>Action</th></tr></thead>
            <tbody>
              {delays.slice(0, 15).map(d => (
                <motion.tr key={d.sgd_id} initial={{ opacity:0 }} animate={{ opacity:1 }}>
                  <td><code style={{ color:'#22d3ee', fontSize:11 }}>{d.sgd_id}</code></td>
                  <td><span className="text-xs text-muted">{d.office_name ?? d.office_id}</span></td>
                  <td><span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background:CAUSE_COLOR[d.cause]+'18', color:CAUSE_COLOR[d.cause], border:`1px solid ${CAUSE_COLOR[d.cause]}33` }}>{d.cause_label}</span></td>
                  <td><span className="text-xs font-bold" style={{ color: d.overshoot>100?'#ef4444':'#f59e0b' }}>+{d.overshoot}h</span></td>
                  <td><span className="text-xs" style={{ color: d.confidence>=80?'#10b981':'#f59e0b' }}>{d.confidence}%</span></td>
                  <td><span className="text-[10px] text-slate-400">{d.action.slice(0,30)}</span></td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Collusion Exposure ─────────────────────────────────────────────────────────
function CollusionExposurePanel({ exposures }: { exposures: CollusionExp[] }) {
  return (
    <div className="card">
      <SectionTitle icon="🕵️">Score d'Exposition à la Collusion — Agents Douaniers</SectionTitle>
      <p className="text-xs text-muted mb-4">Mesure le % de déclarations traitées pour des importateurs frauduleux confirmés · Indicateur d'intégrité distinct de la performance</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {exposures.slice(0, 9).map((e, i) => {
          const ic = INTEGRITY_COLOR[e.integrity_flag];
          return (
            <motion.div key={e.officer_id} initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay: i*0.06 }}
              className="rounded-xl p-4" style={{ background:`${ic}0a`, border:`1px solid ${ic}25` }}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-sm font-bold text-white">{e.name}</div>
                  <div className="text-[10px] text-muted">{e.officer_id}</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-black" style={{ color:ic }}>{e.exposure_score}</div>
                  <div className="text-[9px]" style={{ color:ic }}>{e.integrity_flag}</div>
                </div>
              </div>
              <Gauge value={e.exposure_score} color={ic}/>
              <div className="grid grid-cols-2 gap-2 mt-2.5">
                <div className="text-center rounded-lg py-1" style={{ background:'rgba(255,255,255,0.04)' }}>
                  <div className="text-xs font-bold" style={{ color:ic }}>{e.high_risk_count}</div>
                  <div className="text-[9px] text-muted">Décl. risquées</div>
                </div>
                <div className="text-center rounded-lg py-1" style={{ background:'rgba(255,255,255,0.04)' }}>
                  <div className="text-xs font-bold text-white">{Math.round(e.exposure_rate*100)}%</div>
                  <div className="text-[9px] text-muted">Taux exposition</div>
                </div>
              </div>
              {e.alert && <div className="mt-2 text-[10px] p-1.5 rounded-lg" style={{ background:`${ic}15`, color:ic }}>⚠️ {e.alert.slice(0,60)}…</div>}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ── MAIN PAGE ──────────────────────────────────────────────────────────────────
export default function Predictions() {
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
  const { data: advData, loading: aLoading } = useApi(() =>
    Promise.race([
      fetch(`/api/predictions/advanced${advQs ? '?' + advQs : ''}`).then(r => r.json()),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 8000))
    ])
  , [advQs]);

  if (bLoading) return <><PageHeader /><Loading rows={6}/></>;
  if (bError) return <><PageHeader /><ErrorBox message={bError} onRetry={reload}/></>;
  if (!baseData) return null;

  const { declaration_anomalies:anomalies, revenue_forecast:forecast, bureau_trajectories:trajectories, total_revenue_at_risk:atRisk, high_anomaly_count:highCount, forecast_shortfall:shortfall } = baseData;
  const { risk_drift, next_decl, fraud_velocity, delay_causes, collusion_exposure } = advData ?? {};

  const TREND_META2: Record<string,{icon:string;color:string;label:string}> = {
    RISING:{ icon:'📈', color:'#10b981', label:'En hausse' },
    STABLE:{ icon:'➡️', color:'#3b82f6', label:'Stable' },
    DECLINING:{ icon:'📉', color:'#ef4444', label:'En baisse' },
  };

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
      <PageHeader/>

      <StaggerGrid className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <KPICard label="Anomalies" value={highCount} icon="🎯" color="danger"/>
        <KPICard label="Revenus à risque" value={Math.round(atRisk/1e6)} suffix=" M" icon="⚠️" color="gold"/>
        <KPICard label="Déficit prévu" value={shortfall>0?Math.round(shortfall/1e6):0} suffix={shortfall>0?" M":" FCFA"} icon="📉" color={shortfall>0?'danger':'success'}/>
        <KPICard label="Bureaux déclinants" value={(trajectories as Trajectory[]).filter(t=>t.trend==='DECLINING').length} icon="🏛️" color="teal"/>
        {fraud_velocity&&<KPICard label="Vélocité fraude" value={fraud_velocity.velocity_index} icon="⚡" color={fraud_velocity.status==='CRITICAL'?'danger':fraud_velocity.status==='WARNING'?'gold':'accent'}/>}
      </StaggerGrid>

      {/* ROW 1: Forecast + Gauge + Velocity */}
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

      {/* ROW 2: Bureau trajectories */}
      <FadeIn delay={0.1}>
        <div className="card">
          <SectionTitle icon="🏛️">Trajectoire des Bureaux</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {(trajectories as Trajectory[]).map((t,idx) => {
              const tm = TREND_META2[t.trend]??TREND_META2.STABLE;
              const maxR = Math.max(...t.period_revenues,1);
              const sparkOption = { backgroundColor:'transparent', grid:{left:0,right:0,top:0,bottom:0}, xAxis:{type:'category',show:false}, yAxis:{type:'value',show:false}, series:[{type:'line',data:t.period_revenues,smooth:true,symbol:'none',lineStyle:{color:tm.color,width:2},areaStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:tm.color+'40'},{offset:1,color:'transparent'}]}}}] };
              return (
                <motion.div key={t.office_id} initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:idx*0.08}}
                  className="rounded-xl p-4" style={{background:'rgba(255,255,255,0.02)',border:`1px solid ${tm.color}25`}}>
                  <div className="flex items-start justify-between mb-2">
                    <div><div className="text-sm font-bold text-white leading-tight">{t.name}</div><div className="text-[10px] text-muted mt-0.5">{t.office_id}</div></div>
                    <div className="text-right"><div className="text-xl">{tm.icon}</div><div className="text-[10px] font-bold" style={{color:tm.color}}>{tm.label}</div><div className="text-[9px] text-muted">{t.momentum_score>0?'+':''}{t.momentum_score}%</div></div>
                  </div>
                  <ReactECharts option={sparkOption} style={{height:50}}/>
                  <div className="flex justify-between items-center mt-2"><span className="text-[10px] text-muted">Prévision:</span><span className="text-xs font-bold" style={{color:tm.color}}>{fmtM(t.forecast_next)} FCFA</span></div>
                  {t.alert&&<motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.5}} className="mt-2 text-[10px] px-2 py-1 rounded" style={{background:'rgba(239,68,68,0.1)',color:'#f87171',border:'1px solid rgba(239,68,68,0.2)'}}>⚠️ {t.alert}</motion.div>}
                </motion.div>
              );
            })}
          </div>
        </div>
      </FadeIn>

      {/* MODEL 1: Risk Drift */}
      {risk_drift?.length > 0 && <FadeIn delay={0.1}><RiskDriftPanel drifts={risk_drift}/></FadeIn>}

      {/* MODEL 2: Next Declaration */}
      {next_decl?.length > 0 && <FadeIn delay={0.1}><NextDeclPanel predictions={next_decl}/></FadeIn>}

      {/* MODEL 4: Delay Classifier */}
      {delay_causes?.length > 0 && <FadeIn delay={0.1}><DelayClassifierPanel delays={delay_causes}/></FadeIn>}

      {/* MODEL 5: Collusion Exposure */}
      {collusion_exposure?.length > 0 && <FadeIn delay={0.1}><CollusionExposurePanel exposures={collusion_exposure}/></FadeIn>}

      {/* Anomaly table */}
      <FadeIn delay={0.15}>
        <div className="card">
          <SectionTitle icon="🔬">Scoring Anomalies — Déclarations Prioritaires</SectionTitle>
          <PaginatedTable
            pageSize={15}
            headers={<tr><th>SGD</th><th>Importateur</th><th>Tarif</th><th>Bureau</th><th>Score</th><th>Prob. Fraude</th><th>Revenu à risque</th><th>Action</th></tr>}
            rows={(anomalies as Anomaly[]).map((a) => {
              const ac=(s:string)=>s.includes('immédiate')?'#ef4444':s.includes('prioritaire')?'#f59e0b':'#3b82f6';
              return (
                <tr key={a.sgd_id}>
                  <td><code style={{color:'#22d3ee',fontSize:11}}>{a.sgd_id}</code></td>
                  <td>
                    <div className="text-xs font-semibold text-white">{a.importer_name ?? a.importer_id}</div>
                    <div className="text-[10px] text-muted">{a.importer_id}</div>
                  </td>
                  <td>
                    <code style={{color:'#22d3ee',fontSize:11}}>{a.tariff_code}</code>
                  </td>
                  <td>
                    <div className="text-xs text-muted">{a.office_name ?? a.office_id}</div>
                  </td>
                  <td><div className="flex items-center gap-1.5"><div className="w-12 h-1.5 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.06)'}}><div className="h-full rounded-full" style={{width:`${a.anomaly_score}%`,background:a.anomaly_score>=70?'#ef4444':a.anomaly_score>=45?'#f59e0b':'#3b82f6'}}/></div><span className="text-xs font-bold" style={{color:a.anomaly_score>=70?'#f87171':a.anomaly_score>=45?'#fbbf24':'#60a5fa'}}>{a.anomaly_score}</span></div></td>
                  <td><span className="text-xs font-bold" style={{color:a.predicted_fraud_prob>=0.7?'#f87171':'#fbbf24'}}>{Math.round(a.predicted_fraud_prob*100)}%</span></td>
                  <td><span className="text-xs font-bold text-red-400">{fmtM(a.revenue_at_risk)} FCFA</span></td>
                  <td><span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{background:ac(a.recommended_action)+'18',color:ac(a.recommended_action),border:`1px solid ${ac(a.recommended_action)}35`}}>{a.recommended_action}</span></td>
                </tr>
              );
            })}
          />
        </div>
      </FadeIn>
    </div>
  );
}
