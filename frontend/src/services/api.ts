import type {
  Overview, ImporterProfile, FraudResponse,
  OfficeStats, DelayRecord, MonthlyRevenue, AIAnalysis
} from '../types';

const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

export const api = {
  overview:   (bureau?: string, period?: string) => {
    const qs = [bureau && bureau !== 'ALL' && `bureau=${bureau}`, period && period !== 'ALL' && `period=${period}`].filter(Boolean).join('&');
    return get<Overview>(`/overview${qs ? '?' + qs : ''}`);
  },
  importers:  ()    => get<ImporterProfile[]>('/importers'),
  importer:   (id: string) => get<ImporterProfile>(`/importers/${id}`),
  fraud:      (bureau?: string, period?: string) => {
    const qs = [bureau && bureau !== 'ALL' && `bureau=${bureau}`, period && period !== 'ALL' && `period=${period}`].filter(Boolean).join('&');
    return get<FraudResponse>(`/fraud${qs ? '?' + qs : ''}`);
  },
  offices:    ()    => get<OfficeStats[]>('/offices'),
  delays:     (bureau?: string, period?: string) => {
    const qs = [bureau && bureau !== 'ALL' && `bureau=${bureau}`, period && period !== 'ALL' && `period=${period}`].filter(Boolean).join('&');
    return get<DelayRecord[]>(`/delays${qs ? '?' + qs : ''}`);
  },
  revenue:    ()    => get<MonthlyRevenue[]>('/revenue'),
  graph:      ()    => get<{ nodes: object[]; links: object[] }>('/graph'),
  ai:         (query: string) => post<AIAnalysis>('/ai', { query }),
  invalidate: ()    => post<{ ok: boolean }>('/cache/invalidate', {}),
};

// ── Formatting helpers ───────────────────────────────────────────────────────
export const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n));
export const fmtM = (n: number) => {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + ' Mrd';
  if (n >= 1e6) return Math.round(n / 1e6) + ' MM';
  return fmt(n);
};
export const riskColor = (s: number) =>
  s >= 80 ? '#ef4444' : s >= 60 ? '#f97316' : s >= 40 ? '#eab308' : '#10b981';
export const riskLabel = (s: number) =>
  s >= 80 ? 'CRITIQUE' : s >= 60 ? 'ÉLEVÉ' : s >= 40 ? 'MOYEN' : 'FAIBLE';
export const statusBadge = (s: string) => {
  if (s === 'CONFIRMED')    return 'badge-danger';
  if (s === 'UNDER_REVIEW') return 'badge-purple';
  return 'badge-warning';
};
