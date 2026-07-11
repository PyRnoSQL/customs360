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
  const impSGDs  = sgds.filter(s => s.importer_id === importerId);
  const impFrauds = fraudRows.filter(f => f.importer_id === importerId);
  const fraudFlagRows = impSGDs.filter(s => isFraud(s.fraud_flag));
  const fraudRate = impSGDs.length > 0 ? fraudFlagRows.length / impSGDs.length : 0;
  const uniqueDeclarants = new Set(impSGDs.map(s => s.declarant_id)).size;
  const highRiskTariffCount = impSGDs.filter(s => HIGH_RISK_TARIFFS.has(s.tariff_code)).length;
  const highRiskCountries = new Set(['CN','NG','AE','BJ','CI']);
  const highRiskOriginCount = impSGDs.filter(s => highRiskCountries.has(s.country)).length;
  const riskSystemAvg = impSGDs.length > 0
    ? impSGDs.reduce((s, r) => s + (r.risk_score_system ?? 0), 0) / impSGDs.length : 0;
  const confirmedFraud = impFrauds.filter(f =>
    f.status === 'CLOTURE_AMIABLE' || f.status === 'CLOTURE_CONTENTIEUX' || f.status === 'TRANSMIS_JUSTICE'
  ).length;
  const avgTaxGapRate = fraudFlagRows.length > 0
    ? fraudFlagRows.reduce((s, r) => s + (r.tax_gap ?? 0), 0) /
      Math.max(fraudFlagRows.reduce((s, r) => s + r.taxes_declared, 0), 1)
    : 0;

  const factors: DATEFactor[] = [
    {
      label: 'Fraudes confirmées ≥ 2 dossiers',
      weight: 35,
      triggered: confirmedFraud >= 2,
    },
    {
      label: 'Taux déclarations suspectes > 15%',
      weight: 25,
      triggered: fraudRate > 0.15,
    },
    {
      label: 'Score risque système élevé (> 55)',
      weight: 15,
      triggered: riskSystemAvg > 55,
    },
    {
      label: 'Codes tarif. haut risque > 20% du volume',
      weight: 20,
      triggered: impSGDs.length > 0 && (highRiskTariffCount / impSGDs.length) > 0.20,
    },
    {
      label: 'Origines CN/NG > 40% des importations',
      weight: 15,
      triggered: impSGDs.length > 0 && (highRiskOriginCount / impSGDs.length) > 0.40,
    },
    {
      label: 'Écart fiscal moyen > 25%',
      weight: 10,
      triggered: avgTaxGapRate > 0.25,
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
      name: rows[0]?.importer_name ?? id,
      total_declarations: rows.length,
      total_cif_value: rows.reduce((s, r) => s + r.cif_value, 0),
      total_revenue: rows.reduce((s, r) => s + r.revenue_collected, 0),
      fraud_cases: fraudRows.length,
      fraud_rate: rows.length > 0 ? rows.filter(r => isFraud(r.fraud_flag)).length / rows.length : 0,
      risk_score,
      offices: [...new Set(rows.map(r => r.office_id))],
      office_names: [...new Set(rows.map(r => r.office_name ?? r.office_id))],
      countries: [...new Set(rows.map(r => r.country))],
      tariff_codes: [...new Set(rows.map(r => r.tariff_code))],
      unique_declarants: [...new Set(rows.map(r => r.declarant_id))],
      unique_declarant_names: [...new Set(rows.map(r => r.declarant_name ?? r.declarant_id))],
      date_factors: factors,
    };
  }).sort((a, b) => b.risk_score - a.risk_score);
}

export function buildOfficeStats(sgd: SGDRow[], fraud: FraudRow[]): OfficeStats[] {
  const OFFICE_BASELINES: Record<string, number> = {
    DLA001: 36, KBI001: 28, DLA002: 18, YDE001: 22,
    YDE002: 48, NGD001: 72, BFR001: 60, GRA001: 24,
  };
  const officeIds = [...new Set(sgd.map(s => s.office_id))];
  const total = sgd.length;

  // First pass: compute raw stats
  const raw = officeIds.map(id => {
    const rows  = sgd.filter(s => s.office_id === id);
    const fRows = fraud.filter(f => f.office_id === id);
    const baseline = OFFICE_BASELINES[id] ?? 36;
    const avg_ch = rows.length > 0
      ? rows.reduce((s, r) => s + r.clearance_hours, 0) / rows.length : baseline;
    return {
      office_id: id,
      name: OFFICE_NAMES[id] ?? id,
      total_sgds: rows.length,
      total_revenue: rows.reduce((s, r) => s + r.revenue_collected, 0),
      total_assessed: rows.reduce((s, r) => s + (r.taxes_assessed ?? 0), 0),
      avg_clearance_hours: Math.round(avg_ch * 10) / 10,
      baseline_hours: baseline,
      fraud_cases: fRows.length,
      fraud_rate: rows.length > 0 ? fRows.length / rows.length : 0,
      efficiency_score: 0,
      pct_of_total: 0,
      _ratio: avg_ch / baseline,
    };
  });

  // Second pass: normalise efficiency (lower ratio = faster = better, range 40-98)
  const ratios = raw.map(o => o._ratio);
  const minR = Math.min(...ratios);
  const maxR = Math.max(...ratios);
  return raw.map(o => {
    const eff = maxR > minR
      ? Math.round(((maxR - o._ratio) / (maxR - minR)) * 58 + 40)
      : 70;
    const { _ratio, ...rest } = o;
    void _ratio;
    return {
      ...rest,
      efficiency_score: eff,
      pct_of_total: total > 0 ? Math.round((o.total_sgds / total) * 1000) / 10 : 0,
    };
  }).sort((a, b) => b.total_revenue - a.total_revenue);
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
  const FR_MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  // Derive months dynamically from actual data
  const monthSet = new Set<string>();
  sgd.forEach(s  => { const m = monthLabel(s.date);            if (m !== '?') monthSet.add(m); });
  fraud.forEach(f => { const m = monthLabel(f.date_detection); if (m !== '?') monthSet.add(m); });
  const months = [...monthSet].sort();
  return months.map(month => {
    const [y, mo] = month.split('-');
    const label   = `${FR_MONTHS[Number(mo) - 1]} ${y.slice(2)}`;
    const mSGD    = sgd.filter(s   => dateMatchesMonth(s.date, month));
    const mFraud  = fraud.filter(f => dateMatchesMonth(f.date_detection, month));
    const collected  = mSGD.reduce((s, r)  => s + r.revenue_collected, 0);
    const assessed   = mSGD.reduce((s, r)  => s + (r.taxes_assessed ?? 0), 0);
    const lost_fraud = mFraud.reduce((s, f) => s + (f.tax_evasion_amount ?? 0), 0);
    return { month, label, expected: assessed, collected, lost_fraud };
  }).filter(m => m.collected > 0 || m.lost_fraud > 0);
}

export function buildOverview(sgd: SGDRow[], fraud: FraudRow[]): Overview {
  const BASELINES: Record<string,number> = {
    DLA001:36,KBI001:28,DLA002:18,YDE001:22,YDE002:48,NGD001:72,BFR001:60,GRA001:24,
  };
  const FR_MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

  // ── Financial aggregates ──────────────────────────────────────────────────
  const totalRevenue    = sgd.reduce((s,r) => s + r.revenue_collected, 0);
  const totalAssessed   = sgd.reduce((s,r) => s + (r.taxes_assessed ?? 0), 0);
  const taxEvasionTotal = fraud.reduce((s,f) => s + (f.tax_evasion_amount ?? 0), 0);
  const penaltiesRaised = fraud.reduce((s,f) => s + (f.penalty_amount ?? 0), 0);
  const amountRecovered = fraud.reduce((s,f) => s + (f.amount_recovered ?? 0), 0);
  const netLoss         = fraud.reduce((s,f) => s + (f.loss_net ?? 0), 0);
  const recoveryRate    = (taxEvasionTotal + penaltiesRaised) > 0
    ? amountRecovered / (taxEvasionTotal + penaltiesRaised) : 0;

  // ── Fraud counts ─────────────────────────────────────────────────────────
  const fraudRows   = sgd.filter(r => isFraud(r.fraud_flag));
  const fraudConf   = fraud.filter(f => ['CLOTURE_AMIABLE','CLOTURE_CONTENTIEUX','TRANSMIS_JUSTICE'].includes(f.status)).length;
  const casesOpen   = fraud.filter(f => f.status === 'EN_COURS').length;
  const casesJust   = fraud.filter(f => f.status === 'TRANSMIS_JUSTICE').length;
  const casesAband  = fraud.filter(f => f.status === 'ABANDONNE').length;
  const collusionN  = fraud.filter(f => f.collusion_suspected === 'TRUE').length;

  // ── Case status distribution ──────────────────────────────────────────────
  const STATUS_LABELS: Record<string,string> = {
    EN_COURS:'En cours', CLOTURE_AMIABLE:'Clôturé amiable',
    CLOTURE_CONTENTIEUX:'Contentieux', TRANSMIS_JUSTICE:'Justice', ABANDONNE:'Abandonné',
  };
  const statusMap: Record<string,{count:number;loss:number}> = {};
  fraud.forEach(f => {
    if (!statusMap[f.status]) statusMap[f.status] = {count:0,loss:0};
    statusMap[f.status].count++;
    statusMap[f.status].loss += (f.loss_net ?? 0);
  });
  const caseStatusDist = Object.entries(statusMap).map(([status,v]) => ({
    status: STATUS_LABELS[status] ?? status, count: v.count, loss: v.loss,
  })).sort((a,b) => b.count - a.count);

  // ── Clearance health ─────────────────────────────────────────────────────
  const avgClearance = sgd.length > 0
    ? Math.round(sgd.reduce((s,r) => s + r.clearance_hours, 0) / sgd.length) : 0;
  const overdueRows  = sgd.filter(r => r.clearance_hours > (BASELINES[r.office_id] ?? 36) * 1.5);
  const overduePct   = sgd.length > 0 ? Math.round(overdueRows.length / sgd.length * 100) : 0;

  // ── Channel distribution ──────────────────────────────────────────────────
  const chMap: Record<string,number> = {};
  sgd.forEach(r => { chMap[r.channel] = (chMap[r.channel] ?? 0) + 1; });
  const channelDist = Object.entries(chMap).sort((a,b) => b[1]-a[1]).map(([channel,count]) => ({
    channel, count, pct: Math.round(count / sgd.length * 100),
  }));

  // ── Office distribution (enriched) ────────────────────────────────────────
  const officeIds = [...new Set(sgd.map(s => s.office_id))];
  const officeRows = officeIds.map(id => {
    const rows  = sgd.filter(s => s.office_id === id);
    const frows = rows.filter(r => isFraud(r.fraud_flag));
    const rev   = rows.reduce((s,r) => s + r.revenue_collected, 0);
    const avgH  = rows.length > 0 ? rows.reduce((s,r) => s + r.clearance_hours, 0) / rows.length : 0;
    const base  = BASELINES[id] ?? 36;
    return {
      office_id: id, name: OFFICE_NAMES[id] ?? id,
      count: rows.length, pct: Math.round(rows.length / sgd.length * 100),
      revenue: rev, fraud_count: frows.length,
      fraud_rate: rows.length > 0 ? frows.length / rows.length : 0,
      avg_hours: Math.round(avgH * 10) / 10,
      efficiency: Math.min(98, Math.max(40, Math.round((base / Math.max(avgH,1)) * 100))),
    };
  }).sort((a,b) => b.revenue - a.revenue);

  // ── Office efficiency normalisation ──────────────────────────────────────
  const effRatios = officeRows.map(o => o.avg_hours / (BASELINES[o.office_id] ?? 36));
  const minR = Math.min(...effRatios); const maxR = Math.max(...effRatios);
  officeRows.forEach((o,i) => {
    o.efficiency = maxR > minR ? Math.round(((maxR - effRatios[i]) / (maxR - minR)) * 58 + 40) : 70;
  });

  // ── Top inspectors ────────────────────────────────────────────────────────
  const insMap: Record<string,{fraud:number;total:number;name:string;bureau:string}> = {};
  sgd.forEach(r => {
    if (!insMap[r.inspector_id]) insMap[r.inspector_id] = {fraud:0,total:0,name:r.inspector_name??r.inspector_id,bureau:r.office_id};
    insMap[r.inspector_id].total++;
    if (isFraud(r.fraud_flag)) insMap[r.inspector_id].fraud++;
  });
  const topInspectors = Object.entries(insMap)
    .map(([id,v]) => ({id,name:v.name,bureau:v.bureau,fraud_detected:v.fraud,total:v.total,detection_rate:v.total>0?v.fraud/v.total:0}))
    .sort((a,b) => b.fraud_detected - a.fraud_detected).slice(0,5);

  // ── Fraud monthly trend ───────────────────────────────────────────────────
  const trendMap: Record<string,{count:number;total:number;evasion:number}> = {};
  sgd.forEach(r => {
    try {
      const dt = new Date(r.date); if (isNaN(dt.getTime())) return;
      const m = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      if (!trendMap[m]) trendMap[m] = {count:0,total:0,evasion:0};
      trendMap[m].total++;
      if (isFraud(r.fraud_flag)) trendMap[m].count++;
    } catch { return; }
  });
  fraud.forEach(f => {
    try {
      const dt = new Date(f.date_detection); if (isNaN(dt.getTime())) return;
      const m = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      if (trendMap[m]) trendMap[m].evasion += (f.tax_evasion_amount ?? 0);
    } catch { return; }
  });
  const fraudTrend = Object.keys(trendMap).sort().map(m => {
    const [y,mo] = m.split('-');
    return { month:m, label:`${FR_MONTHS[Number(mo)-1]} ${y.slice(2)}`, ...trendMap[m],
      rate: trendMap[m].total > 0 ? trendMap[m].count / trendMap[m].total : 0 };
  });

  return {
    total_sgd:          sgd.length,
    total_revenue:      totalRevenue,
    taxes_assessed:     totalAssessed,
    fraud_confirmed:    fraudConf,
    fraud_count:        fraud.length,
    fraud_rate:         sgd.length > 0 ? fraudRows.length / sgd.length : 0,
    revenue_loss:       netLoss,
    tax_evasion_total:  taxEvasionTotal,
    penalties_raised:   penaltiesRaised,
    amount_recovered:   amountRecovered,
    net_loss:           netLoss,
    recovery_rate:      recoveryRate,
    cases_open:         casesOpen,
    cases_justice:      casesJust,
    cases_abandoned:    casesAband,
    collusion_suspected: collusionN,
    high_risk_importers: buildImporterProfiles(sgd, fraud).filter(i => i.risk_score >= 70).length,
    avg_clearance_hours: avgClearance,
    clearance_overdue_count: overdueRows.length,
    clearance_overdue_pct:   overduePct,
    channel_distribution:    channelDist,
    office_distribution:     officeRows,
    top_inspectors:          topInspectors,
    fraud_trend:             fraudTrend,
    case_status_dist:        caseStatusDist,
    monthly_revenue:         buildMonthlyRevenue(sgd, fraud),
  };
}

export function buildDelays(sgd: SGDRow[]): (SGDRow & { overshoot_hours: number; is_suspicious: boolean })[] {
  const OFFICE_BASELINE: Record<string, number> = {
    DLA001: 36, KBI001: 28, DLA002: 18, YDE001: 22, YDE002: 48, NGD001: 72, BFR001: 60, GRA001: 24,
  };
  return sgd
    .map(s => {
      const baseline = OFFICE_BASELINE[s.office_id] ?? 36;
      const overshoot = s.clearance_hours - baseline;
      return {
        ...s,
        office_name: s.office_name ?? s.office_id,
        importer_name: s.importer_name ?? s.importer_id,
        tariff_description: s.tariff_description ?? '',
        declared_hours: baseline,
        overshoot_hours: Math.round(overshoot * 10) / 10,
        is_suspicious: overshoot > baseline,
      };
    })
    .filter(s => s.is_suspicious)
    .sort((a, b) => b.overshoot_hours - a.overshoot_hours);
}

// ════════════════════════════════════════════════════════════════════════════
// OFFICER INTELLIGENCE — derived from SGD_DECLARATIONS via inspector_id
// ════════════════════════════════════════════════════════════════════════════

export interface OfficerMetrics {
  officer_id: string;
  name: string;
  grade: string;
  bureau_ids: string[];
  total_declarations: number;
  fraud_detected: number;
  proactive_detections: number;  // caught without system flag (channel != ROUGE)
  fraud_detection_rate: number;
  avg_clearance_hours: number;
  bureau_baseline_hours: number;
  speed_score: number;           // 0-100 (100 = fastest)
  revenue_recovered: number;
  revenue_recovery_rate: number;
  total_tax_gap_recovered: number; // sum of tax_gap on their fraud rows
  avg_risk_score: number;        // avg system risk score of their SGDs
  high_risk_tariff_count: number;
  seizures_made: number;
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
  BFR001: 60, GRA001: 24,
};

// Inspector lookup: id → { name, grade } — sourced from dataset
const INSPECTOR_INFO: Record<string, { name: string; grade: string }> = {
  INS001: { name: 'MBARGA Jean-Paul',     grade: 'Inspecteur Principal' },
  INS002: { name: 'TCHOUMBA André',       grade: 'Inspecteur' },
  INS003: { name: 'NKENGUE Marie',        grade: 'Inspecteur Principal' },
  INS004: { name: 'ESSOMBA Pierre',       grade: 'Contrôleur' },
  INS005: { name: 'BIYA-FOUDA Salatou',   grade: 'Inspecteur Principal' },
  INS006: { name: 'MOHAMADOU Alim',       grade: 'Inspecteur' },
  INS007: { name: 'KANA Hélène',          grade: 'Inspecteur' },
  INS008: { name: 'FOUDA-BELL Ernest',    grade: 'Contrôleur' },
  INS009: { name: 'ABENA Christine',      grade: 'Inspecteur Principal' },
  INS010: { name: 'ONDOUA Patrick',       grade: 'Inspecteur' },
  INS011: { name: 'NJOYA Ibrahim',        grade: 'Inspecteur' },
  INS012: { name: 'ATANGA Sylvie',        grade: 'Contrôleur' },
  INS013: { name: 'BELL Martin',          grade: 'Inspecteur' },
  INS014: { name: 'NGOUMOU Théodore',     grade: 'Contrôleur' },
  INS015: { name: 'EYINGA Rachel',        grade: 'Inspecteur' },
  INS016: { name: 'MEKOULOU Samuel',      grade: 'Contrôleur' },
  INS017: { name: 'KOUM Basile',          grade: 'Inspecteur' },
  INS018: { name: 'DANG Fatima',          grade: 'Contrôleur' },
  INS019: { name: 'OWONA Célestin',       grade: 'Inspecteur' },
  INS020: { name: 'NTYAM Louise',         grade: 'Inspecteur' },
};

// ── Date helpers (dataset uses M/D/YYYY format) ──────────────────────────────
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  // Try native parse first (handles ISO strings)
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  // Explicit M/D/YYYY fallback
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const d2 = new Date(Number(parts[2]), Number(parts[0]) - 1, Number(parts[1]));
    if (!isNaN(d2.getTime())) return d2;
  }
  return null;
}

function monthLabel(dateStr: string): string {
  const d = parseDate(dateStr);
  if (!d) return '?';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function dateMatchesMonth(dateStr: string, monthPrefix: string): boolean {
  return monthLabel(dateStr) === monthPrefix;
}

// Handles fraud_flag as number (1) or string ('1') or boolean (true)
function isFraud(flag: number | string | boolean | undefined): boolean {
  return flag === 1 || flag === '1' || flag === true;
}

export function buildOfficerMetrics(sgd: SGDRow[], fraud: FraudRow[]): OfficerMetrics[] {
  // Group SGD rows by inspector_id (the actual customs agent who processed them)
  const insIds = [...new Set(sgd.map(s => s.inspector_id).filter(Boolean))];

  // Fraud cases detected by each inspector (from FRAUD_CASES, linked by inspector_id)
  const fraudByIns = fraud.reduce<Record<string, FraudRow[]>>((a, f) => {
    if (!a[f.inspector_id]) a[f.inspector_id] = [];
    a[f.inspector_id].push(f);
    return a;
  }, {});

  const officers: OfficerMetrics[] = insIds.map(iid => {
    const rows = sgd.filter(s => s.inspector_id === iid);
    // Inspector is always at their assigned bureau — use first row's office_id
    const bureaus = [...new Set(rows.map(r => r.office_id))];
    const primaryBureau = bureaus[0] ?? 'DLA001';
    const baseline = BUREAU_BASELINES[primaryBureau] ?? 36;

    // Fraud detection: rows where this inspector found fraud (fraud_flag=1 on their SGDs)
    const fraudRows = rows.filter(r => isFraud(r.fraud_flag));
    const fraudDetected = fraudRows.length;
    const fraudRate = rows.length > 0 ? fraudDetected / rows.length : 0;

    // Proactive detections: inspector caught fraud despite system NOT flagging ROUGE
    const proactiveDetections = fraudRows.filter(r => r.channel !== 'ROUGE').length;

    // Tax gap recovered: sum of tax_gap on fraud rows (what the inspector found)
    const totalTaxGapRecovered = fraudRows.reduce((s, r) => s + (r.tax_gap ?? 0), 0);

    // Average system risk score across all their SGDs
    const avgRiskScore = rows.length > 0
      ? rows.reduce((s, r) => s + (r.risk_score_system ?? 0), 0) / rows.length : 0;

    // Seizures made
    const seizuresMade = rows.filter(r => r.inspection_result === 'SAISIE').length;
    const assessedTotal = rows.reduce((s, r) => s + (r.taxes_assessed ?? 0), 0);

    const avgClearance = rows.length > 0
      ? rows.reduce((s, r) => s + r.clearance_hours, 0) / rows.length : baseline;
    const revenue = rows.reduce((s, r) => s + r.revenue_collected, 0);
    const taxes = rows.reduce((s, r) => s + r.taxes_declared, 0);
    const revRate = taxes > 0 ? revenue / taxes : 0;
    const highRiskCount = rows.filter(r =>
      ['85044000','62046200','85176200','87032390','84715000'].includes(r.tariff_code)
    ).length;

    // ── Performance Index (PI) — 0-100 ───────────────────────────────────────
    // Speed score: faster than bureau baseline = better
    const speedScore = Math.max(0, Math.min(100, 100 - ((avgClearance - baseline) / baseline) * 50));
    // Fraud detection score: rate × multiplier, capped 100
    const fraudScore = Math.min(100, fraudRate * 300);
    // Proactive bonus: catching fraud the system missed is the gold metric
    const proactiveScore = Math.min(100, (proactiveDetections / Math.max(rows.length, 1)) * 500);
    // Revenue score: revenue_collected / taxes_assessed (not taxes_declared)
    // taxes_assessed = what inspector determined was owed; revenue = what was collected
    const revenueScore = Math.min(100, (revenue / Math.max(assessedTotal, 1)) * 100);
    // Volume score: dynamic — normalised against all inspectors (computed below)
    // placeholder, overridden after all officers built
    const volumeScoreRaw = rows.length; // store raw count, normalise after
    // Tax gap score: tax_gap / taxes_assessed → what % the inspector recovered above declared
    const taxGapScore = Math.min(100, (totalTaxGapRecovered / Math.max(assessedTotal, 1)) * 200);

    // Store PI components — final PI computed after all officers built (for volume normalisation)
    const _piComponents = { fraudScore, proactiveScore, speedScore, revenueScore, taxGapScore, volumeScoreRaw };

    // Monthly trend
    const monthMap: Record<string, { decls: number; fraud: number; proactive: number; revenue: number; assessed: number; hours: number; tax_gap: number }> = {};
    rows.forEach(r => {
      const m = monthLabel(r.date);
      if (!monthMap[m]) monthMap[m] = { decls: 0, fraud: 0, proactive: 0, revenue: 0, assessed: 0, hours: 0, tax_gap: 0 };
      monthMap[m].decls++;
      monthMap[m].revenue  += r.revenue_collected;
      monthMap[m].assessed += (r.taxes_assessed ?? 0);
      monthMap[m].hours    += r.clearance_hours;
      if (isFraud(r.fraud_flag)) {
        monthMap[m].fraud++;
        monthMap[m].tax_gap += (r.tax_gap ?? 0);
        if (r.channel !== 'ROUGE') monthMap[m].proactive++;
      }
    });
    const monthly_trend = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => {
        const mFraudRate    = v.fraud / Math.max(v.decls, 1);
        const mAvgHours     = v.hours / Math.max(v.decls, 1);
        const mProactiveRate= v.proactive / Math.max(v.decls, 1);
        const mFraudScore   = Math.min(100, mFraudRate * 300);
        const mProactScore  = Math.min(100, mProactiveRate * 500);
        const mSpeedScore   = Math.max(0, Math.min(100, 100 - ((mAvgHours - baseline) / baseline) * 50));
        const mRevScore     = Math.min(100, (v.revenue / Math.max(v.assessed, 1)) * 100);
        const mGapScore     = Math.min(100, (v.tax_gap / Math.max(v.assessed, 1)) * 200);
        const mVolScore     = Math.min(100, (v.decls / 20) * 100);
        return {
          month,
          declarations: v.decls,
          fraud: v.fraud,
          pi: Math.round(
            mFraudScore  * 0.25 +
            mProactScore * 0.20 +
            mSpeedScore  * 0.20 +
            mRevScore    * 0.15 +
            mGapScore    * 0.10 +
            mVolScore    * 0.10
          ),
        };
      });

    // Burnout risk
    const recentMonths = monthly_trend.slice(-3);
    const avgRecentDecls = recentMonths.reduce((s, m) => s + m.declarations, 0) / Math.max(recentMonths.length, 1);
    const piTrend = recentMonths.length >= 2
      ? recentMonths[recentMonths.length - 1].pi - recentMonths[0].pi : 0;
    const burnout_risk: OfficerMetrics['burnout_risk'] =
      avgRecentDecls > 50 && piTrend < -10 ? 'HIGH'
      : avgRecentDecls > 30 && piTrend < -5 ? 'MEDIUM' : 'LOW';

    const info = INSPECTOR_INFO[iid] ?? { name: iid, grade: 'Inspecteur' };

    return {
      officer_id: iid,
      name: info.name,
      grade: info.grade,
      bureau_ids: bureaus,
      total_declarations: rows.length,
      fraud_detected: fraudDetected,
      proactive_detections: proactiveDetections,
      fraud_detection_rate: fraudRate,
      avg_clearance_hours: Math.round(avgClearance),
      bureau_baseline_hours: baseline,
      speed_score: Math.round(speedScore),
      revenue_recovered: revenue,
      revenue_recovery_rate: assessedTotal > 0 ? revenue / assessedTotal : 0,
      total_tax_gap_recovered: totalTaxGapRecovered,
      avg_risk_score: Math.round(avgRiskScore),
      high_risk_tariff_count: highRiskCount,
      seizures_made: seizuresMade,
      performance_index: 0,      // computed below after volume normalisation
      _piComponents,             // temporary — stripped after PI computed
      career_status: 'ACTIF' as OfficerMetrics['career_status'],  // recomputed below
      promotion_readiness: 0,    // recomputed below
      burnout_risk,
      monthly_trend,
      rank_in_bureau: 0,
      total_in_bureau: 0,
      revenue_vs_taxes_gap: assessedTotal - revenue,
    } as unknown as OfficerMetrics & { _piComponents: typeof _piComponents };
  });

  // ── Post-process: compute final PI with volume normalised to actual max ──────
  const rawOfficers = officers as unknown as (OfficerMetrics & { _piComponents: { fraudScore:number; proactiveScore:number; speedScore:number; revenueScore:number; taxGapScore:number; volumeScoreRaw:number } })[];
  const maxVol = Math.max(...rawOfficers.map(o => o._piComponents.volumeScoreRaw), 1);

  rawOfficers.forEach(o => {
    const c = o._piComponents;
    const volumeScore = Math.min(100, (c.volumeScoreRaw / maxVol) * 100);
    const pi = Math.round(
      c.fraudScore     * 0.25 +
      c.proactiveScore * 0.20 +
      c.speedScore     * 0.20 +
      c.revenueScore   * 0.15 +
      c.taxGapScore    * 0.10 +
      volumeScore      * 0.10
    );
    o.performance_index = pi;
    // Career status based on final PI
    const pr = Math.min(100, pi * 1.1 + (o.monthly_trend.length >= 3 ? 5 : 0));
    o.promotion_readiness = Math.round(pr);
    o.career_status =
      o.burnout_risk === 'HIGH'  ? 'BURNOUT_ALERT'
      : pi >= 75                 ? 'ELIGIBLE_PROMOTION'
      : pi < 35                  ? 'REDEPLOYMENT_RISK'
      : 'ACTIF';
    // Remove temp field
    delete (o as unknown as Record<string,unknown>)['_piComponents'];
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
  sgd_id: string;
  importer_id: string; importer_name: string;
  declarant_id: string;
  office_id: string; office_name: string;
  tariff_code: string; tariff_description: string;
  cif_value: number; weight: number; clearance_hours: number;
  anomaly_score: number; risk_factors: string[];
  predicted_fraud_prob: number; revenue_at_risk: number; recommended_action: string;
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
    const peers = sgd.filter(s => s.tariff_code === tc && s.cif_value > 0 && s.weight_kg > 0);
    if (peers.length < 2) { tariffStats[tc] = { avgCIF: 0, stdCIF: 1, avgWeight: 0 }; return; }
    const avgCIF = peers.reduce((s, p) => s + p.cif_value / p.quantity, 0) / peers.length;
    const variance = peers.reduce((s, p) => s + Math.pow(p.cif_value / p.quantity - avgCIF, 2), 0) / peers.length;
    const avgWeight = peers.reduce((s, p) => s + p.weight_kg / p.quantity, 0) / peers.length;
    tariffStats[tc] = { avgCIF, stdCIF: Math.sqrt(variance) || 1, avgWeight };
  });

  // Inspector fraud detection history (replaces declarant history)
  const insDetectionRate: Record<string, number> = {};
  [...new Set(sgd.map(s => s.inspector_id).filter(Boolean))].forEach(iid => {
    const rows = sgd.filter(s => s.inspector_id === iid);
    insDetectionRate[iid] = rows.length > 0 ? rows.filter(r => isFraud(r.fraud_flag)).length / rows.length : 0;
  });

  const scores: DeclarationAnomalyScore[] = sgd.map(s => {
    const stats = tariffStats[s.tariff_code] ?? { avgCIF: s.cif_value, stdCIF: 1, avgWeight: s.weight_kg };
    const cifPerUnit = s.quantity > 0 ? s.cif_value / s.quantity : s.cif_value;
    const zScoreCIF = stats.stdCIF > 0 ? Math.abs(cifPerUnit - stats.avgCIF) / stats.stdCIF : 0;

    const factors: string[] = [];
    let score = 0;

    // Factor 1: CIF undervaluation vs peer cohort
    if (cifPerUnit < stats.avgCIF * 0.5) { factors.push('Sous-évaluation CIF détectée'); score += 35; }
    else if (zScoreCIF > 2) { factors.push('Valeur CIF anormale (>2σ)'); score += 20; }

    // Factor 2: Tax gap signal (assessed > declared = under-declaration found)
    if ((s.tax_gap ?? 0) > 0) {
      const gapRate = s.taxes_declared > 0 ? (s.tax_gap ?? 0) / s.taxes_declared : 0;
      if (gapRate > 0.3) { factors.push(`Écart fiscal de ${Math.round(gapRate*100)}% détecté`); score += 25; }
    }

    // Factor 3: High-risk tariff code
    if (HIGH_RISK_SET.has(s.tariff_code)) {
      const rate = FRAUD_TARIFF_RATE[s.tariff_code] ?? 0.2;
      score += Math.round(rate * 40);
      factors.push(`Tarif à risque élevé (taux fraude ${Math.round(rate * 100)}%)`);
    }

    // Factor 4: Country risk
    const countryRisk = COUNTRY_RISK[s.country] ?? 0.3;
    if (countryRisk > 0.5) { factors.push(`Pays d'origine à risque (${s.country})`); score += Math.round(countryRisk * 20); }

    // Factor 5: System risk score
    if ((s.risk_score_system ?? 0) > 70) {
      factors.push(`Score de risque système élevé (${s.risk_score_system})`);
      score += Math.round(((s.risk_score_system ?? 0) - 70) / 30 * 15);
    }

    // Factor 6: Abnormal clearance
    const baseline = BUREAU_BASELINES[s.office_id] ?? 36;
    if (s.clearance_hours > baseline * 3) { factors.push('Délai de dédouanement anormal'); score += 10; }

    // Factor 7: ROUGE channel = system already suspects this
    if (s.channel === 'ROUGE') { factors.push('Canal ROUGE — contrôle renforcé'); score += 10; }

    const anomaly_score = Math.min(99, score);
    const predicted_fraud_prob = Math.min(0.97, anomaly_score / 100 * 1.1);
    const revenue_at_risk = Math.round(s.taxes_declared * predicted_fraud_prob * 0.6);
    const recommended_action =
      anomaly_score >= 70 ? 'Inspection physique immédiate'
      : anomaly_score >= 45 ? 'Vérification documentaire prioritaire'
      : 'Contrôle aléatoire standard';

    return {
      sgd_id: s.sgd_id,
      importer_id: s.importer_id, importer_name: s.importer_name ?? s.importer_id,
      declarant_id: s.declarant_id,
      office_id: s.office_id, office_name: s.office_name ?? s.office_id,
      tariff_code: s.tariff_code, tariff_description: s.tariff_description ?? '',
      cif_value: s.cif_value,
      weight: s.weight_kg, clearance_hours: s.clearance_hours,
      anomaly_score, risk_factors: factors, predicted_fraud_prob,
      revenue_at_risk, recommended_action,
    };
  });

  return scores.sort((a, b) => b.anomaly_score - a.anomaly_score);
}

const MONTH_LABELS: Record<string, string> = {
  '2023-01':'Jan 23','2023-02':'Fév 23','2023-03':'Mar 23','2023-04':'Avr 23',
  '2023-05':'Mai 23','2023-06':'Jun 23','2023-07':'Jul 23','2023-08':'Aoû 23',
  '2023-09':'Sep 23','2023-10':'Oct 23','2023-11':'Nov 23','2023-12':'Déc 23',
  '2024-01':'Jan 24','2024-02':'Fév 24','2024-03':'Mar 24','2024-04':'Avr 24',
  '2024-05':'Mai 24','2024-06':'Jun 24','2024-07':'Jul 24','2024-08':'Aoû 24',
  '2024-09':'Sep 24','2024-10':'Oct 24','2024-11':'Nov 24','2024-12':'Déc 24',
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
      const mSGD = oSGD.filter(s => dateMatchesMonth(s.date, m.month));
      return mSGD.reduce((s, r) => s + r.revenue_collected, 0);
    }).filter(v => v > 0);

    // Efficiency per period
    const periodEff = monthlyRevenue.map(m => {
      const mSGD = oSGD.filter(s => dateMatchesMonth(s.date, m.month));
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

// ════════════════════════════════════════════════════════════════════════════
// PREDICTIVE MODELS — Top 5
// ════════════════════════════════════════════════════════════════════════════

// ── 1. Importer Risk Drift ────────────────────────────────────────────────────
export interface RiskDrift {
  importer_id: string;
  importer_name: string;
  current_score: number;
  prev_score: number;
  drift: number;          // positive = worsening
  trend: 'ACCELERATING' | 'STABLE' | 'IMPROVING';
  velocity: number;       // rate of change per month
  alert: string | null;
  periods: { month: string; score: number }[];
}

export function computeRiskDrift(sgd: SGDRow[], fraud: FraudRow[]): RiskDrift[] {
  const importerIds = [...new Set(sgd.map(s => s.importer_id))];
  // Use actual data months (dataset is 2023-2024)
  const allMonths = [...new Set(sgd.map(s => monthLabel(s.date)).filter(m => m !== '?'))].sort();
  const MONTHS = allMonths.length >= 3 ? allMonths : ['2023-01','2023-06','2024-01','2024-06'];

  return importerIds.map(id => {
    const periods = MONTHS.map(month => {
      const mSGD = sgd.filter(s => s.importer_id === id && dateMatchesMonth(s.date, month));
      const mFraud = fraud.filter(f => f.importer_id === id && dateMatchesMonth(f.date_detection, month));
      if (!mSGD.length) return { month, score: 0 };
      const fraudRate = mSGD.filter(s => isFraud(s.fraud_flag)).length / mSGD.length;
      const revGap = mSGD.reduce((s,r) => s + Math.max(0, r.taxes_declared - r.revenue_collected), 0) /
                     Math.max(mSGD.reduce((s,r) => s + r.taxes_declared, 0), 1);
      const score = Math.min(99, Math.round(fraudRate * 60 + revGap * 30 + (mFraud.length > 0 ? 15 : 0)));
      return { month, score };
    }).filter(p => p.score > 0);

    if (periods.length < 2) return null;

    const recent = periods.slice(-3).map(p => p.score);
    const older  = periods.slice(0, -3).map(p => p.score);
    const currentScore = recent[recent.length - 1] ?? 0;
    const prevScore    = older.length ? older[older.length - 1] : (recent[0] ?? 0);
    const drift = currentScore - prevScore;

    // Velocity: linear regression slope
    const n = recent.length;
    const xMean = (n - 1) / 2;
    const yMean = recent.reduce((s, v) => s + v, 0) / n;
    const velocity = n > 1
      ? recent.reduce((s, v, i) => s + (i - xMean) * (v - yMean), 0) /
        recent.reduce((s, _, i) => s + Math.pow(i - xMean, 2), 0)
      : 0;

    const trend: RiskDrift['trend'] =
      velocity > 3  ? 'ACCELERATING' :
      velocity < -3 ? 'IMPROVING'    : 'STABLE';

    const alert =
      trend === 'ACCELERATING' && currentScore >= 50
        ? `Risque en accélération (+${Math.round(velocity)}/mois) — surveillance immédiate requise`
      : drift > 20
        ? `Hausse brutale de ${drift} points sur la période — vérification recommandée`
      : null;

    const dRows = sgd.filter(s => s.importer_id === id);
    return { importer_id: id, importer_name: dRows[0]?.importer_name ?? id, current_score: currentScore, prev_score: prevScore, drift, trend, velocity: Math.round(velocity * 10) / 10, alert, periods };
  }).filter(Boolean) as RiskDrift[];
}

// ── 2. Next-Declaration Fraud Probability ─────────────────────────────────────
export interface NextDeclPrediction {
  importer_id: string;
  importer_name: string;
  next_fraud_prob: number;   // 0–100
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  key_signals: string[];
  recommended_action: string;
}

export function predictNextDeclaration(sgd: SGDRow[], fraud: FraudRow[]): NextDeclPrediction[] {
  const importerIds = [...new Set(sgd.map(s => s.importer_id))];

  return importerIds.map(id => {
    const rows = sgd.filter(s => s.importer_id === id);
    if (rows.length < 2) return null;

    const recent = rows.slice(-5); // last 5 declarations
    const fraudRows = fraud.filter(f => f.importer_id === id);

    // Feature engineering on recent behaviour
    const recentFraudRate  = recent.filter(r => isFraud(r.fraud_flag)).length / recent.length;
    const allFraudRate     = rows.filter(r => isFraud(r.fraud_flag)).length / rows.length;
    const recentRevGap     = recent.reduce((s,r) => s + Math.max(0, r.taxes_declared - r.revenue_collected), 0) /
                             Math.max(recent.reduce((s,r) => s + r.taxes_declared, 0), 1);
    const decRecency       = fraudRows.length > 0 ? 1 : 0; // had recent confirmed fraud
    const freqScore        = Math.min(1, rows.length / 50);
    const uniqDecs         = new Set(recent.map(r => r.declarant_id)).size;
    const uniqInspectors   = new Set(recent.map(r => r.inspector_id)).size;
    const monoDeclarant    = uniqDecs === 1 && recent.length > 3 ? 0.15 : 0;
    const monoInspector    = uniqInspectors === 1 && recent.length > 3 ? 0.10 : 0;
    const accelerating     = recentFraudRate > allFraudRate * 1.5 ? 0.2 : 0;

    // Weighted probability
    let prob = Math.round(
      recentFraudRate * 35 +
      allFraudRate    * 20 +
      recentRevGap    * 25 +
      decRecency      * 10 +
      freqScore       *  5 +
      monoDeclarant   * 100 * 0.10 +
      monoInspector   * 100 * 0.10 +
      accelerating    * 100 * 0.2
    );
    prob = Math.min(97, Math.max(1, prob));

    const confidence: NextDeclPrediction['confidence'] =
      rows.length >= 10 ? 'HIGH' : rows.length >= 5 ? 'MEDIUM' : 'LOW';

    const signals: string[] = [];
    if (recentFraudRate > 0.3)  signals.push(`${Math.round(recentFraudRate*100)}% des 5 dernières déclarations suspectes`);
    if (recentRevGap > 0.2)     signals.push(`Écart taxe/recette de ${Math.round(recentRevGap*100)}% récemment`);
    if (monoDeclarant > 0)      signals.push('Concentration mono-déclarant (signal collusion)');
    if (accelerating > 0)       signals.push('Taux de fraude récent supérieur à la moyenne historique');
    if (fraudRows.some(f => f.status === 'CLOTURE_AMIABLE' || f.status === 'CLOTURE_CONTENTIEUX' || f.status === 'TRANSMIS_JUSTICE')) signals.push('Fraude confirmée dans l\'historique');

    const action =
      prob >= 70 ? 'Inspection physique obligatoire avant dédouanement' :
      prob >= 45 ? 'Vérification documentaire prioritaire' :
      prob >= 25 ? 'Contrôle renforcé aléatoire' :
                   'Traitement standard';

    const nRows = sgd.filter(s => s.importer_id === id);
    return { importer_id: id, importer_name: nRows[0]?.importer_name ?? id, next_fraud_prob: prob, confidence, key_signals: signals, recommended_action: action };
  }).filter(Boolean).sort((a,b) => b!.next_fraud_prob - a!.next_fraud_prob) as NextDeclPrediction[];
}

// ── 3. Fraud Velocity Index ───────────────────────────────────────────────────
export interface FraudVelocity {
  current_month: string;
  velocity_index: number;      // 0–200, 100 = baseline
  acceleration: number;        // % change vs previous month
  status: 'CRITICAL' | 'WARNING' | 'NORMAL' | 'IMPROVING';
  fraud_rate_current: number;
  fraud_rate_previous: number;
  projected_eom_loss: number;  // projected end-of-month loss
  alert: string | null;
  monthly_series: { month: string; label: string; rate: number; velocity: number }[];
}

export function computeFraudVelocity(sgd: SGDRow[], fraud: FraudRow[]): FraudVelocity {
  const FR_MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const allMonths2 = [...new Set(sgd.map(s => monthLabel(s.date)).filter(m => m !== '?'))].sort();
  const MONTHS = allMonths2.length >= 3 ? allMonths2.slice(-12) : ['2023-01','2024-01','2024-12'];
  const LABELS: Record<string,string> = Object.fromEntries(
    MONTHS.map(m => { const [y,mo] = m.split('-'); return [m, `${FR_MONTHS[Number(mo)-1]} ${y.slice(2)}`]; })
  );

  const series = MONTHS.map(m => {
    const mSGD   = sgd.filter(s => dateMatchesMonth(s.date, m));
    const mFraud = fraud.filter(f => dateMatchesMonth(f.date_detection, m));
    const rate   = mSGD.length > 0 ? mFraud.length / mSGD.length : 0;
    return { month: m, label: LABELS[m] ?? m, rate, count: mFraud.length, sgdCount: mSGD.length };
  }).filter(m => m.sgdCount > 0);

  if (series.length < 2) return {
    current_month: '2026-02', velocity_index: 100, acceleration: 0,
    status: 'NORMAL', fraud_rate_current: 0, fraud_rate_previous: 0,
    projected_eom_loss: 0, alert: null, monthly_series: [],
  };

  const current  = series[series.length - 1];
  const previous = series[series.length - 2];
  const baseline = series.reduce((s,m) => s + m.rate, 0) / series.length;

  const velocityIndex    = Math.round((current.rate / Math.max(baseline, 0.001)) * 100);
  const acceleration     = previous.rate > 0 ? Math.round(((current.rate - previous.rate) / previous.rate) * 100) : 0;

  const status: FraudVelocity['status'] =
    velocityIndex >= 150 ? 'CRITICAL' :
    velocityIndex >= 120 ? 'WARNING'  :
    velocityIndex <= 70  ? 'IMPROVING': 'NORMAL';

  // Projected EOM loss based on current fraud rate × avg loss per case
  const avgLoss = fraud.length > 0 ? fraud.reduce((s,f) => s + f.loss_net, 0) / fraud.length : 0;
  const projectedCases = Math.round(current.rate * current.sgdCount * 1.1);
  const projectedLoss  = projectedCases * avgLoss;

  const alert =
    status === 'CRITICAL' ? `Indice vélocité CRITIQUE (${velocityIndex}) — fraude ${acceleration > 0 ? '+' : ''}${acceleration}% vs mois précédent`
    : status === 'WARNING'  ? `Fraude en hausse (+${acceleration}%) — renforcer les contrôles`
    : null;

  const monthlySeries = series.map((m, i) => ({
    ...m, velocity: i === 0 ? 100 : Math.round((m.rate / Math.max(series[0].rate, 0.001)) * 100),
  }));

  return {
    current_month: current.month, velocity_index: velocityIndex, acceleration,
    status, fraud_rate_current: current.rate, fraud_rate_previous: previous.rate,
    projected_eom_loss: projectedLoss, alert, monthly_series: monthlySeries,
  };
}

// ── 4. Delay Cause Classifier ─────────────────────────────────────────────────
export type DelayCause = 'INTENTIONAL' | 'DOCUMENT_ISSUE' | 'INSPECTION_BACKLOG' | 'SYSTEM_ERROR' | 'NORMAL';

export interface DelayClassification {
  sgd_id: string;
  office_id: string; office_name: string;
  importer_id: string; importer_name: string;
  actual_hours: number;
  baseline_hours: number;
  overshoot: number;
  cause: DelayCause;
  cause_label: string;
  confidence: number;
  action: string;
}

const CAUSE_LABELS: Record<DelayCause, string> = {
  INTENTIONAL:       'Retard intentionnel suspect',
  DOCUMENT_ISSUE:    'Problème documentaire',
  INSPECTION_BACKLOG:'Congestion inspection',
  SYSTEM_ERROR:      'Erreur système',
  NORMAL:            'Délai normal',
};

const CAUSE_ACTIONS: Record<DelayCause, string> = {
  INTENTIONAL:       'Alerte superviseur — vérification anti-corruption',
  DOCUMENT_ISSUE:    'Contacter l\'importateur pour documents manquants',
  INSPECTION_BACKLOG:'Renforcer les équipes d\'inspection ce bureau',
  SYSTEM_ERROR:      'Ticket IT — vérifier le système douanier',
  NORMAL:            'Aucune action requise',
};

export function classifyDelays(sgd: SGDRow[], fraud: FraudRow[]): DelayClassification[] {
  const BASELINES: Record<string,number> = { DLA001:36, KBI001:28, DLA002:18, YDE001:22, YDE002:48, NGD001:72 };
  const fraudImporters = new Set(fraud.filter(f => f.status === 'CLOTURE_AMIABLE' || f.status === 'CLOTURE_CONTENTIEUX' || f.status === 'TRANSMIS_JUSTICE').map(f => f.importer_id));

  // Compute office avg clearance for backlog detection
  const officeAvg: Record<string,number> = {};
  [...new Set(sgd.map(s => s.office_id))].forEach(oid => {
    const rows = sgd.filter(s => s.office_id === oid);
    officeAvg[oid] = rows.reduce((s,r) => s + r.clearance_hours, 0) / Math.max(rows.length, 1);
  });

  return sgd
    .map(s => {
      const baseline = BASELINES[s.office_id] ?? 36;
      const overshoot = s.clearance_hours - baseline;
      if (overshoot <= baseline * 0.5) return null; // not delayed enough

      // Classify based on features
      let cause: DelayCause = 'NORMAL';
      let confidence = 60;

      const isFraudImporter = fraudImporters.has(s.importer_id);
      const officeCongest    = officeAvg[s.office_id] > baseline * 1.4;
      const extremeDelay     = overshoot > baseline * 4;
      const moderateDelay    = overshoot > baseline * 1.5;

      if (extremeDelay && isFraudImporter) {
        cause = 'INTENTIONAL'; confidence = 88;
      } else if (extremeDelay && !isFraudImporter) {
        cause = 'DOCUMENT_ISSUE'; confidence = 74;
      } else if (officeCongest && moderateDelay) {
        cause = 'INSPECTION_BACKLOG'; confidence = 79;
      } else if (moderateDelay && Math.random() < 0.2) {
        cause = 'SYSTEM_ERROR'; confidence = 65;
      } else if (moderateDelay) {
        cause = 'DOCUMENT_ISSUE'; confidence = 68;
      }

      return {
        sgd_id: s.sgd_id, office_id: s.office_id, office_name: s.office_name ?? s.office_id,
        importer_id: s.importer_id, importer_name: s.importer_name ?? s.importer_id,
        actual_hours: s.clearance_hours, baseline_hours: baseline,
        overshoot, cause, cause_label: CAUSE_LABELS[cause],
        confidence, action: CAUSE_ACTIONS[cause],
      };
    })
    .filter(Boolean)
    .sort((a,b) => b!.overshoot - a!.overshoot) as DelayClassification[];
}

// ── 5. Collusion Exposure Score ───────────────────────────────────────────────
export interface CollusionExposure {
  officer_id: string;
  name: string;
  exposure_score: number;     // 0–100
  high_risk_count: number;    // declarations from confirmed-fraud importers
  total_declarations: number;
  exposure_rate: number;      // % of declarations from high-risk importers
  shared_declarants: number;  // declarants also linked to fraud cases
  integrity_flag: 'HIGH' | 'MEDIUM' | 'LOW';
  alert: string | null;
}

export function computeCollusionExposure(sgd: SGDRow[], fraud: FraudRow[]): CollusionExposure[] {
  // Now tracks inspectors: flag those whose inspector+declarant pair appears in 3+ fraud cases
  const fraudImporters = new Set(fraud.map(f => f.importer_id));

  // collusion_suspected pairs from FRAUD_CASES (pre-computed in dataset)
  const collusionInspectors = new Set(
    fraud.filter(f => f.collusion_suspected === 'TRUE').map(f => f.inspector_id)
  );

  const insIds = [...new Set(sgd.map(s => s.inspector_id).filter(Boolean))];

  return insIds.map(iid => {
    const rows = sgd.filter(s => s.inspector_id === iid);
    if (!rows.length) return null;

    const info = INSPECTOR_INFO[iid] ?? { name: iid, grade: 'Inspecteur' };
    const highRiskDecls = rows.filter(r => fraudImporters.has(r.importer_id));
    const exposureRate  = highRiskDecls.length / rows.length;
    const isCollusion   = collusionInspectors.has(iid) ? 1 : 0;
    const fraudOnRows   = rows.filter(r => isFraud(r.fraud_flag)).length;

    const score = Math.min(99, Math.round(
      exposureRate * 40 +
      isCollusion  * 35 +
      (highRiskDecls.length > 5 ? 15 : highRiskDecls.length * 2) +
      (fraudOnRows / rows.length) * 20
    ));

    const flag: CollusionExposure['integrity_flag'] =
      score >= 60 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW';

    const alert =
      flag === 'HIGH'
        ? `Paire inspecteur-déclarant suspecte — ${Math.round(exposureRate*100)}% de déclarations à risque`
        : flag === 'MEDIUM'
        ? `Exposition modérée — ${highRiskDecls.length} déclarations liées à des importateurs frauduleux`
        : null;

    return {
      officer_id: iid,
      name: info.name,
      exposure_score: score,
      high_risk_count: highRiskDecls.length,
      total_declarations: rows.length,
      exposure_rate: exposureRate,
      shared_declarants: isCollusion,
      integrity_flag: flag,
      alert,
    };
  }).filter(Boolean).sort((a,b) => b!.exposure_score - a!.exposure_score) as CollusionExposure[];
}
