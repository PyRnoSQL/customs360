import React from 'react';
import { riskColor, riskLabel } from '../services/api';

// ── KPI Card ─────────────────────────────────────────────────────────────────
interface KPIProps {
  label: string; value: string; sub?: string; delta?: string; deltaDir?: 'up' | 'down'; color?: string;
}
export const KPICard: React.FC<KPIProps> = ({ label, value, sub, delta, deltaDir, color = 'accent' }) => (
  <div className={`kpi-card ${color}`}>
    <div className="text-xs text-muted font-semibold uppercase tracking-wide mb-2">{label}</div>
    <div className="text-2xl font-bold text-white leading-none">{value}</div>
    {sub && <div className="text-xs text-muted mt-1.5">{sub}</div>}
    {delta && (
      <div className={`text-xs font-semibold mt-1 ${deltaDir === 'up' ? 'text-success' : deltaDir === 'down' ? 'text-danger' : 'text-sub'}`}>
        {delta}
      </div>
    )}
  </div>
);

// ── Risk Badge ────────────────────────────────────────────────────────────────
export const RiskBadge: React.FC<{ score: number; size?: 'sm' | 'md' }> = ({ score, size = 'md' }) => {
  const label = riskLabel(score);
  const cls = score >= 80 ? 'badge-danger' : score >= 60 ? 'badge-warning' : score >= 40 ? 'badge-purple' : 'badge-success';
  return <span className={`badge ${cls} ${size === 'sm' ? 'text-[10px]' : ''}`}>{label}</span>;
};

// ── Status Badge ──────────────────────────────────────────────────────────────
export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, string> = {
    CONFIRMED: 'badge-danger', UNDER_REVIEW: 'badge-purple', SUSPECTED: 'badge-warning',
    CONFIRMED_label: 'CONFIRMÉ', UNDER_REVIEW_label: 'EN RÉVISION', SUSPECTED_label: 'SUSPECTÉ',
    EXCELLENT: 'badge-success', GOOD: 'badge-info', AVERAGE: 'badge-warning', BELOW_AVG: 'badge-danger',
    HIGH: 'badge-danger', MEDIUM: 'badge-warning', LOW: 'badge-success',
  };
  const labelMap: Record<string, string> = {
    CONFIRMED: 'CONFIRMÉ', UNDER_REVIEW: 'EN RÉVISION', SUSPECTED: 'SUSPECTÉ',
    EXCELLENT: 'EXCELLENT', GOOD: 'BON', AVERAGE: 'MOYEN', BELOW_AVG: 'À AMÉLIORER',
    HIGH: 'ÉLEVÉ', MEDIUM: 'MOYEN', LOW: 'FAIBLE',
  };
  return <span className={`badge ${map[status] ?? 'badge-muted'}`}>{labelMap[status] ?? status}</span>;
};

// ── Gauge Bar ─────────────────────────────────────────────────────────────────
export const Gauge: React.FC<{ value: number; color?: string; height?: string }> = ({
  value, color, height = 'h-1.5'
}) => {
  const bg = color ?? riskColor(value);
  return (
    <div className={`gauge-track ${height}`}>
      <div className="gauge-fill" style={{ width: `${Math.min(100, value)}%`, background: bg }} />
    </div>
  );
};

// ── Section title ─────────────────────────────────────────────────────────────
export const SectionTitle: React.FC<{ icon?: string; children: React.ReactNode }> = ({ icon, children }) => (
  <div className="flex items-center gap-2 text-sm font-bold text-white mb-3.5">
    {icon && <span>{icon}</span>}{children}
  </div>
);

// ── Loading skeleton ──────────────────────────────────────────────────────────
export const Loading: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <div className="space-y-3 animate-pulse">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="h-10 bg-surface2 rounded-lg" style={{ opacity: 1 - i * 0.15 }} />
    ))}
  </div>
);

// ── Error box ─────────────────────────────────────────────────────────────────
export const ErrorBox: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div className="card border-red-900 bg-red-950/30 text-red-400 text-sm flex items-center gap-3">
    <span className="text-lg">⚠️</span>
    <div className="flex-1">{message}</div>
    {onRetry && <button onClick={onRetry} className="btn btn-ghost text-xs">Réessayer</button>}
  </div>
);

// ── Empty state ───────────────────────────────────────────────────────────────
export const Empty: React.FC<{ message?: string }> = ({ message = 'Aucune donnée disponible' }) => (
  <div className="text-center py-10 text-muted text-sm">{message}</div>
);

// ── Code chip ─────────────────────────────────────────────────────────────────
export const Code: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = '#06b6d4' }) => (
  <code style={{ color, fontSize: 12, fontFamily: 'monospace' }}>{children}</code>
);
