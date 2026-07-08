import React, { createContext, useContext, useState, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
export type BureauFilter = 'ALL' | 'DLA001' | 'KBI001' | 'DLA002' | 'YDE001' | 'YDE002' | 'NGD001' | 'BFR001' | 'GRA001';
export type RiskFilter   = 'ALL' | 'CRITIQUE' | 'ELEVE' | 'MOYEN' | 'FAIBLE';
export type PeriodFilter = 'ALL'
  | '2023-01' | '2023-02' | '2023-03' | '2023-04' | '2023-05' | '2023-06'
  | '2023-07' | '2023-08' | '2023-09' | '2023-10' | '2023-11' | '2023-12'
  | '2024-01' | '2024-02' | '2024-03' | '2024-04' | '2024-05' | '2024-06'
  | '2024-07' | '2024-08' | '2024-09' | '2024-10' | '2024-11' | '2024-12';
export type StatusFilter = 'ALL' | 'EN_COURS' | 'CLOTURE_AMIABLE' | 'CLOTURE_CONTENTIEUX' | 'TRANSMIS_JUSTICE' | 'ABANDONNE';

export interface Filters {
  bureau: BureauFilter;
  risk:   RiskFilter;
  period: PeriodFilter;
  status: StatusFilter;
}

interface FilterCtx {
  filters: Filters;
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  resetFilters: () => void;
  activeCount: number;
}

const DEFAULT: Filters = { bureau: 'ALL', risk: 'ALL', period: 'ALL', status: 'ALL' };

const Ctx = createContext<FilterCtx>({
  filters: DEFAULT,
  setFilter: () => {},
  resetFilters: () => {},
  activeCount: 0,
});

export const useFilters = () => useContext(Ctx);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<Filters>(DEFAULT);
  const setFilter = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);
  const resetFilters = useCallback(() => setFilters(DEFAULT), []);
  const activeCount = Object.values(filters).filter(v => v !== 'ALL').length;
  return (
    <Ctx.Provider value={{ filters, setFilter, resetFilters, activeCount }}>
      {children}
    </Ctx.Provider>
  );
}

// ── Date helpers ──────────────────────────────────────────────────────────────
// Dataset dates are M/D/YYYY; extract YYYY-MM for period comparison
function toMonthKey(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Filter helpers ────────────────────────────────────────────────────────────
export function applyBureauFilter<T extends { office_id?: string; bureau_ids?: string[] }>(
  data: T[], bureau: BureauFilter
): T[] {
  if (bureau === 'ALL') return data;
  return data.filter(d =>
    d.office_id === bureau || (d.bureau_ids?.includes(bureau))
  );
}

// Works for both SGD rows (date: M/D/YYYY) and revenue rows (month: YYYY-MM)
export function applyPeriodFilter<T extends Record<string, unknown>>(
  data: T[], period: PeriodFilter
): T[] {
  if (period === 'ALL') return data;
  return data.filter(d => {
    // revenue/monthly rows have a 'month' field in YYYY-MM format
    if (typeof d['month'] === 'string') return d['month'] === period;
    // SGD rows have 'date' in M/D/YYYY format
    if (typeof d['date'] === 'string') return toMonthKey(d['date'] as string) === period;
    // Fraud rows have 'date_detection' in M/D/YYYY format
    if (typeof d['date_detection'] === 'string') return toMonthKey(d['date_detection'] as string) === period;
    return true;
  });
}

export function applyRiskFilter<T extends { risk_score?: number; anomaly_score?: number; risk_level?: string }>(
  data: T[], risk: RiskFilter
): T[] {
  if (risk === 'ALL') return data;
  const scoreRanges: Record<RiskFilter, [number, number]> = {
    ALL:      [0,   100],
    CRITIQUE: [80,  100],
    ELEVE:    [60,  79],
    MOYEN:    [40,  59],
    FAIBLE:   [0,   39],
  };
  const levelMap: Record<RiskFilter, string[]> = {
    ALL:      [],
    CRITIQUE: ['CRITICAL', 'HIGH'],
    ELEVE:    ['HIGH'],
    MOYEN:    ['MEDIUM'],
    FAIBLE:   ['LOW'],
  };
  const [lo, hi] = scoreRanges[risk];
  return data.filter(d => {
    const score = d.risk_score ?? d.anomaly_score;
    if (score !== undefined) return score >= lo && score <= hi;
    if (d.risk_level) return levelMap[risk].includes(d.risk_level);
    return true;
  });
}

export function applyStatusFilter<T extends { status?: string }>(
  data: T[], status: StatusFilter
): T[] {
  if (status === 'ALL') return data;
  return data.filter(d => d.status === status);
}
