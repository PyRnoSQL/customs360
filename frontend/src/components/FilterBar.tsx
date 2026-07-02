import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFilters, BureauFilter, RiskFilter, PeriodFilter, StatusFilter } from '../context/FilterContext';
import { useLocation } from 'react-router-dom';

// ── Data ───────────────────────────────────────────────────────────────────────
const BUREAUX: { value: BureauFilter; label: string }[] = [
  { value: 'ALL',    label: 'Tous les bureaux' },
  { value: 'DLA001', label: 'Douala Port Principal' },
  { value: 'KBI001', label: 'Kribi Port Autonome' },
  { value: 'DLA002', label: 'Douala Aéroport' },
  { value: 'YDE001', label: 'Yaoundé Nsimalen' },
  { value: 'YDE002', label: 'Yaoundé Centre' },
];

const PERIODS: { value: PeriodFilter; label: string; group?: string }[] = [
  { value: 'ALL',     label: 'Toute période' },
  // 2023
  { value: '2023-01', label: 'Jan 2023', group: '2023' },
  { value: '2023-02', label: 'Fév 2023', group: '2023' },
  { value: '2023-03', label: 'Mar 2023', group: '2023' },
  { value: '2023-04', label: 'Avr 2023', group: '2023' },
  { value: '2023-05', label: 'Mai 2023', group: '2023' },
  { value: '2023-06', label: 'Jun 2023', group: '2023' },
  { value: '2023-07', label: 'Jul 2023', group: '2023' },
  { value: '2023-08', label: 'Aoû 2023', group: '2023' },
  { value: '2023-09', label: 'Sep 2023', group: '2023' },
  { value: '2023-10', label: 'Oct 2023', group: '2023' },
  { value: '2023-11', label: 'Nov 2023', group: '2023' },
  { value: '2023-12', label: 'Déc 2023', group: '2023' },
  // 2024
  { value: '2024-01', label: 'Jan 2024', group: '2024' },
  { value: '2024-02', label: 'Fév 2024', group: '2024' },
  { value: '2024-03', label: 'Mar 2024', group: '2024' },
  { value: '2024-04', label: 'Avr 2024', group: '2024' },
  { value: '2024-05', label: 'Mai 2024', group: '2024' },
  { value: '2024-06', label: 'Jun 2024', group: '2024' },
  { value: '2024-07', label: 'Jul 2024', group: '2024' },
  { value: '2024-08', label: 'Aoû 2024', group: '2024' },
  { value: '2024-09', label: 'Sep 2024', group: '2024' },
  { value: '2024-10', label: 'Oct 2024', group: '2024' },
  { value: '2024-11', label: 'Nov 2024', group: '2024' },
  { value: '2024-12', label: 'Déc 2024', group: '2024' },
];

const RISKS: { value: RiskFilter; label: string; color: string }[] = [
  { value: 'ALL',      label: 'Sévérité',  color: '#64748b' },
  { value: 'CRITIQUE', label: 'Critique',  color: '#ef4444' },
  { value: 'ELEVE',    label: 'Élevé',     color: '#f97316' },
  { value: 'MOYEN',    label: 'Moyen',     color: '#eab308' },
  { value: 'FAIBLE',   label: 'Faible',    color: '#10b981' },
];

const STATUSES: { value: StatusFilter; label: string; color: string }[] = [
  { value: 'ALL',                 label: 'Statut',          color: '#64748b' },
  { value: 'EN_COURS',            label: 'En cours',        color: '#3b82f6' },
  { value: 'CLOTURE_AMIABLE',     label: 'Clôturé amiable', color: '#10b981' },
  { value: 'CLOTURE_CONTENTIEUX', label: 'Contentieux',     color: '#f59e0b' },
  { value: 'TRANSMIS_JUSTICE',    label: 'Justice',         color: '#ef4444' },
  { value: 'ABANDONNE',           label: 'Abandonné',       color: '#64748b' },
];

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

// ── Dropdown component ─────────────────────────────────────────────────────────
interface DropdownOption { value: string; label: string; color?: string; }

function FilterDropdown({
  value, options, onChange, activeColor,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (v: string) => void;
  activeColor?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value) ?? options[0];
  const isActive = value !== 'ALL';
  const borderColor = isActive ? (selected.color ?? activeColor ?? '#3b82f6') : 'rgba(255,255,255,0.1)';
  const textColor   = isActive ? (selected.color ?? activeColor ?? '#60a5fa') : '#94a3b8';

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-150 select-none"
        style={{
          background: isActive ? `${borderColor}14` : 'rgba(255,255,255,0.04)',
          border: `1px solid ${borderColor}`,
          color: textColor,
          minWidth: 140,
        }}
      >
        {isActive && (
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: borderColor }} />
        )}
        <span className="flex-1 text-left truncate">{selected.label}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0"
          style={{ color: '#475569', fontSize: 10 }}
        >▼</motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-1.5 rounded-xl overflow-hidden z-50"
            style={{
              background: 'rgba(9,14,28,0.98)',
              border: '1px solid rgba(255,255,255,0.1)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
              minWidth: 200,
            }}
          >
            {options.map(opt => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-all duration-100"
                  style={{
                    background: isSelected ? `${opt.color ?? activeColor ?? '#3b82f6'}15` : 'transparent',
                    color: isSelected ? (opt.color ?? activeColor ?? '#60a5fa') : '#94a3b8',
                    borderLeft: `2px solid ${isSelected ? (opt.color ?? activeColor ?? '#3b82f6') : 'transparent'}`,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = isSelected ? `${opt.color ?? activeColor ?? '#3b82f6'}15` : 'transparent')}
                >
                  {opt.color && opt.value !== 'ALL' && (
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: opt.color }} />
                  )}
                  <span className="flex-1">{opt.label}</span>
                  {isSelected && <span style={{ color: opt.color ?? activeColor ?? '#3b82f6', fontSize: 12 }}>✓</span>}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main FilterBar ─────────────────────────────────────────────────────────────
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
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mb-5 flex items-center gap-2 flex-wrap"
    >
      {/* Dropdowns */}
      {showRisk && (
        <FilterDropdown
          value={filters.risk}
          options={RISKS}
          onChange={v => setFilter('risk', v as RiskFilter)}
          activeColor="#ef4444"
        />
      )}

      {showStatus && (
        <FilterDropdown
          value={filters.status}
          options={STATUSES}
          onChange={v => setFilter('status', v as StatusFilter)}
          activeColor="#a78bfa"
        />
      )}

      {showPeriod && (
        <FilterDropdown
          value={filters.period}
          options={PERIODS}
          onChange={v => setFilter('period', v as PeriodFilter)}
          activeColor="#8b5cf6"
        />
      )}

      {showBureau && (
        <FilterDropdown
          value={filters.bureau}
          options={BUREAUX}
          onChange={v => setFilter('bureau', v as BureauFilter)}
          activeColor="#3b82f6"
        />
      )}

      {/* Reset */}
      <AnimatePresence>
        {activeCount > 0 && (
          <motion.button
            initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
            onClick={resetFilters}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold ml-1"
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
              color: '#f87171',
            }}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          >
            ✕ Réinitialiser
            <span className="w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center ml-1"
              style={{ background: '#ef4444', color: '#fff' }}>
              {activeCount}
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
