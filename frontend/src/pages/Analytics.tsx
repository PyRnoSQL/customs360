import React from 'react';
import { useApi } from '../hooks/useApi';
import { PageHeader } from '../App';
import { KPICard, SectionTitle, Loading, ErrorBox } from '../components/UI';
import { fmt, fmtM } from '../services/api';

type Cohort = { label: string; count: number; color: string; avg_risk: number };
type TariffRisk = { tariff_code: string; total_declarations: number; fraud_cases: number; fraud_rate: number; avg_cif: number; risk_level: string };
type TemporalPattern = { day: string; total: number; fraud: number; rate: number };
type CountryAnalysis = { country: string; total: number; fraud: number; revenue: number; fraud_rate: number };

const RISK_LEVEL_COLOR: Record<string, string> = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#10b981' };

export default function Analytics() {
  const { data, loading, error, reload } = useApi(() => fetch('/api/analytics/cohorts').then(r => r.json()));
  if (loading) return <><PageHeader /><Loading rows={5} /></>;
  if (error) return <><PageHeader /><ErrorBox message={error} onRetry={reload} /></>;
  if (!data) return null;

  const { cohorts, tariff_matrix, temporal_patterns, country_analysis } = data;
  const maxDayRate = Math.max(...temporal_patterns.map((d: TemporalPattern) => d.rate), 0.01);
  const maxCountryRev = Math.max(...country_analysis.map((c: CountryAnalysis) => c.revenue), 1);
  const totalDecls = cohorts.reduce((s: number, c: Cohort) => s + c.count, 0);

  return (
    <div className="space-y-5">
      <PageHeader />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard label="Opérateurs analysés" value={fmt(totalDecls)} color="accent" />
        <KPICard label="Codes tarifaires" value={fmt(tariff_matrix.length)} sub="Matrice risque" color="teal" />
        <KPICard label="Pays d'origine" value={fmt(country_analysis.length)} color="gold" />
        <KPICard label="Jour pic fraude" value={temporal_patterns.reduce((best: TemporalPattern, d: TemporalPattern) => d.rate > best.rate ? d : best, temporal_patterns[0])?.day ?? '—'} sub="Taux le plus élevé" color="danger" />
      </div>

      {/* Cohort analysis */}
      <div className="card">
        <SectionTitle icon="👥">Segmentation des Importateurs — Analyse Comportementale</SectionTitle>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
          {cohorts.map((c: Cohort) => (
            <div key={c.label} className="rounded-xl p-4 text-center" style={{ background: c.color + '0f', border: `1px solid ${c.color}33` }}>
              <div className="text-2xl font-black mb-1" style={{ color: c.color }}>{c.count}</div>
              <div className="text-xs font-bold text-white mb-1">{c.label}</div>
              <div className="text-[10px] text-muted">Score moyen: {c.avg_risk}%</div>
              <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: '#1e2d40' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.round(c.count / Math.max(totalDecls, 1) * 100)}%`, background: c.color }} />
              </div>
              <div className="text-[9px] text-muted mt-1">{Math.round(c.count / Math.max(totalDecls, 1) * 100)}% du total</div>
            </div>
          ))}
        </div>
        <div className="rounded-xl p-4" style={{ background: '#0b1221', border: '1px solid #1e3a5f' }}>
          <div className="text-xs font-bold text-muted uppercase tracking-widest mb-2">Recommandation IA</div>
          <p className="text-sm text-slate-300 leading-relaxed">
            <span className="font-bold text-white">{cohorts.find((c: Cohort) => c.label === 'Critique / Fraude')?.count ?? 0} opérateurs critiques</span> nécessitent une surveillance immédiate avec inspection systématique.
            Les <span className="font-bold text-white">{cohorts.find((c: Cohort) => c.label === 'Sous Surveillance')?.count ?? 0} opérateurs sous surveillance</span> requièrent un audit documentaire trimestriel.
            Concentrer 80% des ressources d'inspection sur ces deux segments représentant les risques les plus élevés.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Temporal patterns */}
        <div className="card">
          <SectionTitle icon="📅">Patterns Temporels — Fraude par Jour de la Semaine</SectionTitle>
          <div className="flex items-end gap-2 h-32 mb-2">
            {temporal_patterns.map((d: TemporalPattern) => {
              const h = maxDayRate > 0 ? Math.max(4, Math.round((d.rate / maxDayRate) * 100)) : 4;
              const c = d.rate > 0.2 ? '#ef4444' : d.rate > 0.1 ? '#f59e0b' : '#3b82f6';
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group">
                  <div className="text-[9px] text-muted opacity-0 group-hover:opacity-100">{Math.round(d.rate * 100)}%</div>
                  <div className="w-full rounded-t-sm transition-all" style={{ height: `${h}%`, background: c, minHeight: 4 }} />
                  <div className="text-[10px] text-muted">{d.day}</div>
                  <div className="text-[9px]" style={{ color: c }}>{d.fraud}</div>
                </div>
              );
            })}
          </div>
          <div className="text-[10px] text-muted text-center">Nombre de fraudes détectées par jour · Hauteur = taux relatif</div>
          <div className="mt-3 rounded-lg p-3" style={{ background: '#0b1221', border: '1px solid #1e3a5f' }}>
            <div className="text-[10px] text-muted mb-1">🎯 Insight prédictif</div>
            <div className="text-xs text-slate-300">
              {(() => {
                const peak = temporal_patterns.reduce((b: TemporalPattern, d: TemporalPattern) => d.rate > b.rate ? d : b, temporal_patterns[0]);
                return `Le ${peak?.day ?? '—'} présente le taux de fraude le plus élevé. Recommandé: renforcer les équipes d'inspection ce jour.`;
              })()}
            </div>
          </div>
        </div>

        {/* Tariff risk matrix */}
        <div className="card">
          <SectionTitle icon="🗂️">Matrice Risque — Codes Tarifaires</SectionTitle>
          <table className="tbl">
            <thead><tr><th>Code SH</th><th>Déclarations</th><th>Fraudes</th><th>Taux</th><th>CIF Moy.</th><th>Niveau</th></tr></thead>
            <tbody>
              {tariff_matrix.slice(0, 8).map((t: TariffRisk) => (
                <tr key={t.tariff_code}>
                  <td><code className="text-xs" style={{ color: '#06b6d4' }}>{t.tariff_code}</code></td>
                  <td><span className="text-sm">{fmt(t.total_declarations)}</span></td>
                  <td><span className="text-sm font-bold" style={{ color: t.fraud_cases > 0 ? '#ef4444' : '#10b981' }}>{t.fraud_cases}</span></td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <div className="w-10 h-1.5 rounded-full overflow-hidden" style={{ background: '#1e2d40' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, t.fraud_rate * 100 * 3)}%`, background: RISK_LEVEL_COLOR[t.risk_level] ?? '#3b82f6' }} />
                      </div>
                      <span className="text-xs" style={{ color: RISK_LEVEL_COLOR[t.risk_level] }}>{(t.fraud_rate * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                  <td><span className="text-xs text-muted">{fmtM(t.avg_cif)}</span></td>
                  <td>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: RISK_LEVEL_COLOR[t.risk_level] + '22', color: RISK_LEVEL_COLOR[t.risk_level], border: `1px solid ${RISK_LEVEL_COLOR[t.risk_level]}44` }}>
                      {t.risk_level}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Country analysis */}
      <div className="card">
        <SectionTitle icon="🌍">Analyse Géographique — Flux par Pays d'Origine</SectionTitle>
        <div className="space-y-2">
          {country_analysis.slice(0, 10).map((c: CountryAnalysis) => (
            <div key={c.country} className="flex items-center gap-3">
              <div className="w-10 text-sm font-bold text-white text-right flex-shrink-0">{c.country}</div>
              <div className="flex-1 h-6 rounded-lg overflow-hidden relative" style={{ background: '#0b1221' }}>
                <div className="h-full rounded-lg transition-all"
                  style={{ width: `${Math.round((c.revenue / maxCountryRev) * 100)}%`, background: c.fraud_rate > 0.2 ? '#ef444444' : '#3b82f644', border: `1px solid ${c.fraud_rate > 0.2 ? '#ef4444' : '#3b82f6'}33` }} />
                <div className="absolute inset-0 flex items-center px-2 gap-3">
                  <span className="text-xs text-white font-semibold">{fmt(c.total)} déclarations</span>
                  <span className="text-xs" style={{ color: c.fraud_rate > 0.2 ? '#ef4444' : '#64748b' }}>{c.fraud} fraudes ({(c.fraud_rate * 100).toFixed(1)}%)</span>
                  <span className="ml-auto text-xs font-bold" style={{ color: '#10b981' }}>{fmtM(c.revenue)} FCFA</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
