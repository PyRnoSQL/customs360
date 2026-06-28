import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFilters, BureauFilter, RiskFilter, PeriodFilter, StatusFilter } from '../context/FilterContext';
import { useLocation } from 'react-router-dom';

const BUREAUX: { value: BureauFilter; label: string; icon: string }[] = [
  { value: 'ALL',    label: 'Tous les bureaux', icon: '🌐' },
  { value: 'DLA001', label: 'Douala Port',       icon: '🚢' },
  { value: 'KBI001', label: 'Kribi Port',        icon: '⚓' },
  { value: 'DLA002', label: 'Douala Aéroport',   icon: '✈️' },
  { value: 'YDE001', label: 'Yaoundé Airport',   icon: '🛫' },
];

const PERIODS: { value: PeriodFilter; label: string }[] = [
  { value: 'ALL',     label: 'Toute période' },
  { value: '2025-08', label: 'Août 25'  },
  { value: '2025-09', label: 'Sep 25'   },
  { value: '2025-10', label: 'Oct 25'   },
  { value: '2025-11', label: 'Nov 25'   },
  { value: '2025-12', label: 'Déc 25'   },
  { value: '2026-01', label: 'Jan 26'   },
  { value: '2026-02', label: 'Fév 26'   },
];

const RISKS: { value: RiskFilter; label: string; color: string }[] = [
  { value: 'ALL',      label: 'Tous niveaux', color: '#64748b' },
  { value: 'CRITIQUE', label: 'Critique',     color: '#ef4444' },
  { value: 'ELEVE',    label: 'Élevé',        color: '#f97316' },
  { value: 'MOYEN',    label: 'Moyen',        color: '#eab308' },
  { value: 'FAIBLE',   label: 'Faible',       color: '#10b981' },
];

const STATUSES: { value: StatusFilter; label: string; color: string }[] = [
  { value: 'ALL',          label: 'Tous statuts', color: '#64748b' },
  { value: 'CONFIRMED',    label: 'Confirmé',     color: '#ef4444' },
  { value: 'UNDER_REVIEW', label: 'En révision',  color: '#a78bfa' },
  { value: 'SUSPECTED',    label: 'Suspecté',     color: '#f59e0b' },
];

// Which filters are relevant per page
const PAGE_FILTERS: Record<string, (keyof ReturnType<typeof useFilters>['filters'])[]> = {
  '/':            ['bureau', 'period'],
  '/importers':   ['bureau', 'risk'],
  '/fraud':       ['bureau', 'period', 'status'],
  '/delays':      ['bureau', 'period'],
  '/offices':     ['bureau'],
  '/predictions': ['bureau', 'period', 'risk'],
  '/analytics':   ['bureau', 'period', 'risk'],
  '/officers':    ['bureau', 'risk'],
  '/welcome':     [],
  '/ai':          [],
  '/graph':       [],
};

function FilterChip<T extends string>({
  value, active, label, color, onClick,
}: { value: T; active: boolean; label: string; color?: string; onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 whitespace-nowrap"
      style={{
        background: active ? (color ? `${color}22` : 'rgba(59,130,246,0.15)') : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? (color ?? '#3b82f6') : 'rgba(255,255,255,0.08)'}`,
        color: active ? (color ?? '#60a5fa') : '#64748b',
        boxShadow: active ? `0 0 12px ${(color ?? '#3b82f6')}33` : 'none',
      }}
    >
      {active && (
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-1.5 h-1.5 rounded-full"
          style={{ background: color ?? '#3b82f6' }} />
      )}
      {label}
    </motion.button>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <span className="text-[10px] font-bold tracking-widest uppercase whitespace-nowrap"
        style={{ color: '#334155' }}>{title}</span>
      <div className="flex items-center gap-1.5 flex-wrap">{children}</div>
    </div>
  );
}

export default function FilterBar() {
  const { filters, setFilter, resetFilters, activeCount } = useFilters();
  const { pathname } = useLocation();
  const activeFilters = PAGE_FILTERS[pathname] ?? [];

  if (activeFilters.length === 0) return null;

  const showBureau = activeFilters.includes('bureau');
  const showPeriod = activeFilters.includes('period');
  const showRisk   = activeFilters.includes('risk');
  const showStatus = activeFilters.includes('status');

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25 }}
        className="mb-5 rounded-2xl px-4 py-3 flex items-center gap-4 flex-wrap"
        style={{
          background: 'rgba(15,23,42,0.6)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        {/* Filter icon */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-sm">🔍</span>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest hidden xl:block">Filtres</span>
          {activeCount > 0 && (
            <motion.span
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center"
              style={{ background: '#3b82f6', color: '#fff' }}
            >
              {activeCount}
            </motion.span>
          )}
        </div>

        <div className="w-px h-4 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />

        {/* Bureau filter */}
        {showBureau && (
          <FilterGroup title="Bureau">
            {BUREAUX.map(b => (
              <FilterChip key={b.value} value={b.value} active={filters.bureau === b.value}
                label={b.value === 'ALL' ? 'Tous' : b.label} color="#3b82f6"
                onClick={() => setFilter('bureau', b.value)} />
            ))}
          </FilterGroup>
        )}

        {/* Period filter */}
        {showPeriod && (
          <>
            <div className="w-px h-4 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <FilterGroup title="Période">
              {PERIODS.map(p => (
                <FilterChip key={p.value} value={p.value} active={filters.period === p.value}
                  label={p.label} color="#8b5cf6"
                  onClick={() => setFilter('period', p.value)} />
              ))}
            </FilterGroup>
          </>
        )}

        {/* Risk filter */}
        {showRisk && (
          <>
            <div className="w-px h-4 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <FilterGroup title="Risque">
              {RISKS.map(r => (
                <FilterChip key={r.value} value={r.value} active={filters.risk === r.value}
                  label={r.label} color={r.color}
                  onClick={() => setFilter('risk', r.value)} />
              ))}
            </FilterGroup>
          </>
        )}

        {/* Status filter */}
        {showStatus && (
          <>
            <div className="w-px h-4 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <FilterGroup title="Statut">
              {STATUSES.map(s => (
                <FilterChip key={s.value} value={s.value} active={filters.status === s.value}
                  label={s.label} color={s.color}
                  onClick={() => setFilter('status', s.value)} />
              ))}
            </FilterGroup>
          </>
        )}

        {/* Reset */}
        {activeCount > 0 && (
          <>
            <div className="ml-auto" />
            <motion.button
              onClick={resetFilters}
              initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}
            >
              ✕ Réinitialiser
            </motion.button>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
