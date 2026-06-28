import type {
  SGDRow, FraudRow, ImporterProfile, OfficeStats,
  TariffRisk, MonthlyRevenue, Overview, DATEFactor
} from '../types/index';

const HIGH_RISK_TARIFFS = new Set([
  '85044000','62046200','85176200','87032390','84715000','85258000'
]);

const OFFICE_NAMES: Record<string, string> = {
  DLA001: 'Douala Port Principal',
  KBI001: 'Kribi Port Autonome',
  DLA002: 'Douala Aéroport',
  YDE001: 'Yaoundé Nsimalen',
  YDE002: 'Yaoundé Centre',
  NGD001: 'Ngaoundéré Rail',
};

// ── DATE Algorithm ────────────────────────────────────────────────────────────
export function computeDATEFactors(
  importerId: string,
  sgds: SGDRow[],
  fraudRows: FraudRow[]
): DATEFactor[] {
  const impSGDs = sgds.filter(s => s.importer_id === importerId);
  const impFrauds = fraudRows.filter(f => f.importer_id === importerId);
  const fraudRate = impSGDs.length > 0
    ? impSGDs.filter(s => s.fraud_flag === 1).length / impSGDs.length : 0;
  const uniqueDeclarants = new Set(impSGDs.map(s => s.declarant_id)).size;
  const avgCifWeight = impSGDs.length > 0
    ? impSGDs.reduce((s, r) => s + r.cif_value / Math.max(r.weight, 1), 0) / impSGDs.length : 0;

  const factors: DATEFactor[] = [
    {
      label: 'Historique de fraude confirmée',
      weight: 35,
      triggered: impFrauds.filter(f => f.status === 'CONFIRMED').length >= 2,
    },
    {
      label: 'Taux déclarations suspectes > 30%',
      weight: 25,
      triggered: fraudRate > 0.30,
    },
    {
      label: 'Concentration mono-déclarant',
      weight: 15,
      triggered: uniqueDeclarants === 1 && impSGDs.length > 4,
    },
    {
      label: 'Ratio CIF/Poids anormal',
      weight: 20,
      triggered: avgCifWeight > 0 && avgCifWeight < 25000,
    },
    {
      label: 'Codes tarifaires à haut risque répétés',
      weight: 15,
      triggered: impSGDs.filter(s => HIGH_RISK_TARIFFS.has(s.tariff_code)).length > 2,
    },
    {
      label: 'Multi-bureaux inhabituel',
      weight: 10,
      triggered: new Set(impSGDs.map(s => s.office_id)).size > 2,
    },
  ];
  return factors;
}

export function computeRiskScore(factors: DATEFactor[]): number {
  const base = factors.filter(f => f.triggered).reduce((s, f) => s + f.weight, 0);
  return Math.min(99, base);
}

// ── Derived aggregations ──────────────────────────────────────────────────────

export function buildImporterProfiles(sgd: SGDRow[], fraud: FraudRow[]): ImporterProfile[] {
  const importerIds = [...new Set(sgd.map(s => s.importer_id))];
  return importerIds.map(id => {
    const rows = sgd.filter(s => s.importer_id === id);
    const fraudRows = fraud.filter(f => f.importer_id === id);
    const factors = computeDATEFactors(id, sgd, fraud);
    const risk_score = computeRiskScore(factors);
    return {
      importer_id: id,
      total_declarations: rows.length,
      total_cif_value: rows.reduce((s, r) => s + r.cif_value, 0),
      total_revenue: rows.reduce((s, r) => s + r.revenue_collected, 0),
      fraud_cases: fraudRows.length,
      fraud_rate: rows.length > 0 ? rows.filter(r => r.fraud_flag === 1).length / rows.length : 0,
      risk_score,
      offices: [...new Set(rows.map(r => r.office_id))],
      countries: [...new Set(rows.map(r => r.country))],
      tariff_codes: [...new Set(rows.map(r => r.tariff_code))],
      unique_declarants: [...new Set(rows.map(r => r.declarant_id))],
      date_factors: factors,
    };
  }).sort((a, b) => b.risk_score - a.risk_score);
}

export function buildOfficeStats(sgd: SGDRow[], fraud: FraudRow[]): OfficeStats[] {
  const officeIds = [...new Set(sgd.map(s => s.office_id))];
  const total = sgd.length;
  return officeIds.map(id => {
    const rows = sgd.filter(s => s.office_id === id);
    const fraudRows = fraud.filter(f => f.office_id === id);
    const avg_clearance = rows.length > 0
      ? rows.reduce((s, r) => s + r.clearance_hours, 0) / rows.length : 0;
    const efficiency = Math.min(98, Math.max(50, 100 - (avg_clearance / 2)));
    return {
      office_id: id,
      name: OFFICE_NAMES[id] ?? id,
      total_sgds: rows.length,
      total_revenue: rows.reduce((s, r) => s + r.revenue_collected, 0),
      avg_clearance_hours: Math.round(avg_clearance),
      fraud_cases: fraudRows.length,
      fraud_rate: rows.length > 0 ? fraudRows.length / rows.length : 0,
      efficiency_score: Math.round(efficiency),
      pct_of_total: total > 0 ? Math.round(rows.length / total * 100) : 0,
    };
  }).sort((a, b) => b.total_sgds - a.total_sgds);
}

export function buildTariffRisk(sgd: SGDRow[], fraud: FraudRow[]): TariffRisk[] {
  const codes = [...new Set(sgd.map(s => s.tariff_code))];
  return codes.map(code => {
    const rows = sgd.filter(s => s.tariff_code === code);
    const fraudRows = fraud.filter(f => f.tariff_code === code);
    const fraud_rate = rows.length > 0 ? fraudRows.length / rows.length : 0;
    const avg_cif = rows.length > 0
      ? rows.reduce((s, r) => s + r.cif_value, 0) / rows.length : 0;
    const risk_level: TariffRisk['risk_level'] =
      fraud_rate > 0.25 || HIGH_RISK_TARIFFS.has(code) ? 'HIGH'
      : fraud_rate > 0.10 ? 'MEDIUM' : 'LOW';
    return { tariff_code: code, total_declarations: rows.length, fraud_cases: fraudRows.length, fraud_rate, avg_cif, risk_level };
  }).sort((a, b) => b.fraud_rate - a.fraud_rate).slice(0, 12);
}

export function buildMonthlyRevenue(sgd: SGDRow[], fraud: FraudRow[]): MonthlyRevenue[] {
  const LABELS: Record<string, string> = {
    '2025-08':'Août 25','2025-09':'Sep 25','2025-10':'Oct 25',
    '2025-11':'Nov 25','2025-12':'Déc 25','2026-01':'Jan 26','2026-02':'Fév 26',
  };
  const months = Object.keys(LABELS);
  return months.map(month => {
    const mSGD = sgd.filter(s => s.date?.startsWith(month));
    const mFraud = fraud.filter(f => f.date?.startsWith(month));
    const collected = mSGD.reduce((s, r) => s + r.revenue_collected, 0);
    const lost_fraud = mFraud.reduce((s, r) => s + r.loss_amount, 0);
    return {
      month,
      label: LABELS[month],
      expected: Math.round(collected * 1.12),
      collected,
      lost_fraud,
    };
  }).filter(m => m.collected > 0 || m.lost_fraud > 0);
}

export function buildOverview(sgd: SGDRow[], fraud: FraudRow[]): Overview {
  const officeIds = [...new Set(sgd.map(s => s.office_id))];
  return {
    total_sgd: sgd.length,
    total_revenue: sgd.reduce((s, r) => s + r.revenue_collected, 0),
    fraud_confirmed: fraud.filter(f => f.status === 'CONFIRMED').length,
    revenue_loss: fraud.reduce((s, f) => s + f.loss_amount, 0),
    high_risk_importers: buildImporterProfiles(sgd, fraud).filter(i => i.risk_score >= 70).length,
    avg_clearance_hours: sgd.length > 0
      ? Math.round(sgd.reduce((s, r) => s + r.clearance_hours, 0) / sgd.length) : 0,
    office_distribution: officeIds.map(id => ({
      office_id: id,
      name: OFFICE_NAMES[id] ?? id,
      count: sgd.filter(s => s.office_id === id).length,
      pct: Math.round(sgd.filter(s => s.office_id === id).length / sgd.length * 100),
    })),
    monthly_revenue: buildMonthlyRevenue(sgd, fraud),
  };
}

export function buildDelays(sgd: SGDRow[]): (SGDRow & { overshoot_hours: number; is_suspicious: boolean })[] {
  const OFFICE_BASELINE: Record<string, number> = {
    DLA001: 36, KBI001: 28, DLA002: 18, YDE001: 22, YDE002: 48, NGD001: 72,
  };
  return sgd
    .map(s => {
      const baseline = OFFICE_BASELINE[s.office_id] ?? 36;
      const overshoot = s.clearance_hours - baseline;
      return { ...s, declared_hours: baseline, overshoot_hours: overshoot, is_suspicious: overshoot > baseline };
    })
    .filter(s => s.is_suspicious)
    .sort((a, b) => b.overshoot_hours - a.overshoot_hours);
}
