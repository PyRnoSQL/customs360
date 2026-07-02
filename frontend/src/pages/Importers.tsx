import { useFilters, applyBureauFilter, applyRiskFilter } from '../context/FilterContext';
import React, { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { PageHeader } from '../App';
import { api, fmtM, fmt, riskColor } from '../services/api';
import { KPICard, RiskBadge, Gauge, SectionTitle, Loading, ErrorBox, Code } from '../components/UI';
import type { ImporterProfile } from '../types';

function ImporterDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, loading, error } = useApi(() => api.importer(id), [id]);
  if (loading) return <Loading />;
  if (error)   return <ErrorBox message={error} />;
  if (!data)   return null;

  const triggeredFactors = data.date_factors.filter(f => f.triggered);
  const dateScore = triggeredFactors.reduce((s, f) => s + f.weight, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="btn btn-ghost text-xs">← Retour</button>
        <span className="text-sm font-bold text-white">Profil 360° — {data.importer_id}</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="card">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-lg font-bold text-white">{data.importer_id}</div>
              {data.name && <div className="text-sm text-sub mt-0.5">{data.name}</div>}
              <div className="text-xs text-muted mt-1">{data.countries.join(', ')} · {data.offices.join(', ')}</div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black" style={{ color: riskColor(data.risk_score) }}>{data.risk_score}%</div>
              <RiskBadge score={data.risk_score} />
            </div>
          </div>
          <Gauge value={data.risk_score} height="h-2" />
          <div className="mt-4 space-y-2.5">
            {[
              ['Total déclarations', fmt(data.total_declarations) + ' SGDs'],
              ['Valeur CIF totale', fmtM(data.total_cif_value) + ' FCFA'],
              ['Recettes collectées', fmtM(data.total_revenue) + ' FCFA'],
              ['Cas de fraude', data.fraud_cases + ' cas'],
              ['Taux suspicion', (data.fraud_rate * 100).toFixed(1) + '%'],
              ['Déclarants uniques', data.unique_declarants.length + ' déclarants'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between items-center border-b border-border pb-2">
                <span className="text-xs text-muted">{k}</span>
                <span className="text-sm font-semibold text-white">{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <SectionTitle icon="🧠">Algorithme DATE — Facteurs de Risque</SectionTitle>
          <div className="mb-3 text-xs text-muted">Score composite: <span className="font-bold text-white">{Math.min(99, dateScore)}/99</span></div>
          {data.date_factors.map(f => (
            <div key={f.label} className={`mb-3 ${!f.triggered ? 'opacity-40' : ''}`}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-sub flex items-center gap-1.5">
                  <span>{f.triggered ? '🔴' : '⚪'}</span>{f.label}
                </span>
                <span className="text-xs font-bold" style={{ color: f.triggered ? (f.weight >= 30 ? '#ef4444' : '#f59e0b') : '#64748b' }}>
                  {f.triggered ? '+' : ''}{f.weight}
                </span>
              </div>
              {f.triggered && <Gauge value={f.weight} color={f.weight >= 30 ? '#ef4444' : '#f59e0b'} />}
            </div>
          ))}
        </div>
      </div>

      {data.recent_sgds && data.recent_sgds.length > 0 && (
        <div className="card">
          <SectionTitle icon="📄">SGDs Récents</SectionTitle>
          <table className="tbl">
            <thead><tr><th>SGD</th><th>Date</th><th>Bureau</th><th>CIF</th><th>Délai</th><th>Fraude</th></tr></thead>
            <tbody>
              {data.recent_sgds.slice(0, 12).map(s => (
                <tr key={s.sgd_id}>
                  <td><Code>{s.sgd_id}</Code></td>
                  <td><span className="text-xs text-sub">{s.date}</span></td>
                  <td><span className="text-xs">{s.office_id}</span></td>
                  <td><span className="text-sm font-semibold">{fmtM(s.cif_value)}</span></td>
                  <td><span className="text-xs">{s.clearance_hours}h</span></td>
                  <td>{(s.fraud_flag === 1 || s.fraud_flag === '1') ? <span className="badge badge-danger text-[10px]">SUSPECT</span> : <span className="badge badge-success text-[10px]">NORMAL</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Importers() {
  const { data, loading, error, reload } = useApi(api.importers);
  const { filters } = useFilters();
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  if (selected) return <ImporterDetail id={selected} onBack={() => setSelected(null)} />;
  if (loading) return <Loading />;
  if (error)   return <ErrorBox message={error} onRetry={reload} />;
  if (!data)   return null;

  const filtered = applyRiskFilter(
    filters.bureau === 'ALL'
      ? data
      : data.filter((i: ImporterProfile) => i.offices && i.offices.includes(filters.bureau)),
    filters.risk
  ).filter((i: ImporterProfile) => i.importer_id.toLowerCase().includes(search.toLowerCase()));
  const highRisk = data.filter((i: ImporterProfile) => i.risk_score >= 70).length;

  return (
    <div className="space-y-5">
      <PageHeader />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard label="Total Importateurs" value={fmt(data.length)} color="accent" />
        <KPICard label="Haut Risque (≥70)" value={fmt(highRisk)} color="danger" />
        <KPICard label="Total Fraudes" value={fmt(data.reduce((s: number, i: ImporterProfile) => s + i.fraud_cases, 0))} color="gold" />
        <KPICard label="Importateurs Sains" value={fmt(data.filter((i: ImporterProfile) => i.risk_score < 35).length)} color="success" />
      </div>

      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <SectionTitle icon="🏢">Importateurs — Classement par Score DATE</SectionTitle>
          <input
            className="input ml-auto w-56" placeholder="Rechercher ID importateur…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        <table className="tbl">
          <thead><tr>
            <th>#</th><th>Importateur</th><th>Pays</th><th>Bureaux</th>
            <th>Déclarations</th><th>Valeur CIF</th><th>Score DATE</th><th>Fraudes</th><th></th>
          </tr></thead>
          <tbody>
            {filtered.map((imp: ImporterProfile, i: number) => (
              <tr key={imp.importer_id}>
                <td><span className="text-muted text-xs font-bold">{i + 1}</span></td>
                <td>
                  <div className="text-sm font-semibold text-white">{imp.importer_id}</div>
                  <div className="text-xs text-muted">{imp.unique_declarants.length} déclarant(s)</div>
                </td>
                <td><span className="text-sm">{imp.countries.slice(0, 2).join(', ')}</span></td>
                <td><span className="text-xs text-sub">{imp.offices.join(', ')}</span></td>
                <td><span className="text-sm font-semibold">{fmt(imp.total_declarations)}</span></td>
                <td><span className="text-sm font-semibold">{fmtM(imp.total_cif_value)}</span></td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="w-16 gauge-track"><div className="gauge-fill h-1.5" style={{ width: `${imp.risk_score}%`, background: riskColor(imp.risk_score) }} /></div>
                    <span className="text-xs font-bold min-w-[28px]" style={{ color: riskColor(imp.risk_score) }}>{imp.risk_score}%</span>
                  </div>
                </td>
                <td><span className={`text-sm font-bold ${imp.fraud_cases > 0 ? 'text-danger' : 'text-success'}`}>{imp.fraud_cases}</span></td>
                <td><button onClick={() => setSelected(imp.importer_id)} className="btn btn-primary text-xs py-1 px-3">Voir 360°</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
