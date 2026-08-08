import { useFilters, applyBureauFilter, applyPeriodFilter, applyStatusFilter, applyRiskFilter } from '../context/FilterContext';
import { PageHeader } from '../App';
// ── Fraud Page ────────────────────────────────────────────────────────────────
import React, { useRef, useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { useApi } from '../hooks/useApi';
import { api, fmtM, fmt } from '../services/api';
import { KPICard, SectionTitle, StatusBadge, Loading, ErrorBox, Code, PaginatedTable } from '../components/UI';

export function Fraud() {
  const { data, loading, error, reload } = useApi(api.fraud);
  const { filters } = useFilters();
  if (loading) return <Loading />;
  if (error)   return <ErrorBox message={error} onRetry={reload} />;
  if (!data)   return null;
  const filteredCases = applyStatusFilter(applyBureauFilter(applyPeriodFilter(data.cases, filters.period), filters.bureau), filters.status);
  const totalLoss = filteredCases.reduce((s: number, f: { loss_net: number }) => s + f.loss_net, 0);

  // Derive fraud type counts from filteredCases
  const filteredByType = filteredCases.reduce((acc: Record<string,number>, f: { fraud_type: string }) => {
    acc[f.fraud_type] = (acc[f.fraud_type] ?? 0) + 1; return acc;
  }, {});
  const typeEntries = Object.entries(filteredByType).sort((a, b) => b[1] - a[1]);
  const colors = ['#ef4444','#f97316','#eab308','#3b82f6','#8b5cf6','#06b6d4'];
  const total = typeEntries.reduce((s,[,v]) => s + v, 0);
  const donutOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: 'rgba(59,130,246,0.3)',
      borderWidth: 1,
      textStyle: { color: '#f1f5f9', fontSize: 12 },
      formatter: (p: {name:string;value:number;percent:string}) =>
        `<span style="color:#f1f5f9"><b>${String(p.name).replace(/_/g,' ')}</b><br/>Cas: <b style="color:#fff">${p.value}</b> &nbsp;<span style="color:#94a3b8">(${p.percent}%)</span></span>`,
    },
    legend: {
      orient: 'horizontal',
      bottom: 0,
      left: 'center',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 14,
      textStyle: { color: '#94a3b8', fontSize: 10 },
      formatter: (name: string) => {
        const entry = typeEntries.find(([k]) => k === name);
        const val = entry ? entry[1] : 0;
        const pct = total > 0 ? Math.round((val / total) * 100) : 0;
        return `${String(name).replace(/_/g,' ')}  ${val} (${pct}%)`;
      },
    },
    series: [{
      type: 'pie',
      radius: ['32%', '54%'],
      center: ['50%', '30%'],
      avoidLabelOverlap: true,
      label: {
        show: true,
        position: 'outside',
        color: '#94a3b8',
        fontSize: 11,
        fontWeight: '500',
        formatter: (p: {name:string;percent:string}) =>
          `${String(p.name).replace(/_/g,' ')}
${p.percent}%`,
      },
      labelLine: {
        show: true,
        length: 12,
        length2: 8,
        lineStyle: { color: 'rgba(148,163,184,0.5)', width: 1 },
      },
      emphasis: { scale: true, scaleSize: 6 },
      data: typeEntries.map(([k, v], i) => ({
        name: k,
        value: v,
        itemStyle: {
          color: colors[i % colors.length],
          borderRadius: 3,
          borderWidth: 2,
          borderColor: 'rgba(15,23,42,0.9)',
        },
      })),
    }],
  };

  return (
    <div className="space-y-5">
      <PageHeader />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard label="Total Cas" value={fmt(filteredCases.length)} color="danger" />
        <KPICard label="Pertes Totales" value={fmtM(totalLoss) + ' FCFA'} color="gold" />
        <KPICard label="Dossiers Clôturés" value={fmt(filteredCases.filter((f: { status: string }) => f.status === 'CLOTURE_AMIABLE' || f.status === 'CLOTURE_CONTENTIEUX' || f.status === 'TRANSMIS_JUSTICE').length)} color="danger" />
        <KPICard label="En Cours" value={fmt(filteredCases.filter((f: { status: string }) => f.status === 'EN_COURS').length)} color="teal" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="card">
          <SectionTitle icon="🔬">Types de Fraude Détectés</SectionTitle>
          {typeEntries.length === 0
            ? <div className="h-48 flex items-center justify-center text-muted text-sm">Aucun cas pour les filtres sélectionnés</div>
            : <ReactECharts option={donutOption} style={{ height: 340 }} />
          }
        </div>
        <div className="card xl:col-span-2">
          <SectionTitle icon="📋">Codes Tarifaires à Risque</SectionTitle>
          {(() => {
            const tariffMap: Record<string,{cases:number;total:number;desc:string}> = {};
            filteredCases.forEach((f: { tariff_code: string; tariff_description?: string }) => {
              if (!tariffMap[f.tariff_code]) tariffMap[f.tariff_code] = {cases:0,total:0,desc:''};
              tariffMap[f.tariff_code].cases++;
              tariffMap[f.tariff_code].total++;
              if (f.tariff_description) tariffMap[f.tariff_code].desc = f.tariff_description;
            });
            const tariffRows = Object.entries(tariffMap)
              .map(([code, v]) => ({ code, cases: v.cases, rate: v.cases / Math.max(v.total,1), desc: v.desc }))
              .sort((a,b) => b.cases - a.cases);
            return tariffRows.length === 0
              ? <div className="text-center text-muted py-4">Aucun cas pour les filtres sélectionnés</div>
              : (
              <PaginatedTable
                pageSize={15}
                headers={<tr><th>Code SH</th><th>Description</th><th>Fraudes</th><th>Taux</th></tr>}
                rows={tariffRows.map(t => (
                  <tr key={t.code}>
                    <td><Code>{t.code}</Code></td>
                    <td><span className="text-xs text-sub">{t.desc ?? '—'}</span></td>
                    <td><span className="font-bold text-danger">{t.cases}</span></td>
                    <td><span className="text-xs font-bold" style={{ color: t.rate > 0.3 ? '#ef4444' : t.rate > 0.15 ? '#f59e0b' : '#10b981' }}>{(t.rate * 100).toFixed(1)}%</span></td>
                  </tr>
                ))}
              />
            );
          })()}
        </div>
      </div>

      <div className="card">
        <SectionTitle icon="🚨">Tous les Cas de Fraude</SectionTitle>
        <PaginatedTable
          pageSize={15}
          headers={<tr><th>Cas</th><th>Importateur</th><th>Déclarant</th><th>Type</th><th>Évasion</th><th>Pénalité</th><th>Score IA</th><th>Secteur</th><th>Statut</th></tr>}
          rows={filteredCases.map((f: { case_id: string; sgd_id: string; importer_id: string; importer_name?: string; declarant_id: string; declarant_name?: string; fraud_type: string; loss_net: number; tax_evasion_amount?: number; penalty_amount?: number; ai_risk_score: number; office_id: string; office_name?: string; status: string }) => (
            <tr key={f.case_id}>
              <td><Code>{f.case_id}</Code></td>
              <td>
                <div className="text-xs font-semibold text-white">{f.importer_name ?? f.importer_id}</div>
                <div className="text-[10px] text-muted">{f.importer_id}</div>
              </td>
              <td>
                <div className="text-xs text-sub">{f.declarant_name ?? f.declarant_id}</div>
                <div className="text-[10px] text-muted">{f.declarant_id}</div>
              </td>
              <td><span className="text-xs text-sub">{f.fraud_type?.replace(/_/g,' ')}</span></td>
              <td><span className="text-xs font-bold text-danger">{fmtM(f.tax_evasion_amount ?? f.loss_net)} FCFA</span></td>
              <td><span className="text-xs font-bold text-orange-400">{fmtM(f.penalty_amount ?? 0)} FCFA</span></td>
              <td><span className="text-xs font-bold" style={{ color: f.ai_risk_score >= 70 ? '#ef4444' : '#eab308' }}>{f.ai_risk_score}</span></td>
              <td><div className="text-xs text-sub">{f.office_name ?? f.office_id}</div></td>
              <td><StatusBadge status={f.status} /></td>
            </tr>
          ))}
        />
      </div>

      {/* Scoring Anomalies — moved from Prédictions IA */}
      <FraudAnomalyScoring bureau={filters.bureau} period={filters.period} />
    </div>
  );
}

// Fraud anomaly scoring sub-component (uses /api/advanced/fraud-score)
function FraudAnomalyScoring({ bureau, period }: { bureau: string; period: string }) {
  const qs = [bureau !== 'ALL' && `bureau=${bureau}`, period !== 'ALL' && `period=${period}`].filter(Boolean).join('&');
  const { data, loading, error } = useApi(() =>
    fetch(`/api/advanced/fraud-score${qs ? '?' + qs : ''}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .catch(() => null)
  , [qs]);
  if (loading || error || !data?.top_anomalies?.length) return null;
  const { top_anomalies = [], high_risk = 0 } = data;
  const rc = (s: number) => s >= 70 ? '#ef4444' : s >= 40 ? '#f59e0b' : '#10b981';
  type Anomaly = { sgd_id: string; importer_id: string; importer_name?: string; tariff_code?: string; office_name?: string; office_id?: string; anomaly_score: number; predicted_fraud_prob: number; revenue_at_risk: number; recommended_action?: string };
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <SectionTitle icon="🎯">Scoring Anomalies — Déclarations Prioritaires</SectionTitle>
        <span className="text-xs px-2 py-1 rounded-full font-bold" style={{ background:'rgba(239,68,68,0.15)', color:'#f87171' }}>{high_risk} critiques</span>
      </div>
      <PaginatedTable pageSize={10}
        headers={<tr><th>SGD</th><th>Importateur</th><th>Tarif</th><th>Secteur</th><th>Score</th><th>Prob.</th><th>Revenu à risque</th><th>Action</th></tr>}
        rows={(top_anomalies as Anomaly[]).map(a => (
          <tr key={a.sgd_id}>
            <td><Code>{a.sgd_id}</Code></td>
            <td><div className="text-xs font-semibold text-white">{a.importer_name ?? a.importer_id}</div><div className="text-[10px] text-muted">{a.importer_id}</div></td>
            <td><Code color="#22d3ee">{a.tariff_code ?? '—'}</Code></td>
            <td><span className="text-xs text-muted">{a.office_name ?? a.office_id ?? '—'}</span></td>
            <td><div className="flex items-center gap-1.5"><div className="w-10 h-1.5 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.06)'}}><div className="h-full rounded-full" style={{width:`${a.anomaly_score}%`,background:rc(a.anomaly_score)}}/></div><span className="text-xs font-bold" style={{color:rc(a.anomaly_score)}}>{a.anomaly_score}</span></div></td>
            <td><span className="text-xs font-bold" style={{color:a.predicted_fraud_prob>=0.7?'#f87171':'#fbbf24'}}>{Math.round((a.predicted_fraud_prob??0)*100)}%</span></td>
            <td><span className="text-xs font-bold text-red-400">{fmtM(a.revenue_at_risk ?? 0)} FCFA</span></td>
            <td><span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{background:'rgba(59,130,246,0.15)',color:'#60a5fa'}}>{(a.recommended_action ?? '—').slice(0,20)}</span></td>
          </tr>
        ))}
      />
    </div>
  );
}

// ── Delays Page ───────────────────────────────────────────────────────────────
export function Delays() {
  const { data, loading, error, reload } = useApi(api.delays);
  const { filters } = useFilters();
  if (loading) return <Loading />;
  if (error)   return <ErrorBox message={error} onRetry={reload} />;
  if (!data)   return null;
  const filtered = applyBureauFilter(applyPeriodFilter(data, filters.period), filters.bureau);

  const avgOvershoot = filtered.length > 0 ? Math.round(filtered.reduce((s: number, d: { overshoot_hours: number }) => s + d.overshoot_hours, 0) / filtered.length) : 0;
  const worst = filtered[0];

  return (
    <div className="space-y-5">
      <PageHeader />
      <div className="grid grid-cols-4 gap-2">
        <KPICard compact label="Délais Suspects" value={fmt(filtered.length)} color="danger" />
        <KPICard compact label="Pire Délai" value={worst ? worst.clearance_hours + 'h' : '—'} sub={worst?.sgd_id} color="gold" />
        <KPICard compact label="Dépassement Moyen" value={avgOvershoot + 'h'} color="teal" />
        <KPICard compact label="Secteurs Concernés" value={fmt(new Set(filtered.map((d: { office_id: string }) => d.office_id)).size)} color="accent" />
      </div>
      <div className="card">
        <SectionTitle icon="⏱️">Déclarations avec Délais Anormaux</SectionTitle>
        <PaginatedTable
          pageSize={15}
          headers={<tr><th>SGD</th><th>Importateur</th><th>Secteur</th><th>Pays</th><th>Délai Standard</th><th>Délai Réel</th><th>Dépassement</th><th>Tarif</th><th>Fraude</th></tr>}
          rows={filtered.map((d: { sgd_id: string; office_id: string; office_name?: string; importer_id: string; importer_name?: string; country: string; declared_hours: number; clearance_hours: number; overshoot_hours: number; tariff_code: string; tariff_description?: string; fraud_flag: number }) => (
            <tr key={d.sgd_id}>
              <td><Code>{d.sgd_id}</Code></td>
              <td>
                <div className="text-xs font-semibold text-white">{d.importer_name ?? d.importer_id}</div>
                <div className="text-[10px] text-muted">{d.importer_id}</div>
              </td>
              <td>
                <div className="text-xs">{d.office_name ?? d.office_id}</div>
              </td>
              <td><span className="text-xs">{d.country}</span></td>
              <td><span className="text-xs text-sub">{d.declared_hours}h</span></td>
              <td><span className="text-sm font-bold text-danger">{d.clearance_hours}h</span></td>
              <td>
                <span className="text-sm font-bold" style={{ color: d.overshoot_hours > 72 ? '#ef4444' : '#eab308' }}>+{d.overshoot_hours}h</span>
              </td>
              <td>
                <Code color="#06b6d4">{d.tariff_code}</Code>
                {d.tariff_description && <div className="text-[10px] text-muted mt-0.5">{d.tariff_description.slice(0,20)}</div>}
              </td>
              <td>{(d.fraud_flag === 1 || d.fraud_flag as unknown as string === '1') ? <span className="badge badge-danger text-[10px]">SUSPECT</span> : <span className="badge badge-success text-[10px]">NORMAL</span>}</td>
            </tr>
          ))}
        />
      </div>
      {/* Delay cause classifier — moved from Prédictions IA */}
      <DelaysCausalAnalysis />
    </div>
  );
}

// Delay cause analysis sub-component (uses /api/predictions/advanced)
function DelaysCausalAnalysis() {
  const { filters } = useFilters();
  const advQs = [filters.bureau !== 'ALL' && `bureau=${filters.bureau}`, filters.period !== 'ALL' && `period=${filters.period}`].filter(Boolean).join('&');
  const { data } = useApi(() =>
    Promise.race([
      fetch(`/api/predictions/advanced${advQs ? '?' + advQs : ''}`).then(r => r.json()),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 8000)),
    ])
  , [advQs]);
  if (!data) return null;
  const { delay_causes = [], fraud_velocity, bureau_trajectories } = data as {
    delay_causes?: DelayCause[];
    fraud_velocity?: { velocity_index: number; status: string; trend: string };
    bureau_trajectories?: BureauTraj[];
  };
  if (!delay_causes.length && !bureau_trajectories?.length) return null;

  type DelayCause = { sgd_id: string; office_id: string; office_name?: string; importer_id: string; importer_name?: string; overshoot: number; cause: string; cause_label: string; confidence: number; action: string };
  type BureauTraj = { office_id: string; name: string; trend: string; momentum_score: number; forecast_next: number; period_revenues: number[]; alert?: string };

  const CAUSE_COLOR: Record<string,string> = { INTENTIONAL:'#ef4444', DOCUMENT_ISSUE:'#f59e0b', INSPECTION_BACKLOG:'#3b82f6', SYSTEM_ERROR:'#a78bfa', NORMAL:'#10b981' };
  const TREND_COLOR: Record<string,string> = { RISING:'#10b981', STABLE:'#3b82f6', DECLINING:'#ef4444' };

  const byCause = (delay_causes as DelayCause[]).reduce<Record<string,number>>((a,d)=>{a[d.cause]=(a[d.cause]??0)+1;return a;},{});
  const causeData = Object.entries(byCause).map(([cause,count])=>({cause,label:{INTENTIONAL:'Intentionnel',DOCUMENT_ISSUE:'Document',INSPECTION_BACKLOG:'Congestion',SYSTEM_ERROR:'Système',NORMAL:'Normal'}[cause]??cause,count,color:CAUSE_COLOR[cause]??'#64748b'}));

  return (
    <>
      {/* Cause classifier */}
      {delay_causes.length > 0 && (
        <div className="card">
          <SectionTitle icon="🔍">Classificateur de Causes — Délais de Dédouanement</SectionTitle>
          <p className="text-xs text-muted mb-4">Classification des causes de retard · <span style={{color:'#ef4444'}}>Rouge = intentionnel suspect</span></p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            {causeData.map(c => (
              <div key={c.cause} className="card-sm text-center" style={{borderColor:c.color+'33'}}>
                <div className="text-xl font-black" style={{color:c.color}}>{c.count}</div>
                <div className="text-xs text-muted mt-0.5">{c.label}</div>
              </div>
            ))}
          </div>
          <PaginatedTable
            pageSize={15}
            headers={<tr><th>SGD</th><th>Secteur</th><th>Importateur</th><th>Cause</th><th>Dépassement</th><th>Confiance</th><th>Action recommandée</th></tr>}
            rows={(delay_causes as DelayCause[]).map((d: DelayCause) => (
              <tr key={d.sgd_id} style={{background:d.cause==='INTENTIONAL'?'rgba(239,68,68,0.04)':undefined}}>
                <td><Code>{d.sgd_id}</Code></td>
                <td><span className="text-xs text-muted">{d.office_name ?? d.office_id}</span></td>
                <td><span className="text-xs text-white">{d.importer_name ?? d.importer_id}</span></td>
                <td><span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background:(CAUSE_COLOR[d.cause]??'#64748b')+'18',color:CAUSE_COLOR[d.cause]??'#64748b'}}>{d.cause_label}</span></td>
                <td><span className="text-xs font-bold" style={{color:d.overshoot>72?'#ef4444':'#f59e0b'}}>+{Math.round(d.overshoot)}h</span></td>
                <td><span className="text-xs" style={{color:d.confidence>=80?'#10b981':'#f59e0b'}}>{d.confidence}%</span></td>
                <td><span className="text-[10px] text-slate-400">{d.action}</span></td>
              </tr>
            ))}
          />
        </div>
      )}

      {/* Bureau trajectories — moved from Prédictions IA */}
      {bureau_trajectories && bureau_trajectories.length > 0 && (
        <div className="card">
          <SectionTitle icon="🏛️">Trajectoire des Secteurs — Tendance Recettes</SectionTitle>
          {fraud_velocity && (
            <div className="mb-4 p-3 rounded-xl text-xs flex items-center gap-3" style={{background:'rgba(59,130,246,0.06)',border:'1px solid rgba(59,130,246,0.15)'}}>
              <span>⚡ Vélocité fraude:</span>
              <span className="font-bold" style={{color:fraud_velocity.status==='CRITICAL'?'#ef4444':fraud_velocity.status==='WARNING'?'#f59e0b':'#10b981'}}>{fraud_velocity.velocity_index}</span>
              <span className="text-muted">({fraud_velocity.status})</span>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(bureau_trajectories as BureauTraj[]).map((t: BureauTraj) => (
              <div key={t.office_id} className="card-sm" style={{borderColor:(TREND_COLOR[t.trend]??'#64748b')+'33'}}>
                <div className="text-xs font-semibold text-white mb-1">{t.name}</div>
                <div className="flex items-center justify-between">
                  <span className="text-lg" style={{color:TREND_COLOR[t.trend]??'#64748b'}}>{t.trend==='RISING'?'📈':t.trend==='DECLINING'?'📉':'➡️'}</span>
                  <span className="text-xs font-bold" style={{color:TREND_COLOR[t.trend]??'#64748b'}}>{t.momentum_score>0?'+':''}{t.momentum_score}%</span>
                </div>
                <div className="text-[10px] text-muted mt-1">Prévision: <span className="text-white font-semibold">{fmtM(t.forecast_next)} FCFA</span></div>
                {t.alert && <div className="text-[9px] mt-1.5 text-red-400">⚠️ {t.alert.slice(0,40)}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Offices Page ──────────────────────────────────────────────────────────────
export function Offices() {
  const { data, loading, error, reload } = useApi(api.offices);
  const { filters } = useFilters();
  if (loading) return <Loading />;
  if (error)   return <ErrorBox message={error} onRetry={reload} />;
  if (!data)   return null;

  const filteredOffices = filters.bureau === 'ALL' ? data : data.filter((o: { office_id: string }) => o.office_id === filters.bureau);
  const sorted = [...filteredOffices].sort((a: { efficiency_score: number }, b: { efficiency_score: number }) => b.efficiency_score - a.efficiency_score);

  return (
    <div className="space-y-5">
      <PageHeader />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard label="Secteurs Actifs" value={fmt(filteredOffices.length)} color="accent" />
        <KPICard label="Total Recettes" value={fmtM(filteredOffices.reduce((s: number, o: { total_revenue: number }) => s + o.total_revenue, 0)) + ' FCFA'} color="success" />
        <KPICard label="Meilleure Efficacité" value={filteredOffices.length ? Math.max(...filteredOffices.map((o: { efficiency_score: number }) => o.efficiency_score)) + '%' : '—'} color="teal" />
        <KPICard label="Total SGDs" value={fmt(filteredOffices.reduce((s: number, o: { total_sgds: number }) => s + o.total_sgds, 0))} color="gold" />
      </div>
      <div className="card">
        <SectionTitle icon="🏛️">Classement Secteurs Douaniers</SectionTitle>
        <table className="tbl">
          <thead><tr><th>#</th><th>Secteur</th><th>SGDs</th><th>% Trafic</th><th>Recettes</th><th>Délai Moy.</th><th>Fraudes</th><th>Efficacité</th></tr></thead>
          <tbody>
            {sorted.map((o, i) => (
              <tr key={o.office_id}>
                <td><span className="text-xs font-bold text-muted">{i + 1}</span></td>
                <td>
                  <div className="text-sm font-semibold text-white">{o.name}</div>
                  <div className="text-xs text-muted">{o.office_id}</div>
                </td>
                <td><span className="text-sm font-bold">{fmt(o.total_sgds)}</span></td>
                <td><span className="text-sm text-sub">{o.pct_of_total}%</span></td>
                <td><span className="text-sm font-semibold">{fmtM(o.total_revenue)}</span></td>
                <td><span className="text-sm">{o.avg_clearance_hours}h</span></td>
                <td><span className="text-sm font-bold text-danger">{o.fraud_cases}</span></td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="w-16 gauge-track"><div className="gauge-fill h-1.5" style={{ width: `${o.efficiency_score}%`, background: '#10b981' }} /></div>
                    <span className="text-xs font-bold text-success">{o.efficiency_score}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── AI Recommendations Page ───────────────────────────────────────────────────
export function AIPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ q: string; time: string }[]>([]);

  const SUGGESTIONS = [
    'Pourquoi les recettes ont baissé ce mois ?',
    'Analyser les fraudes détectées',
    'Quels importateurs sont les plus risqués ?',
    'Pattern suspect sur Douala Port',
    'Recommandations pour Kribi',
  ];

  const ask = async (q?: string) => {
    const userQ = q ?? query;
    if (!userQ.trim()) return;
    setLoading(true); setResult(null); setError(null);
    try {
      const res = await api.ai(userQ);
      setResult(res);
      setHistory(h => [{ q: userQ, time: new Date().toLocaleTimeString('fr-FR') }, ...h.slice(0, 4)]);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
    setQuery('');
  };

  const riskColors: Record<string, string> = {
    'CRITIQUE': '#ef4444', 'ÉLEVÉ': '#f97316', 'MOYEN': '#eab308', 'FAIBLE': '#10b981'
  };

  return (
    <div className="space-y-5">
      <PageHeader />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard label="Modèle IA" value="Claude Sonnet" sub="API Anthropic" color="accent" />
        <KPICard label="Données Source" value="Google Sheets" sub="Live · 5min cache" color="teal" />
        <KPICard label="Requêtes Session" value={fmt(history.length)} color="gold" />
        <KPICard label="Disponibilité" value="99.9%" sub="Moteur opérationnel" color="success" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        <div className="card xl:col-span-3 space-y-4">
          <SectionTitle icon="🤖">Assistant CUSTOMS360 — Analyse contextuelle</SectionTitle>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && ask()}
              placeholder="Posez votre question douanière…"
              disabled={loading}
            />
            <button className="btn btn-primary px-5" onClick={() => ask()} disabled={loading || !query.trim()}>
              {loading ? 'Analyse…' : 'Analyser ↗'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => ask(s)} className="btn btn-ghost text-xs py-1">
                {s}
              </button>
            ))}
          </div>

          {loading && (
            <div className="bg-surface2 border border-border rounded-xl p-4 flex items-center gap-2 text-sub text-sm">
              🔍 Analyse en cours
              <span className="dot-anim"><span>.</span><span>.</span><span>.</span></span>
            </div>
          )}

          {error && <div className="text-danger text-sm bg-red-950/30 border border-red-900 rounded-xl p-4">{error}</div>}

          {result && (
            <div className="bg-surface2 border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-muted">Bureau: <span className="text-white font-semibold">{result.bureau_concerne}</span></span>
                <span className="text-xs text-muted">Indicateur: <span className="text-white font-semibold">{result.indicateur_cle}</span></span>
                <span className="ml-auto text-xs font-bold" style={{ color: riskColors[result.niveau_risque] ?? '#94a3b8' }}>
                  ⚡ {result.niveau_risque}
                </span>
              </div>
              <p className="text-sm text-white leading-relaxed">{result.analyse}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-muted font-semibold uppercase tracking-wide mb-2">Causes identifiées</div>
                  {result.causes.map((c, i) => (
                    <div key={i} className="flex gap-2 mb-2">
                      <span className="text-danger mt-0.5 flex-shrink-0">▶</span>
                      <span className="text-sm text-sub leading-relaxed">{c}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-xs text-muted font-semibold uppercase tracking-wide mb-2">Actions recommandées</div>
                  {result.actions.map((a, i) => (
                    <div key={i} className="flex gap-2 mb-2">
                      <span className="text-success mt-0.5 flex-shrink-0">✓</span>
                      <span className="text-sm text-sub leading-relaxed">{a}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <SectionTitle icon="📜">Historique</SectionTitle>
          {history.length === 0
            ? <p className="text-xs text-muted text-center py-6">Aucune analyse encore.</p>
            : history.map((h, i) => (
                <div key={i} className="border-b border-border py-2 last:border-0">
                  <div className="text-[10px] text-muted">{h.time}</div>
                  <div className="text-xs text-sub mt-0.5 leading-relaxed">{h.q}</div>
                </div>
              ))
          }
        </div>
      </div>
      {/* IA Recommendations engine */}
      <AIEngineRecommendations />
    </div>
  );
}

// Recommendations from /api/advanced/recommendations
function AIEngineRecommendations() {
  const { data, loading } = useApi(() => fetch('/api/advanced/recommendations').then(r => r.json()));
  if (loading || !data?.recommendations?.length) return null;
  type Rec = { priority: number; category: string; title: string; description: string; impact: string; action: string; entities: string[] };
  const IMPACT_COLOR: Record<string,string> = { Critique:'#ef4444', Haut:'#f97316', Élevé:'#f59e0b', Moyen:'#3b82f6' };
  const CAT_COLOR: Record<string,string> = { INSPECTION:'#ef4444', 'INTÉGRITÉ':'#a78bfa', CIBLAGE:'#f59e0b', 'EFFICACITÉ':'#3b82f6', RECOUVREMENT:'#10b981' };
  return (
    <div className="space-y-4">
      <SectionTitle icon="💡">Recommandations IA — Actions Prioritaires</SectionTitle>
      {(data.recommendations as Rec[]).map((rec: Rec, i: number) => (
        <div key={i} className="card" style={{ borderLeft:`3px solid ${IMPACT_COLOR[rec.impact]??'#64748b'}` }}>
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0" style={{ background:(IMPACT_COLOR[rec.impact]??'#64748b')+'22', color:IMPACT_COLOR[rec.impact]??'#64748b' }}>{rec.priority}</div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-sm font-bold text-white">{rec.title}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background:(CAT_COLOR[rec.category]??'#64748b')+'22', color:CAT_COLOR[rec.category]??'#64748b', border:`1px solid ${(CAT_COLOR[rec.category]??'#64748b')}44` }}>{rec.category}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto" style={{ background:(IMPACT_COLOR[rec.impact]??'#64748b')+'22', color:IMPACT_COLOR[rec.impact]??'#64748b' }}>Impact: {rec.impact}</span>
              </div>
              <p className="text-xs text-sub mb-1.5">{rec.description}</p>
              <p className="text-xs font-semibold" style={{ color:IMPACT_COLOR[rec.impact]??'#64748b' }}>→ {rec.action}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {rec.entities.map((e: string, j: number) => <span key={j} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', color:'#94a3b8' }}>{e}</span>)}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Graph DATE Page ───────────────────────────────────────────────────────────
export function GraphPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { data, loading, error } = useApi(api.graph);
  const stateRef = useRef<{ nodes: { id: string; x: number; y: number; type: string; risk: number; fraud?: boolean; label: string }[]; links: { source: string; target: string; fraud: boolean }[]; dragging: { id: string; x: number; y: number; type: string; risk: number; fraud?: boolean; label: string } | null; offset: { x: number; y: number } }>({ nodes: [], links: [], dragging: null, offset: { x: 0, y: 0 } });

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    const cv = canvasRef.current;
    const ctx = cv.getContext('2d')!;
    const W = cv.parentElement!.clientWidth;
    const H = 480;
    cv.width = W; cv.height = H;

    const typeColor: Record<string, string> = {
      importer: '#3b82f6', declarant: '#10b981', sgd: '#8b5cf6', office: '#f59e0b'
    };
    const typeRadius: Record<string, number> = { importer: 18, declarant: 14, sgd: 10, office: 20 };
    const nodeMap = (data.nodes as { id: string; type: string; risk: number; fraud?: boolean; label: string }[]).reduce<Record<string, { id: string; type: string; risk: number; fraud?: boolean; label: string }>>((m, n) => { m[n.id] = n; return m; }, {});

    if (stateRef.current.nodes.length === 0) {
      const cx = W / 2, cy = H / 2, r = Math.min(W, H) * 0.32;
      const importers = (data.nodes as { id: string; type: string; risk: number; fraud?: boolean; label: string }[]).filter(n => n.type === 'importer');
      const others    = (data.nodes as { id: string; type: string; risk: number; fraud?: boolean; label: string }[]).filter(n => n.type !== 'importer');
      stateRef.current.nodes = [
        ...importers.map((n, i) => {
          const a = (i / importers.length) * Math.PI * 2;
          return { ...n, x: cx + Math.cos(a) * r * 0.6, y: cy + Math.sin(a) * r * 0.6 };
        }),
        ...others.map((n, i) => {
          const a = (i / others.length) * Math.PI * 2 + 0.5;
          return { ...n, x: cx + Math.cos(a) * r * 1.1, y: cy + Math.sin(a) * r * 1.1 };
        }),
      ];
      stateRef.current.links = data.links as { source: string; target: string; fraud: boolean }[];
    }

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#111827'; ctx.fillRect(0, 0, W, H);
      const pos: Record<string, { x: number; y: number }> = {};
      stateRef.current.nodes.forEach(n => { pos[n.id] = { x: n.x, y: n.y }; });
      stateRef.current.links.forEach(l => {
        const a = pos[l.source], b = pos[l.target];
        if (!a || !b) return;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = l.fraud ? 'rgba(239,68,68,.5)' : 'rgba(148,163,184,.12)';
        ctx.lineWidth = l.fraud ? 2 : 1; ctx.stroke();
      });
      stateRef.current.nodes.forEach(n => {
        const c = n.fraud ? '#ef4444' : (typeColor[n.type] ?? '#64748b');
        const rx = typeRadius[n.type] ?? 12;
        ctx.beginPath(); ctx.arc(n.x, n.y, rx, 0, Math.PI * 2);
        ctx.fillStyle = c + '33'; ctx.fill();
        ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = c; ctx.font = `bold ${n.type === 'sgd' ? 8 : 9}px monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(n.type[0].toUpperCase(), n.x, n.y);
        if (n.type !== 'sgd') {
          ctx.fillStyle = '#94a3b8'; ctx.font = '8px sans-serif';
          ctx.fillText(String(n.label ?? n.id).slice(0, 10), n.x, n.y + rx + 9);
        }
      });
    };
    draw();

    const onDown = (e: MouseEvent) => {
      const rect = cv.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      stateRef.current.nodes.forEach(n => {
        if (Math.hypot(mx - n.x, my - n.y) < (typeRadius[n.type] ?? 12) + 4) {
          stateRef.current.dragging = n;
          stateRef.current.offset = { x: n.x - mx, y: n.y - my };
        }
      });
    };
    const onMove = (e: MouseEvent) => {
      if (!stateRef.current.dragging) return;
      const rect = cv.getBoundingClientRect();
      stateRef.current.dragging.x = e.clientX - rect.left + stateRef.current.offset.x;
      stateRef.current.dragging.y = e.clientY - rect.top + stateRef.current.offset.y;
      draw();
    };
    const onUp = () => { stateRef.current.dragging = null; };
    cv.addEventListener('mousedown', onDown);
    cv.addEventListener('mousemove', onMove);
    cv.addEventListener('mouseup', onUp);
    return () => { cv.removeEventListener('mousedown', onDown); cv.removeEventListener('mousemove', onMove); cv.removeEventListener('mouseup', onUp); };
  }, [data]);

  if (loading) return <Loading />;
  if (error)   return <ErrorBox message={error} />;

  const nodeCount = (data?.nodes as { id: string }[] | undefined)?.length ?? 0;
  const linkCount = (data?.links as { source: string }[] | undefined)?.length ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard label="Nœuds Graph" value={fmt(nodeCount)} color="accent" />
        <KPICard label="Connexions" value={fmt(linkCount)} color="teal" />
        <KPICard label="Nœuds Fraude" value={fmt((data?.nodes as { fraud?: boolean }[] ?? []).filter(n => n.fraud).length)} color="danger" />
        <KPICard label="Algorithme" value="DATE v2" sub="Isolation Forest ready" color="gold" />
      </div>
      <div className="card">
        <div className="flex items-center gap-4 mb-3 flex-wrap">
          <SectionTitle icon="🕸️">Graphe DATE — Réseau Entités Douanières</SectionTitle>
          <div className="ml-auto flex gap-4">
            {[['#3b82f6','Importateur'],['#10b981','Déclarant'],['#8b5cf6','SGD'],['#f59e0b','Secteur'],['#ef4444','Fraude']].map(([c,l]) => (
              <span key={l} className="flex items-center gap-1 text-xs text-sub">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: c }} />{l}
              </span>
            ))}
          </div>
        </div>
        <div className="relative">
          <canvas ref={canvasRef} className="w-full rounded-lg cursor-grab active:cursor-grabbing" style={{ height: 480, display: 'block' }} />
          <div className="absolute bottom-3 left-3 bg-black/60 text-xs text-muted px-2.5 py-1.5 rounded-lg">
            💡 Glissez les nœuds pour explorer
          </div>
        </div>
      </div>
    </div>
  );
}

export default Fraud;
