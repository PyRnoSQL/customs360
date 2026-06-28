import React from 'react';
import { useApi } from '../hooks/useApi';
import { PageHeader } from '../App';
import { KPICard, SectionTitle, Loading, ErrorBox, Code } from '../components/UI';
import { fmtM, fmt } from '../services/api';

type AnomalyScore = {
  sgd_id: string; importer_id: string; declarant_id: string; office_id: string;
  tariff_code: string; cif_value: number; anomaly_score: number;
  risk_factors: string[]; predicted_fraud_prob: number;
  revenue_at_risk: number; recommended_action: string;
};
type Forecast = { month: string; label: string; actual: number | null; forecast: number; lower_bound: number; upper_bound: number; confidence: number };
type Trajectory = { office_id: string; name: string; trend: string; momentum_score: number; period_revenues: number[]; forecast_next: number; alert: string | null };

const TREND_META: Record<string, { icon: string; color: string; label: string }> = {
  RISING:   { icon: '📈', color: '#10b981', label: 'En hausse'   },
  STABLE:   { icon: '➡️', color: '#3b82f6', label: 'Stable'      },
  DECLINING:{ icon: '📉', color: '#ef4444', label: 'En baisse'   },
};

function ForecastChart({ data }: { data: Forecast[] }) {
  if (!data.length) return null;
  const maxVal = Math.max(...data.map(d => d.upper_bound ?? d.forecast)) || 1;
  const W = 560; const H = 140; const PAD = 40;
  const xScale = (i: number) => PAD + (i / (data.length - 1)) * (W - PAD * 2);
  const yScale = (v: number) => H - PAD - ((v / maxVal) * (H - PAD * 2));

  const actualPts = data.filter(d => d.actual !== null).map((d, i) => `${xScale(i)},${yScale(d.actual!)}`).join(' ');
  const forecastPts = data.map((d, i) => `${xScale(i)},${yScale(d.actual !== null ? d.actual! : d.forecast)}`).join(' ');
  const futurePts  = data.filter(d => d.actual === null);
  const futureStart = data.findIndex(d => d.actual === null);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 20}`} style={{ overflow: 'visible' }}>
      {/* Confidence band */}
      {futurePts.length > 0 && (
        <polygon
          points={[
            ...futurePts.map((d, i) => `${xScale(futureStart + i)},${yScale(d.upper_bound)}`),
            ...[...futurePts].reverse().map((d, i) => `${xScale(futureStart + futurePts.length - 1 - i)},${yScale(d.lower_bound)}`),
          ].join(' ')}
          fill="rgba(59,130,246,0.1)" stroke="none"
        />
      )}
      {/* Actual line */}
      {actualPts && <polyline points={actualPts} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
      {/* Forecast line */}
      {futureStart > 0 && (
        <polyline
          points={data.slice(futureStart - 1).map((d, i) => `${xScale(futureStart - 1 + i)},${yScale(d.actual !== null ? d.actual! : d.forecast)}`).join(' ')}
          fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="6 3" strokeLinecap="round"
        />
      )}
      {/* Dots */}
      {data.map((d, i) => (
        <circle key={i} cx={xScale(i)} cy={yScale(d.actual !== null ? d.actual! : d.forecast)}
          r="4" fill={d.actual !== null ? '#10b981' : '#3b82f6'}
          stroke={d.actual !== null ? '#10b981' : '#1d4ed8'} strokeWidth="1.5" />
      ))}
      {/* Labels */}
      {data.map((d, i) => (
        <text key={i} x={xScale(i)} y={H + 14} textAnchor="middle" fontSize="9" fill="#64748b">{d.label}</text>
      ))}
      {/* Divider at forecast start */}
      {futureStart > 0 && (
        <line x1={xScale(futureStart)} y1={PAD / 2} x2={xScale(futureStart)} y2={H - PAD / 2}
          stroke="#1e3a5f" strokeWidth="1" strokeDasharray="4 2" />
      )}
      {futureStart > 0 && (
        <text x={xScale(futureStart) + 4} y={PAD} fontSize="8" fill="#3b82f6">Prévision →</text>
      )}
    </svg>
  );
}

export default function Predictions() {
  const { data, loading, error, reload } = useApi(() => fetch('/api/predictions').then(r => r.json()));
  if (loading) return <><PageHeader /><Loading rows={5} /></>;
  if (error) return <><PageHeader /><ErrorBox message={error} onRetry={reload} /></>;
  if (!data) return null;

  const { declaration_anomalies: anomalies, revenue_forecast: forecast, bureau_trajectories: trajectories,
    total_revenue_at_risk: atRisk, high_anomaly_count: highCount, forecast_shortfall: shortfall } = data;

  const actionColor = (a: string) => a.includes('immédiate') ? '#ef4444' : a.includes('prioritaire') ? '#f59e0b' : '#3b82f6';

  return (
    <div className="space-y-5">
      <PageHeader />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard label="Déclarations Anomalies" value={fmt(highCount)} sub="Score ≥ 60" color="danger" />
        <KPICard label="Revenus à Risque" value={fmtM(atRisk) + ' FCFA'} sub="Estimation ML" color="gold" />
        <KPICard label="Déficit Prévisionnel" value={shortfall > 0 ? fmtM(shortfall) + ' FCFA' : 'Stable'} sub="Prochain mois" color={shortfall > 0 ? 'danger' : 'success'} />
        <KPICard label="Trajectoires Déclinantes" value={fmt(trajectories.filter((t: Trajectory) => t.trend === 'DECLINING').length)} sub="Bureaux" color="teal" />
      </div>

      {/* Revenue forecast */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <SectionTitle icon="📈">Prévision des Recettes — Horizon 3 Mois</SectionTitle>
          <div className="flex gap-4">
            {[['#10b981','Réalisé'],['#3b82f6','Prévision'],['rgba(59,130,246,0.15)','Intervalle confiance']].map(([c,l])=>(
              <span key={l} className="flex items-center gap-1.5 text-xs text-sub">
                <span className="w-6 h-2 rounded inline-block" style={{ background: c }} />{l}
              </span>
            ))}
          </div>
        </div>
        <ForecastChart data={forecast} />
      </div>

      {/* Bureau trajectories */}
      <div className="card">
        <SectionTitle icon="🏛️">Trajectoire des Bureaux Douaniers</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {trajectories.map((t: Trajectory) => {
            const tm = TREND_META[t.trend] ?? TREND_META.STABLE;
            const maxRev = Math.max(...t.period_revenues, 1);
            return (
              <div key={t.office_id} className="rounded-xl p-4" style={{ background: '#0b1221', border: `1px solid ${tm.color}33` }}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-sm font-bold text-white leading-tight">{t.name}</div>
                    <div className="text-[10px] text-muted">{t.office_id}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg">{tm.icon}</div>
                    <div className="text-[10px] font-bold" style={{ color: tm.color }}>{tm.label}</div>
                    <div className="text-[9px] text-muted">{t.momentum_score > 0 ? '+' : ''}{t.momentum_score}%</div>
                  </div>
                </div>
                {/* Mini bar chart */}
                <div className="flex items-end gap-1 h-10 mb-2">
                  {t.period_revenues.map((v: number, i: number) => (
                    <div key={i} className="flex-1 rounded-t-sm" style={{ height: `${Math.round((v / maxRev) * 100)}%`, minHeight: 3, background: i === t.period_revenues.length - 1 ? tm.color : tm.color + '44' }} />
                  ))}
                </div>
                <div className="text-xs text-muted mb-1">Prévision prochaine période: <span className="font-bold text-white">{fmtM(t.forecast_next)} FCFA</span></div>
                {t.alert && (
                  <div className="text-[10px] px-2 py-1 rounded" style={{ background: '#450a0a', color: '#f87171', border: '1px solid #7f1d1d' }}>⚠ {t.alert}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Anomaly scores */}
      <div className="card">
        <SectionTitle icon="🎯">Scoring Anomalies — Top 20 Déclarations à Risque</SectionTitle>
        <table className="tbl">
          <thead><tr><th>SGD</th><th>Importateur</th><th>Tarif</th><th>Bureau</th><th>Score Anomalie</th><th>Proba. Fraude</th><th>Revenu à Risque</th><th>Facteurs</th><th>Action</th></tr></thead>
          <tbody>
            {anomalies.slice(0, 20).map((a: AnomalyScore) => (
              <tr key={a.sgd_id}>
                <td><Code>{a.sgd_id}</Code></td>
                <td><span className="text-xs">{a.importer_id}</span></td>
                <td><Code color="#06b6d4">{a.tariff_code}</Code></td>
                <td><span className="text-xs text-muted">{a.office_id}</span></td>
                <td>
                  <div className="flex items-center gap-1.5">
                    <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: '#1e2d40' }}>
                      <div className="h-full rounded-full" style={{ width: `${a.anomaly_score}%`, background: a.anomaly_score >= 70 ? '#ef4444' : a.anomaly_score >= 45 ? '#f59e0b' : '#3b82f6' }} />
                    </div>
                    <span className="text-xs font-bold" style={{ color: a.anomaly_score >= 70 ? '#ef4444' : a.anomaly_score >= 45 ? '#f59e0b' : '#3b82f6' }}>{a.anomaly_score}</span>
                  </div>
                </td>
                <td><span className="text-xs font-bold" style={{ color: a.predicted_fraud_prob >= 0.7 ? '#ef4444' : '#f59e0b' }}>{Math.round(a.predicted_fraud_prob * 100)}%</span></td>
                <td><span className="text-xs font-bold text-danger">{fmtM(a.revenue_at_risk)} FCFA</span></td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {a.risk_factors.slice(0, 2).map(f => (
                      <span key={f} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: '#1e1000', color: '#fbbf24', border: '1px solid #78350f' }}>{f.slice(0, 22)}…</span>
                    ))}
                  </div>
                </td>
                <td>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: actionColor(a.recommended_action) + '22', color: actionColor(a.recommended_action), border: `1px solid ${actionColor(a.recommended_action)}44` }}>
                    {a.recommended_action}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
