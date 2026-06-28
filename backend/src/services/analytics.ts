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

// ════════════════════════════════════════════════════════════════════════════
// OFFICER INTELLIGENCE — derived from SGD_DECLARATIONS via declarant_id
// ════════════════════════════════════════════════════════════════════════════

export interface OfficerMetrics {
  officer_id: string;
  name: string;
  bureau_ids: string[];
  total_declarations: number;
  fraud_detected: number;
  fraud_detection_rate: number;
  avg_clearance_hours: number;
  bureau_baseline_hours: number;
  speed_score: number;           // 0-100 (100 = fastest)
  revenue_recovered: number;
  revenue_recovery_rate: number;
  high_risk_tariff_count: number;
  performance_index: number;     // 0-100 composite
  career_status: 'ELIGIBLE_PROMOTION' | 'ACTIF' | 'REDEPLOYMENT_RISK' | 'BURNOUT_ALERT';
  promotion_readiness: number;   // 0-100
  burnout_risk: 'LOW' | 'MEDIUM' | 'HIGH';
  monthly_trend: { month: string; pi: number; declarations: number }[];
  rank_in_bureau: number;
  total_in_bureau: number;
  revenue_vs_taxes_gap: number;
}

const BUREAU_BASELINES: Record<string, number> = {
  DLA001: 36, KBI001: 28, DLA002: 18, YDE001: 22, YDE002: 48, NGD001: 72,
};

const DECLARANT_NAMES: Record<string, string> = {
  DEC001: 'MBARGA Jean-Paul',     DEC002: 'TCHOUMBA André',
  DEC003: 'NKENGUE Marie',        DEC004: 'ESSOMBA Pierre',
  DEC005: 'BIYA-FOUDA Salatou',   DEC006: 'MOHAMADOU Alim',
  DEC007: 'KANA Hélène',          DEC008: 'FOUDA-BELL Ernest',
  DEC009: 'ABENA Christine',      DEC010: 'ONDOUA Patrick',
};

function monthLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? '?' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function buildOfficerMetrics(sgd: SGDRow[], fraud: FraudRow[]): OfficerMetrics[] {
  const decIds = [...new Set(sgd.map(s => s.declarant_id))];
  const fraudByDec = fraud.reduce<Record<string, number>>((a, f) => {
    a[f.declarant_id] = (a[f.declarant_id] ?? 0) + 1; return a;
  }, {});

  const officers: OfficerMetrics[] = decIds.map(did => {
    const rows = sgd.filter(s => s.declarant_id === did);
    const bureaus = [...new Set(rows.map(r => r.office_id))];
    const primaryBureau = bureaus[0] ?? 'DLA001';
    const baseline = BUREAU_BASELINES[primaryBureau] ?? 36;
    const fraudDetected = fraudByDec[did] ?? 0;
    const fraudRate = rows.length > 0 ? fraudDetected / rows.length : 0;
    const avgClearance = rows.length > 0
      ? rows.reduce((s, r) => s + r.clearance_hours, 0) / rows.length : baseline;
    const revenue = rows.reduce((s, r) => s + r.revenue_collected, 0);
    const taxes = rows.reduce((s, r) => s + r.taxes_declared, 0);
    const revRate = taxes > 0 ? revenue / taxes : 0;
    const highRiskCount = rows.filter(r =>
      ['85044000','62046200','85176200','87032390','84715000'].includes(r.tariff_code)
    ).length;

    // Speed score: how much faster than baseline (capped 0-100)
    const speedScore = Math.max(0, Math.min(100, 100 - ((avgClearance - baseline) / baseline) * 50));
    // Fraud detection score (0-100)
    const fraudScore = Math.min(100, fraudRate * 300);
    // Revenue recovery score (0-100)
    const revenueScore = Math.min(100, revRate * 100);
    // Volume score (normalize by top performer)
    const volumeScore = Math.min(100, (rows.length / 100) * 100);
    // Tariff awareness score
    const tariffScore = rows.length > 0 ? Math.min(100, (highRiskCount / rows.length) * 200) : 0;

    const pi = Math.round(
      fraudScore   * 0.30 +
      speedScore   * 0.20 +
      revenueScore * 0.25 +
      volumeScore  * 0.15 +
      tariffScore  * 0.10
    );

    // Monthly trend
    const monthMap: Record<string, { decls: number; fraud: number; revenue: number; hours: number }> = {};
    rows.forEach(r => {
      const m = monthLabel(r.date);
      if (!monthMap[m]) monthMap[m] = { decls: 0, fraud: 0, revenue: 0, hours: 0 };
      monthMap[m].decls++;
      monthMap[m].revenue += r.revenue_collected;
      monthMap[m].hours += r.clearance_hours;
      if (r.fraud_flag) monthMap[m].fraud++;
    });
    const monthly_trend = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        month,
        declarations: v.decls,
        pi: Math.round(
          (Math.min(100, (v.fraud / Math.max(v.decls, 1)) * 300) * 0.30) +
          (Math.max(0, Math.min(100, 100 - ((v.hours / Math.max(v.decls,1) - baseline) / baseline) * 50)) * 0.20) +
          (Math.min(100, (v.revenue / Math.max(v.decls,1) / 5000000) * 100) * 0.25) +
          (Math.min(100, (v.decls / 20) * 100) * 0.25)
        ),
      }));

    // Burnout risk: high volume + slow clearance trend
    const recentMonths = monthly_trend.slice(-3);
    const avgRecentDecls = recentMonths.reduce((s, m) => s + m.declarations, 0) / Math.max(recentMonths.length, 1);
    const piTrend = recentMonths.length >= 2
      ? recentMonths[recentMonths.length - 1].pi - recentMonths[0].pi : 0;
    const burnout_risk: OfficerMetrics['burnout_risk'] =
      avgRecentDecls > 50 && piTrend < -10 ? 'HIGH'
      : avgRecentDecls > 30 && piTrend < -5 ? 'MEDIUM' : 'LOW';

    // Career status
    const promotion_readiness = Math.min(100, pi * 1.1 + (monthly_trend.length >= 3 ? 5 : 0));
    const career_status: OfficerMetrics['career_status'] =
      burnout_risk === 'HIGH' ? 'BURNOUT_ALERT'
      : pi >= 75 ? 'ELIGIBLE_PROMOTION'
      : pi < 35 ? 'REDEPLOYMENT_RISK'
      : 'ACTIF';

    return {
      officer_id: did,
      name: DECLARANT_NAMES[did] ?? did,
      bureau_ids: bureaus,
      total_declarations: rows.length,
      fraud_detected: fraudDetected,
      fraud_detection_rate: fraudRate,
      avg_clearance_hours: Math.round(avgClearance),
      bureau_baseline_hours: baseline,
      speed_score: Math.round(speedScore),
      revenue_recovered: revenue,
      revenue_recovery_rate: revRate,
      high_risk_tariff_count: highRiskCount,
      performance_index: pi,
      career_status,
      promotion_readiness: Math.round(promotion_readiness),
      burnout_risk,
      monthly_trend,
      rank_in_bureau: 0,
      total_in_bureau: 0,
      revenue_vs_taxes_gap: taxes - revenue,
    };
  });

  // Add bureau ranks
  const bureauGroups: Record<string, OfficerMetrics[]> = {};
  officers.forEach(o => {
    const b = o.bureau_ids[0] ?? 'UNKNOWN';
    if (!bureauGroups[b]) bureauGroups[b] = [];
    bureauGroups[b].push(o);
  });
  Object.values(bureauGroups).forEach(group => {
    group.sort((a, b) => b.performance_index - a.performance_index);
    group.forEach((o, i) => { o.rank_in_bureau = i + 1; o.total_in_bureau = group.length; });
  });

  return officers.sort((a, b) => b.performance_index - a.performance_index);
}

// ════════════════════════════════════════════════════════════════════════════
// PREDICTIVE ANALYTICS ENGINE
// ════════════════════════════════════════════════════════════════════════════

export interface DeclarationAnomalyScore {
  sgd_id: string; importer_id: string; declarant_id: string; office_id: string;
  tariff_code: string; cif_value: number; weight: number; clearance_hours: number;
  anomaly_score: number; risk_factors: string[]; predicted_fraud_prob: number;
  revenue_at_risk: number; recommended_action: string;
}

export interface RevenueForecast {
  month: string; label: string;
  actual: number | null; forecast: number;
  lower_bound: number; upper_bound: number; confidence: number;
}

export interface BureauTrajectory {
  office_id: string; name: string;
  trend: 'RISING' | 'STABLE' | 'DECLINING';
  momentum_score: number;
  period_revenues: number[];
  period_efficiency: number[];
  forecast_next: number;
  alert: string | null;
}

export interface PredictionSummary {
  declaration_anomalies: DeclarationAnomalyScore[];
  revenue_forecast: RevenueForecast[];
  bureau_trajectories: BureauTrajectory[];
  total_revenue_at_risk: number;
  high_anomaly_count: number;
  forecast_shortfall: number;
}

const HIGH_RISK_SET = new Set(['85044000','62046200','85176200','87032390','84715000']);
const COUNTRY_RISK: Record<string, number> = { CN: 0.8, NG: 0.6, TR: 0.5, IN: 0.4, FR: 0.1, DE: 0.1, US: 0.1, BE: 0.1 };
const FRAUD_TARIFF_RATE: Record<string, number> = { '85044000': 0.34, '62046200': 0.41, '85176200': 0.29, '87032390': 0.15, '84715000': 0.28 };

export function scoreDeclarationAnomalies(sgd: SGDRow[], fraud: FraudRow[]): DeclarationAnomalyScore[] {
  const confirmedFraudSGDs = new Set(fraud.map(f => f.sgd_id));

  // Compute peer cohort stats per tariff
  const tariffStats: Record<string, { avgCIF: number; stdCIF: number; avgWeight: number }> = {};
  const tariffCodes = [...new Set(sgd.map(s => s.tariff_code))];
  tariffCodes.forEach(tc => {
    const peers = sgd.filter(s => s.tariff_code === tc && s.cif_value > 0 && s.weight > 0);
    if (peers.length < 2) { tariffStats[tc] = { avgCIF: 0, stdCIF: 1, avgWeight: 0 }; return; }
    const avgCIF = peers.reduce((s, p) => s + p.cif_value / p.quantity, 0) / peers.length;
    const variance = peers.reduce((s, p) => s + Math.pow(p.cif_value / p.quantity - avgCIF, 2), 0) / peers.length;
    const avgWeight = peers.reduce((s, p) => s + p.weight / p.quantity, 0) / peers.length;
    tariffStats[tc] = { avgCIF, stdCIF: Math.sqrt(variance) || 1, avgWeight };
  });

  // Declarant fraud history
  const decFraudRate: Record<string, number> = {};
  [...new Set(sgd.map(s => s.declarant_id))].forEach(did => {
    const rows = sgd.filter(s => s.declarant_id === did);
    decFraudRate[did] = rows.length > 0 ? rows.filter(r => r.fraud_flag).length / rows.length : 0;
  });

  const scores: DeclarationAnomalyScore[] = sgd.map(s => {
    const stats = tariffStats[s.tariff_code] ?? { avgCIF: s.cif_value, stdCIF: 1, avgWeight: s.weight };
    const cifPerUnit = s.quantity > 0 ? s.cif_value / s.quantity : s.cif_value;
    const weightPerUnit = s.quantity > 0 ? s.weight / s.quantity : s.weight;
    const zScoreCIF = stats.stdCIF > 0 ? Math.abs(cifPerUnit - stats.avgCIF) / stats.stdCIF : 0;

    const factors: string[] = [];
    let score = 0;

    // Factor 1: CIF undervaluation (z-score vs peer cohort)
    if (cifPerUnit < stats.avgCIF * 0.5) { factors.push('Sous-évaluation CIF détectée'); score += 35; }
    else if (zScoreCIF > 2) { factors.push('Valeur CIF anormale (>2σ)'); score += 20; }

    // Factor 2: High-risk tariff code
    if (HIGH_RISK_SET.has(s.tariff_code)) {
      const rate = FRAUD_TARIFF_RATE[s.tariff_code] ?? 0.2;
      score += Math.round(rate * 40);
      factors.push(`Tarif à risque élevé (taux fraude ${Math.round(rate * 100)}%)`);
    }

    // Factor 3: Country risk
    const countryRisk = COUNTRY_RISK[s.country] ?? 0.3;
    if (countryRisk > 0.5) { factors.push(`Pays d'origine à risque (${s.country})`); score += Math.round(countryRisk * 20); }

    // Factor 4: Declarant fraud history
    const dFraud = decFraudRate[s.declarant_id] ?? 0;
    if (dFraud > 0.3) { factors.push('Déclarant avec historique fraude élevé'); score += Math.round(dFraud * 25); }

    // Factor 5: Revenue gap
    const revGap = s.taxes_declared > 0 ? (s.taxes_declared - s.revenue_collected) / s.taxes_declared : 0;
    if (revGap > 0.3) { factors.push(`Écart taxe/recette de ${Math.round(revGap * 100)}%`); score += Math.round(revGap * 20); }

    // Factor 6: Abnormal clearance
    const baseline = BUREAU_BASELINES[s.office_id] ?? 36;
    if (s.clearance_hours > baseline * 3) { factors.push('Délai de dédouanement anormal'); score += 10; }

    const anomaly_score = Math.min(99, score);
    const predicted_fraud_prob = Math.min(0.97, anomaly_score / 100 * 1.1);
    const revenue_at_risk = Math.round(s.taxes_declared * predicted_fraud_prob * 0.6);
    const recommended_action =
      anomaly_score >= 70 ? 'Inspection physique immédiate'
      : anomaly_score >= 45 ? 'Vérification documentaire prioritaire'
      : 'Contrôle aléatoire standard';

    return {
      sgd_id: s.sgd_id, importer_id: s.importer_id, declarant_id: s.declarant_id,
      office_id: s.office_id, tariff_code: s.tariff_code, cif_value: s.cif_value,
      weight: s.weight, clearance_hours: s.clearance_hours,
      anomaly_score, risk_factors: factors, predicted_fraud_prob,
      revenue_at_risk, recommended_action,
    };
  });

  return scores.sort((a, b) => b.anomaly_score - a.anomaly_score);
}

const MONTH_LABELS: Record<string, string> = {
  '2025-08':'Août 25','2025-09':'Sep 25','2025-10':'Oct 25',
  '2025-11':'Nov 25','2025-12':'Déc 25','2026-01':'Jan 26',
  '2026-02':'Fév 26','2026-03':'Mar 26','2026-04':'Avr 26','2026-05':'Mai 26',
};

export function forecastRevenue(sgd: SGDRow[], fraud: FraudRow[]): RevenueForecast[] {
  const monthly = buildMonthlyRevenue(sgd, fraud);
  const actuals = monthly.filter(m => m.collected > 0).slice(-6);
  if (actuals.length < 3) return [];

  // Simple exponential smoothing + seasonal factor
  const alpha = 0.35;
  let smoothed = actuals[0].collected;
  actuals.forEach(m => { smoothed = alpha * m.collected + (1 - alpha) * smoothed; });

  // Growth rate from last 3 periods
  const n = actuals.length;
  const recentGrowth = n >= 2
    ? (actuals[n - 1].collected - actuals[n - 2].collected) / Math.max(actuals[n - 2].collected, 1)
    : 0.02;
  const dampedGrowth = recentGrowth * 0.6; // dampen to avoid over-extrapolation

  const lastMonth = actuals[n - 1].month;
  const [yr, mo] = lastMonth.split('-').map(Number);

  const forecasts: RevenueForecast[] = actuals.map(m => ({
    month: m.month, label: m.label, actual: m.collected,
    forecast: m.collected, lower_bound: m.collected * 0.95, upper_bound: m.collected * 1.05, confidence: 1,
  }));

  // 3 forecast months
  for (let i = 1; i <= 3; i++) {
    const fMo = ((mo - 1 + i) % 12) + 1;
    const fYr = yr + Math.floor((mo - 1 + i) / 12);
    const monthKey = `${fYr}-${String(fMo).padStart(2, '0')}`;
    const fBase = smoothed * Math.pow(1 + dampedGrowth, i);
    const uncertainty = 0.08 * i; // grows with horizon
    forecasts.push({
      month: monthKey,
      label: MONTH_LABELS[monthKey] ?? monthKey,
      actual: null,
      forecast: Math.round(fBase),
      lower_bound: Math.round(fBase * (1 - uncertainty)),
      upper_bound: Math.round(fBase * (1 + uncertainty)),
      confidence: Math.max(0.6, 1 - uncertainty),
    });
  }
  return forecasts;
}

export function bureauTrajectories(sgd: SGDRow[], fraud: FraudRow[]): BureauTrajectory[] {
  const offices = buildOfficeStats(sgd, fraud);
  const NAMES: Record<string, string> = {
    DLA001:'Douala Port Principal', KBI001:'Kribi Port Autonome',
    DLA002:'Douala Aéroport', YDE001:'Yaoundé Nsimalen', YDE002:'Yaoundé Centre', NGD001:'Ngaoundéré Rail',
  };
  const monthlyRevenue = buildMonthlyRevenue(sgd, fraud);

  return offices.map(o => {
    const oSGD = sgd.filter(s => s.office_id === o.office_id);
    // Period revenues by month
    const periodRevs = monthlyRevenue.map(m => {
      const mSGD = oSGD.filter(s => s.date?.startsWith(m.month));
      return mSGD.reduce((s, r) => s + r.revenue_collected, 0);
    }).filter(v => v > 0);

    // Efficiency per period
    const periodEff = monthlyRevenue.map(m => {
      const mSGD = oSGD.filter(s => s.date?.startsWith(m.month));
      if (!mSGD.length) return 0;
      const avgCl = mSGD.reduce((s, r) => s + r.clearance_hours, 0) / mSGD.length;
      const baseline = BUREAU_BASELINES[o.office_id] ?? 36;
      return Math.max(0, Math.min(100, 100 - ((avgCl - baseline) / baseline) * 30));
    }).filter(v => v > 0);

    const n = periodRevs.length;
    let momentum = 0;
    if (n >= 3) {
      const recent = periodRevs.slice(-3);
      const older  = periodRevs.slice(-6, -3);
      const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
      const olderAvg  = older.length ? older.reduce((s, v) => s + v, 0) / older.length : recentAvg;
      momentum = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;
    }

    const trend: BureauTrajectory['trend'] =
      momentum > 5 ? 'RISING' : momentum < -5 ? 'DECLINING' : 'STABLE';

    const lastRev = periodRevs[n - 1] ?? o.total_revenue;
    const forecast_next = Math.round(lastRev * (1 + Math.min(0.15, Math.max(-0.15, momentum / 100))));

    const alert =
      trend === 'DECLINING' ? `Baisse de recettes détectée (−${Math.abs(Math.round(momentum))}%) — Action requise`
      : o.fraud_rate > 0.2 ? `Taux de fraude élevé (${Math.round(o.fraud_rate * 100)}%) — Renforcer les contrôles`
      : null;

    return {
      office_id: o.office_id,
      name: NAMES[o.office_id] ?? o.office_id,
      trend, momentum_score: Math.round(momentum),
      period_revenues: periodRevs,
      period_efficiency: periodEff,
      forecast_next, alert,
    };
  });
}

export function buildPredictions(sgd: SGDRow[], fraud: FraudRow[]): PredictionSummary {
  const anomalies = scoreDeclarationAnomalies(sgd, fraud);
  const highAnomaly = anomalies.filter(a => a.anomaly_score >= 60);
  const totalRisk = highAnomaly.reduce((s, a) => s + a.revenue_at_risk, 0);
  const forecast = forecastRevenue(sgd, fraud);
  const trajectories = bureauTrajectories(sgd, fraud);

  const lastActual = forecast.filter(f => f.actual !== null).slice(-1)[0];
  const firstForecast = forecast.find(f => f.actual === null);
  const shortfall = lastActual && firstForecast && firstForecast.forecast < lastActual.actual!
    ? lastActual.actual! - firstForecast.forecast : 0;

  return {
    declaration_anomalies: anomalies.slice(0, 30),
    revenue_forecast: forecast,
    bureau_trajectories: trajectories,
    total_revenue_at_risk: totalRisk,
    high_anomaly_count: highAnomaly.length,
    forecast_shortfall: shortfall,
  };
}
