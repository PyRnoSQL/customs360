import React from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend
} from 'chart.js';
import { useApi } from '../hooks/useApi';
import { api, fmtM, fmt } from '../services/api';
import { KPICard, SectionTitle, Loading, ErrorBox, StatusBadge } from '../components/UI';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function Dashboard() {
  const { data, loading, error, reload } = useApi(api.overview);
  const { data: fraud } = useApi(api.fraud);

  if (loading) return <div className="space-y-4"><div className="grid grid-cols-6 gap-3"><Loading rows={1} /></div><Loading rows={3} /></div>;
  if (error)   return <ErrorBox message={error} onRetry={reload} />;
  if (!data)   return null;

  const chartData = {
    labels: data.monthly_revenue.map(m => m.label),
    datasets: [
      {
        label: 'Prévisions',
        data: data.monthly_revenue.map(m => Math.round(m.expected / 1e6)),
        backgroundColor: 'rgba(59,130,246,0.25)',
        borderColor: '#3b82f6', borderWidth: 1.5, borderRadius: 4,
      },
      {
        label: 'Collectées',
        data: data.monthly_revenue.map(m => Math.round(m.collected / 1e6)),
        backgroundColor: 'rgba(16,185,129,0.3)',
        borderColor: '#10b981', borderWidth: 1.5, borderRadius: 4,
      },
      {
        label: 'Pertes fraude',
        data: data.monthly_revenue.map(m => Math.round(m.lost_fraud / 1e6)),
        backgroundColor: 'rgba(239,68,68,0.3)',
        borderColor: '#ef4444', borderWidth: 1.5, borderRadius: 4,
      },
    ],
  };

  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#64748b', font: { size: 11 } } },
      y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#64748b', font: { size: 11 }, callback: (v: number | string) => v + 'M' } },
    },
  };

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KPICard label="Total SGDs" value={fmt(data.total_sgd)} sub="Déclarations traitées" color="accent" />
        <KPICard label="Recettes collectées" value={fmtM(data.total_revenue) + ' FCFA'} sub="Exercice en cours" color="success" />
        <KPICard label="Fraudes détectées" value={fmt(data.fraud_confirmed)} sub="Cas confirmés" color="danger" />
        <KPICard label="Pertes estimées" value={fmtM(data.revenue_loss) + ' FCFA'} sub="Non recouvré" color="gold" />
        <KPICard label="Importateurs risque" value={fmt(data.high_risk_importers)} sub="Score DATE ≥ 70" color="teal" />
        <KPICard label="Délai moyen" value={data.avg_clearance_hours + 'h'} sub="Dédouanement" color="accent" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="card xl:col-span-2">
          <SectionTitle icon="📈">Analyse des Recettes Mensuelles (MFCFA)</SectionTitle>
          <div className="flex gap-4 mb-3">
            {[['#3b82f6','Prévisions'],['#10b981','Collectées'],['#ef4444','Pertes fraude']].map(([c,l]) => (
              <span key={l} className="flex items-center gap-1.5 text-xs text-sub">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: c }} />{l}
              </span>
            ))}
          </div>
          <div className="relative h-52">
            <Bar data={chartData} options={chartOptions as object} />
          </div>
        </div>

        <div className="card">
          <SectionTitle icon="🗺️">Distribution par Bureau</SectionTitle>
          <div className="space-y-3">
            {data.office_distribution.map(o => (
              <div key={o.office_id}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-sub">{o.name ?? o.office_id}</span>
                  <span className="text-xs font-bold text-white">{o.pct}% · {fmt(o.count)} SGDs</span>
                </div>
                <div className="gauge-track">
                  <div className="gauge-fill" style={{ width: `${o.pct}%`, background: '#3b82f6' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Fraud summary */}
      {fraud && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="card">
            <SectionTitle icon="🚨">Derniers Cas de Fraude</SectionTitle>
            <table className="tbl">
              <thead><tr>
                <th>Cas</th><th>SGD</th><th>Type</th><th>Perte FCFA</th><th>IA Score</th><th>Statut</th>
              </tr></thead>
              <tbody>
                {fraud.cases.slice(0, 8).map(f => (
                  <tr key={f.case_id}>
                    <td><code className="text-teal text-xs">{f.case_id}</code></td>
                    <td><code className="text-accent text-xs">{f.sgd_id}</code></td>
                    <td><span className="text-xs text-sub">{f.fraud_type}</span></td>
                    <td><span className="text-xs font-bold text-danger">{fmtM(f.loss_amount)}</span></td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-12 bg-surface3 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${f.ai_probability}%`, background: f.ai_probability >= 80 ? '#ef4444' : '#eab308' }} />
                        </div>
                        <span className="text-xs font-bold" style={{ color: f.ai_probability >= 80 ? '#ef4444' : '#eab308' }}>{f.ai_probability}%</span>
                      </div>
                    </td>
                    <td><StatusBadge status={f.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <SectionTitle icon="📋">Codes Tarifaires à Risque</SectionTitle>
            <table className="tbl">
              <thead><tr><th>Code SH</th><th>Fraudes</th><th>Taux</th><th>Risque</th></tr></thead>
              <tbody>
                {fraud.tariff_risk.slice(0, 8).map(t => (
                  <tr key={t.tariff_code}>
                    <td><code className="text-teal text-xs">{t.tariff_code}</code></td>
                    <td><span className="text-sm font-bold text-white">{t.fraud_cases}</span></td>
                    <td><span className="text-xs text-sub">{(t.fraud_rate * 100).toFixed(1)}%</span></td>
                    <td><StatusBadge status={t.risk_level} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
