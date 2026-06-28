import React, { createContext, useContext, useState, useCallback } from 'react';

export type BureauFilter = 'ALL' | 'DLA001' | 'KBI001' | 'DLA002' | 'YDE001' | 'YDE002';
export type RiskFilter   = 'ALL' | 'CRITIQUE' | 'ELEVE' | 'MOYEN' | 'FAIBLE';
export type PeriodFilter = 'ALL' | '2025-08' | '2025-09' | '2025-10' | '2025-11' | '2025-12' | '2026-01' | '2026-02';
export type StatusFilter = 'ALL' | 'CONFIRMED' | 'UNDER_REVIEW' | 'SUSPECTED';

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

// ── Filter helpers ─────────────────────────────────────────────────────────────
export function applyBureauFilter<T extends { office_id?: string; bureau_ids?: string[] }>(
  data: T[], bureau: BureauFilter
): T[] {
  if (bureau === 'ALL') return data;
  return data.filter(d =>
    d.office_id === bureau || (d.bureau_ids && d.bureau_ids.includes(bureau))
  );
}

export function applyPeriodFilter<T extends { date?: string; month?: string }>(
  data: T[], period: PeriodFilter
): T[] {
  if (period === 'ALL') return data;
  return data.filter(d =>
    (d.date && d.date.startsWith(period)) ||
    (d.month && d.month === period)
  );
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
    CRITIQUE: ['CRITICAL','HIGH'],
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
