import { Pool } from 'pg';
import type { SGDRow, FraudRow, Overview } from '../types/index';

// ── Dual-source switch ────────────────────────────────────────────────────────
// getSheetData() in sheets.ts calls isPostgresConfigured() to decide whether to
// read from this module (Railway PostgreSQL, populated by the Option C ELT
// pipeline) or fall back to the original Google Sheets path. Nothing else in
// the app needs to change.
export function isPostgresConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

// Single pool, reused across requests/calls -- do not create a new Pool per call.
let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

// ── Field-mapping notes ────────────────────────────────────────────────────────
// The ELT pipeline's schema (analytics.declarations / analytics.fraud_cases /
// analytics.offices / analytics.officers / scoring.declaration_scores) does not
// carry a 1:1 field for every SGDRow/FraudRow column that the original
// Google-Sheets-based synthetic dataset had. Every field below that has no real
// equivalent is explicitly defaulted and commented -- search this file for
// "APPROX" to find every judgment call that should be reviewed before relying
// on it for anything beyond a demo.
//
// Two mismatches this mapping corrects for (found by reading analytics.ts):
//   - `channel` is compared elsewhere as uppercase French labels, e.g.
//     `r.channel === 'ROUGE'` -- the ELT pipeline's circuit values are stored as
//     'Vert'/'Bleu'/'Jaune'/'Rouge' (mixed case) in analytics.declarations.
//     inspection_type, so this mapping upper-cases them.
//   - `officer_override` is compared as the literal string 'YES' elsewhere
//     (`r.officer_override === 'YES'`) -- the ELT pipeline stores it as a
//     Postgres boolean, so this mapping converts true/false -> 'YES'/'NO'.
//   - `risk_score_system` is compared against a 0-100 scale (`> 70`) elsewhere,
//     while scoring.declaration_scores.composite_risk is 0-1 -- this mapping
//     multiplies by 100.

interface DeclarationJoinRow {
  sgd_id: string;
  declaration_date: string | null;
  office_id: string | null;
  office_name: string | null;
  importer_id: string | null;
  importer_name: string | null; // pseudonym, e.g. "IMP-a3f9c1e2" -- not a real name (Option C)
  declarant_id: string | null;
  inspector_id: string | null;
  officer_name: string | null; // pseudonym, e.g. "OFR-5c55c298" -- not a real name (Option C)
  tariff_code: string | null;
  regime: string | null;
  origin_country: string | null;
  transit_country: string | null;
  fob_value: string | null;
  cif_value: string | null;
  duty_assessed: string | null;
  duty_collected: string | null;
  quantity: string | null;
  weight_kg: string | null;
  inspection_type: string | null; // holds the circuit color, see notes above
  payment_mode: string | null;
  clearance_hours: string | null;
  officer_override: boolean | null;
  composite_risk: string | null;
  risk_tier: string | null;
  fraud_type: string | null;
  fraud_seizure_value: string | null;
}

function num(v: string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function riskProfile(tier: string | null): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (tier === 'CRITICAL' || tier === 'HIGH') return 'HIGH';
  if (tier === 'MEDIUM') return 'MEDIUM';
  return 'LOW';
}

async function fetchDeclarations(): Promise<SGDRow[]> {
  const { rows } = await getPool().query<DeclarationJoinRow>(`
    SELECT
      d.sgd_id, d.declaration_date::text, d.office_id, o.office_name,
      d.importer_id, d.importer_name, d.declarant_id, d.inspector_id,
      of_.officer_name, d.tariff_code, d.regime, d.origin_country, d.transit_country,
      d.fob_value::text, d.cif_value::text, d.duty_assessed::text, d.duty_collected::text,
      d.quantity::text, d.weight_kg::text, d.inspection_type, d.payment_mode,
      d.clearance_hours::text, d.officer_override,
      s.composite_risk::text, s.risk_tier,
      fc.fraud_type, fc.seizure_value::text AS fraud_seizure_value
    FROM analytics.declarations d
    LEFT JOIN analytics.offices o ON o.office_id = d.office_id
    LEFT JOIN analytics.officers of_ ON of_.inspector_id = d.inspector_id
    LEFT JOIN scoring.declaration_scores s ON s.sgd_id = d.sgd_id
    LEFT JOIN analytics.fraud_cases fc ON fc.sgd_id = d.sgd_id
  `);

  return rows.map((r): SGDRow => {
    const dutyAssessed = num(r.duty_assessed);
    const dutyCollected = num(r.duty_collected);
    const channel = (r.inspection_type ?? '').toUpperCase(); // 'VERT'|'BLEU'|'JAUNE'|'ROUGE'
    const hasFraud = r.fraud_type !== null && r.fraud_type !== '';

    return {
      sgd_id: r.sgd_id,
      date: r.declaration_date ?? '',
      importer_id: r.importer_id ?? '',
      importer_name: r.importer_name ?? '', // pseudonym
      importer_risk_profile: riskProfile(r.risk_tier),
      declarant_id: r.declarant_id ?? '',
      declarant_name: '', // APPROX: no declarant-name pseudonym generated by the ELT pipeline
      inspector_id: r.inspector_id ?? '',
      inspector_name: r.officer_name ?? '', // pseudonym
      office_id: r.office_id ?? '',
      office_name: r.office_name ?? '',
      country: r.origin_country ?? '',
      tariff_code: r.tariff_code ?? '',
      tariff_description: '', // APPROX: HS descriptions not generated by the ELT pipeline
      quantity: num(r.quantity),
      weight_kg: num(r.weight_kg),
      cif_value: num(r.cif_value),
      // APPROX: the ELT pipeline only models one "assessed" duty figure (no
      // separate self-declared-by-importer figure), so taxes_declared reuses
      // duty_assessed. Revisit if the frontend actually needs the two to differ.
      taxes_declared: dutyAssessed,
      taxes_assessed: dutyAssessed,
      revenue_collected: dutyCollected,
      tax_gap: Math.max(0, dutyAssessed - dutyCollected),
      clearance_hours: num(r.clearance_hours),
      inspection_type: '', // APPROX: inspection_type column is repurposed for `channel` (see notes)
      inspection_result: '', // APPROX: not modeled by the ELT pipeline
      seizure_value: num(r.fraud_seizure_value), // 0 unless this declaration has a linked fraud case
      transit_country: r.transit_country ?? '',
      payment_mode: r.payment_mode ?? '',
      regime_code: r.regime ?? '',
      processing_days: num(r.clearance_hours) / 24, // APPROX: derived, not a distinct source field
      officer_override: r.officer_override ? 'YES' : 'NO',
      channel,
      fraud_flag: hasFraud ? 1 : 0,
      fraud_type: r.fraud_type ?? '',
      risk_score_system: Math.round(num(r.composite_risk) * 100), // 0-1 -> 0-100
    };
  });
}

interface FraudJoinRow {
  fraud_id: string;
  sgd_id: string | null;
  date_ouverture: string | null;
  date_cloture: string | null;
  fraud_type: string | null;
  seizure_value: string | null;
  resolution_mode: string | null;
  evidence_type: string | null;
  notes: string | null;
  importer_id: string | null;
  importer_name: string | null;
  declarant_id: string | null;
  inspector_id: string | null;
  office_id: string | null;
  tariff_code: string | null;
  origin_country: string | null;
  fob_value: string | null;
  cif_value: string | null;
  duty_assessed: string | null;
  duty_collected: string | null;
  composite_risk: string | null;
}

// APPROX: maps the ELT pipeline's free-text resolution_mode onto the fixed
// status enum the frontend/analytics code expects. Cases with no
// date_cloture yet are always EN_COURS regardless of resolution_mode.
function mapStatus(resolutionMode: string | null, dateCloture: string | null): FraudRow['status'] {
  if (!dateCloture) return 'EN_COURS';
  switch (resolutionMode) {
    case 'Transaction':
    case 'Amende administrative':
      return 'CLOTURE_AMIABLE';
    case 'Saisie':
      return 'CLOTURE_CONTENTIEUX';
    case 'Poursuite judiciaire':
      return 'TRANSMIS_JUSTICE';
    case 'Classement sans suite':
      return 'ABANDONNE';
    default:
      return 'CLOTURE_AMIABLE';
  }
}

async function fetchFraudCases(): Promise<FraudRow[]> {
  const { rows } = await getPool().query<FraudJoinRow>(`
    SELECT
      fc.fraud_id, fc.sgd_id, fc.date_ouverture::text, fc.date_cloture::text,
      fc.fraud_type, fc.seizure_value::text, fc.resolution_mode, fc.evidence_type, fc.notes,
      d.importer_id, d.importer_name, d.declarant_id, d.inspector_id, d.office_id,
      d.tariff_code, d.origin_country, d.fob_value::text, d.cif_value::text,
      d.duty_assessed::text, d.duty_collected::text,
      s.composite_risk::text
    FROM analytics.fraud_cases fc
    LEFT JOIN analytics.declarations d ON d.sgd_id = fc.sgd_id
    LEFT JOIN scoring.declaration_scores s ON s.sgd_id = fc.sgd_id
  `);

  return rows.map((r): FraudRow => {
    const dutyAssessed = num(r.duty_assessed);
    const dutyCollected = num(r.duty_collected);
    const taxEvasion = Math.max(0, dutyAssessed - dutyCollected);
    const penalty = 0; // APPROX: no distinct penalty figure modeled by the ELT pipeline
    const totalDue = taxEvasion + penalty;
    const status = mapStatus(r.resolution_mode, r.date_cloture);
    const seizureValue = num(r.seizure_value);
    // APPROX: amount_recovered must stay bounded by total_amount_due -- an
    // earlier version of this mapping used the declaration's full
    // duty_collected here, which is unrelated to the case's own amount owed
    // and produced recovery rates over 500%. Approximation instead: a case
    // closed amicably is treated as fully recovered; a contentious/judicial
    // case recovers up to the seizure value; an open or abandoned case
    // recovers nothing.
    const amountRecovered =
      status === 'CLOTURE_AMIABLE' ? totalDue
      : (status === 'CLOTURE_CONTENTIEUX' || status === 'TRANSMIS_JUSTICE') ? Math.min(seizureValue, totalDue)
      : 0;

    return {
      case_id: r.fraud_id,
      sgd_id: r.sgd_id ?? '',
      date_detection: r.date_ouverture ?? '', // APPROX: no separate detection-date field
      date_ouverture_dossier: r.date_ouverture ?? '',
      date_cloture: r.date_cloture ?? '',
      importer_id: r.importer_id ?? '',
      importer_name: r.importer_name ?? '', // pseudonym
      declarant_id: r.declarant_id ?? '',
      inspector_id: r.inspector_id ?? '',
      office_id: r.office_id ?? '',
      fraud_type: r.fraud_type ?? '',
      tariff_code: r.tariff_code ?? '',
      country_origin: r.origin_country ?? '',
      declared_value: num(r.fob_value),
      assessed_value: num(r.cif_value),
      tax_evasion_amount: taxEvasion,
      penalty_amount: penalty,
      total_amount_due: totalDue,
      amount_recovered: amountRecovered,
      recovery_rate: totalDue > 0 ? Math.round((amountRecovered / totalDue) * 100) / 100 : 0,
      loss_net: Math.max(0, totalDue - amountRecovered),
      status,
      resolution_mode: r.resolution_mode ?? '',
      ai_risk_score: Math.round(num(r.composite_risk) * 100), // 0-1 -> 0-100
      was_system_flagged: (r.evidence_type ?? '').includes('DATE') || (r.evidence_type ?? '').includes('IA') ? 'true' : 'false', // APPROX
      collusion_suspected: 'false', // APPROX: not modeled by the ELT pipeline
      repeat_offender: 'false', // APPROX: would need a correlated count of other cases per importer_id
      seizure_made: seizureValue > 0 ? 'true' : 'false',
      seizure_value: seizureValue,
      evidence_type: r.evidence_type ?? '',
      referral_to_justice: status === 'TRANSMIS_JUSTICE' ? 'true' : 'false',
      notes: r.notes ?? '',
    };
  });
}

export async function getPostgresData(): Promise<{ sgd: SGDRow[]; fraud: FraudRow[] }> {
  const [sgd, fraud] = await Promise.all([fetchDeclarations(), fetchFraudCases()]);
  return { sgd, fraud };
}

// ─────────────────────────────────────────────────────────────────────────────
// SQL-aggregated /api/overview (performance fix)
//
// WHY THIS EXISTS: the naive path -- getPostgresData() then
// analytics.ts's buildOverview(sgd, fraud) -- pulls all ~1.05M declaration
// rows + ~31.5K fraud rows into Node, then buildOverview()'s
// `high_risk_importers` field calls buildImporterProfiles(sgd, fraud),
// which for EACH of ~8,000 importers re-filters the FULL declarations array
// (computeDATEFactors does `sgds.filter(s => s.importer_id === importerId)`
// against the whole array). At 1,050,000 declarations that's roughly
// 8,000 x 1,050,000 ~= 8.4 BILLION comparisons on a single request -- this
// is what was causing Railway to return 502 on GET /api/overview.
//
// getOverviewFromDB() computes the exact same Overview shape directly in
// Postgres via GROUP BY / FILTER aggregate queries, so Node never
// materializes the raw per-declaration rows for this endpoint. The
// per-importer risk scoring drops from O(importers x total_rows) to one
// indexed GROUP BY producing ~8,000 rows, with the final DATE-factor
// scoring done in JS over that small result -- cheap, and easy to audit
// against computeDATEFactors()/computeRiskScore() in analytics.ts.
//
// Verified field-for-field against an independent brute-force JS
// recomputation over the real 1,050,000-row / 31,500-fraud-case database
// (all 13 cross-checked fields matched exactly) before being wired in here.
// ─────────────────────────────────────────────────────────────────────────────

const FR_MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

const OVERVIEW_STATUS_LABELS: Record<string, string> = {
  EN_COURS: 'En cours',
  CLOTURE_AMIABLE: 'Clôturé amiable',
  CLOTURE_CONTENTIEUX: 'Contentieux',
  TRANSMIS_JUSTICE: 'Justice',
  ABANDONNE: 'Abandonné',
};

// Matches OFFICE_BASELINES in analytics.ts exactly.
const OFFICE_BASELINE_CTE = `(VALUES
  ('LT1',36),('LT2',22),('SD2',28),('SD1',30),('CTR',26),('ADM',72),
  ('OUE',40),('NRD',48),('EXN',50),('NRO',44),('SUO',32),('EST',60)
) AS baselines(office_id, baseline_hours)`;

// Matches HIGH_RISK_TARIFFS Set in analytics.ts exactly.
const HIGH_RISK_TARIFFS_SQL = `('85044000','62046200','85176200','87032390','84715000','85258000')`;
// Matches the highRiskCountries Set inside computeDATEFactors() exactly.
const HIGH_RISK_COUNTRIES_SQL = `('CN','NG','AE','BJ','CI')`;

// Matches mapStatus() above exactly (no date_cloture -> EN_COURS, else keyed
// off resolution_mode, unrecognised mode -> CLOTURE_AMIABLE).
const OVERVIEW_STATUS_CASE = `
  CASE
    WHEN fc.date_cloture IS NULL THEN 'EN_COURS'
    WHEN fc.resolution_mode IN ('Transaction','Amende administrative') THEN 'CLOTURE_AMIABLE'
    WHEN fc.resolution_mode = 'Saisie' THEN 'CLOTURE_CONTENTIEUX'
    WHEN fc.resolution_mode = 'Poursuite judiciaire' THEN 'TRANSMIS_JUSTICE'
    WHEN fc.resolution_mode = 'Classement sans suite' THEN 'ABANDONNE'
    ELSE 'CLOTURE_AMIABLE'
  END
`;

// $1 = bureau ('ALL' or an office_id), $2 = period ('ALL' or 'YYYY-MM')
const OVERVIEW_DECL_CTE = `
  decl_filtered AS (
    SELECT
      d.sgd_id, d.office_id, d.importer_id, d.tariff_code, d.origin_country,
      d.inspector_id, d.declaration_date, d.duty_assessed, d.duty_collected,
      d.clearance_hours, UPPER(COALESCE(d.inspection_type,'')) AS channel,
      s.composite_risk,
      (fc.fraud_type IS NOT NULL AND fc.fraud_type <> '') AS has_fraud
    FROM analytics.declarations d
    LEFT JOIN scoring.declaration_scores s ON s.sgd_id = d.sgd_id
    LEFT JOIN analytics.fraud_cases fc ON fc.sgd_id = d.sgd_id
    WHERE ($1::text = 'ALL' OR d.office_id = $1)
      AND ($2::text = 'ALL' OR to_char(d.declaration_date, 'YYYY-MM') = $2)
  )
`;

const OVERVIEW_FRAUD_CTE = `
  fraud_calc AS (
    SELECT
      fc.fraud_id, fc.date_ouverture, fc.date_cloture,
      d.office_id, d.importer_id,
      GREATEST(COALESCE(d.duty_assessed,0) - COALESCE(d.duty_collected,0), 0) AS tax_evasion,
      COALESCE(fc.seizure_value, 0) AS seizure_value,
      ${OVERVIEW_STATUS_CASE} AS status
    FROM analytics.fraud_cases fc
    LEFT JOIN analytics.declarations d ON d.sgd_id = fc.sgd_id
  ),
  fraud_filtered AS (
    SELECT *,
      tax_evasion AS total_due, -- penalty_amount is always 0 (APPROX, matches fetchFraudCases())
      CASE
        WHEN status = 'CLOTURE_AMIABLE' THEN tax_evasion
        WHEN status IN ('CLOTURE_CONTENTIEUX','TRANSMIS_JUSTICE') THEN LEAST(seizure_value, tax_evasion)
        ELSE 0
      END AS amount_recovered
    FROM fraud_calc
    WHERE ($1::text = 'ALL' OR office_id = $1)
      AND ($2::text = 'ALL' OR to_char(date_ouverture, 'YYYY-MM') = $2)
  )
`;

export async function getOverviewFromDB(bureau: string, period: string): Promise<Overview> {
  const pool = getPool();
  const params = [bureau, period];

  const [
    totalsResult, channelRows, officeRows, tariffRows, inspectorRows,
    declMonthRows, fraudMonthRows, statusDistResult, fraudTotalsResult, importerRows,
  ] = await Promise.all([
    pool.query(`
      WITH ${OVERVIEW_DECL_CTE}
      SELECT
        COUNT(*)::bigint AS total_sgd,
        COALESCE(SUM(duty_collected),0)::float8 AS total_revenue,
        COALESCE(SUM(duty_assessed),0)::float8 AS taxes_assessed,
        COUNT(*) FILTER (WHERE has_fraud)::bigint AS fraud_flagged_count,
        COALESCE(AVG(clearance_hours),0)::float8 AS avg_clearance_hours,
        COUNT(*) FILTER (
          WHERE clearance_hours > COALESCE(b.baseline_hours,36) * 1.5
        )::bigint AS overdue_count
      FROM decl_filtered d
      LEFT JOIN ${OFFICE_BASELINE_CTE} b ON b.office_id = d.office_id
    `, params),

    pool.query(`
      WITH ${OVERVIEW_DECL_CTE}
      SELECT channel, COUNT(*)::bigint AS count
      FROM decl_filtered
      GROUP BY channel
      ORDER BY count DESC
    `, params),

    pool.query(`
      WITH ${OVERVIEW_DECL_CTE}
      SELECT
        d.office_id,
        COALESCE(o.office_name, d.office_id) AS name,
        COUNT(*)::bigint AS count,
        COALESCE(SUM(d.duty_collected),0)::float8 AS revenue,
        COUNT(*) FILTER (WHERE d.has_fraud)::bigint AS fraud_count,
        COALESCE(AVG(d.clearance_hours),0)::float8 AS avg_hours,
        COALESCE(b.baseline_hours,36)::float8 AS baseline_hours
      FROM decl_filtered d
      LEFT JOIN analytics.offices o ON o.office_id = d.office_id
      LEFT JOIN ${OFFICE_BASELINE_CTE} b ON b.office_id = d.office_id
      GROUP BY d.office_id, o.office_name, b.baseline_hours
      ORDER BY revenue DESC
    `, params),

    pool.query(`
      WITH ${OVERVIEW_DECL_CTE}
      SELECT tariff_code, COALESCE(SUM(duty_collected),0)::float8 AS revenue, COUNT(*)::bigint AS declarations
      FROM decl_filtered
      GROUP BY tariff_code
      ORDER BY revenue DESC
      LIMIT 15
    `, params),

    pool.query(`
      WITH ${OVERVIEW_DECL_CTE}
      SELECT
        d.inspector_id AS id,
        COALESCE(off.officer_name, d.inspector_id) AS name,
        COALESCE(off.office_id, MIN(d.office_id)) AS bureau,
        COUNT(*) FILTER (WHERE d.has_fraud)::bigint AS fraud_detected,
        COUNT(*)::bigint AS total
      FROM decl_filtered d
      LEFT JOIN analytics.officers off ON off.inspector_id = d.inspector_id
      GROUP BY d.inspector_id, off.officer_name, off.office_id
      ORDER BY fraud_detected DESC
      LIMIT 5
    `, params),

    pool.query(`
      WITH ${OVERVIEW_DECL_CTE}
      SELECT to_char(declaration_date,'YYYY-MM') AS month,
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE has_fraud)::bigint AS count,
        COALESCE(SUM(duty_assessed),0)::float8 AS expected,
        COALESCE(SUM(duty_collected),0)::float8 AS collected
      FROM decl_filtered
      WHERE declaration_date IS NOT NULL
      GROUP BY 1
    `, params),

    pool.query(`
      WITH ${OVERVIEW_FRAUD_CTE}
      SELECT to_char(date_ouverture,'YYYY-MM') AS month,
        COALESCE(SUM(tax_evasion),0)::float8 AS evasion
      FROM fraud_filtered
      WHERE date_ouverture IS NOT NULL
      GROUP BY 1
    `, params),

    pool.query(`
      WITH ${OVERVIEW_FRAUD_CTE}
      SELECT status, COUNT(*)::bigint AS count,
        COALESCE(SUM(GREATEST(total_due - amount_recovered,0)),0)::float8 AS loss
      FROM fraud_filtered
      GROUP BY status
      ORDER BY count DESC
    `, params),

    pool.query(`
      WITH ${OVERVIEW_FRAUD_CTE}
      SELECT
        COUNT(*)::bigint AS fraud_count,
        COUNT(*) FILTER (WHERE status IN ('CLOTURE_AMIABLE','CLOTURE_CONTENTIEUX','TRANSMIS_JUSTICE'))::bigint AS fraud_confirmed,
        COUNT(*) FILTER (WHERE status = 'EN_COURS')::bigint AS cases_open,
        COUNT(*) FILTER (WHERE status = 'TRANSMIS_JUSTICE')::bigint AS cases_justice,
        COUNT(*) FILTER (WHERE status = 'ABANDONNE')::bigint AS cases_abandoned,
        COALESCE(SUM(tax_evasion),0)::float8 AS tax_evasion_total,
        COALESCE(SUM(amount_recovered),0)::float8 AS amount_recovered,
        COALESCE(SUM(GREATEST(total_due - amount_recovered,0)),0)::float8 AS net_loss
      FROM fraud_filtered
    `, params),

    pool.query(`
      WITH ${OVERVIEW_DECL_CTE},
      importer_calc AS (
        SELECT
          d.importer_id,
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (WHERE d.has_fraud)::bigint AS fraud_flagged,
          COUNT(*) FILTER (WHERE d.tariff_code IN ${HIGH_RISK_TARIFFS_SQL})::bigint AS high_risk_tariff_count,
          COUNT(*) FILTER (WHERE d.origin_country IN ${HIGH_RISK_COUNTRIES_SQL})::bigint AS high_risk_origin_count,
          COALESCE(AVG(d.composite_risk * 100),0)::float8 AS risk_system_avg,
          COALESCE(SUM(GREATEST(d.duty_assessed - d.duty_collected,0)) FILTER (WHERE d.has_fraud),0)::float8 AS fraud_tax_gap_sum,
          COALESCE(SUM(d.duty_assessed) FILTER (WHERE d.has_fraud),0)::float8 AS fraud_taxes_declared_sum
        FROM decl_filtered d
        WHERE d.importer_id IS NOT NULL
        GROUP BY d.importer_id
      )
      SELECT ic.*, COALESCE(fc2.confirmed,0)::bigint AS confirmed
      FROM importer_calc ic
      LEFT JOIN (
        WITH ${OVERVIEW_FRAUD_CTE}
        SELECT importer_id, COUNT(*)::bigint AS confirmed
        FROM fraud_filtered
        WHERE status IN ('CLOTURE_AMIABLE','CLOTURE_CONTENTIEUX','TRANSMIS_JUSTICE') AND importer_id IS NOT NULL
        GROUP BY importer_id
      ) fc2 ON fc2.importer_id = ic.importer_id
    `, params),
  ]);

  const t = totalsResult.rows[0];
  const totalSgd = Number(t.total_sgd);

  const f = fraudTotalsResult.rows[0];
  const taxEvasionTotal = Number(f.tax_evasion_total);
  const penaltiesRaised = 0; // APPROX, always 0 -- matches fetchFraudCases()
  const amountRecovered = Number(f.amount_recovered);
  const netLoss = Number(f.net_loss);
  const recoveryRate = (taxEvasionTotal + penaltiesRaised) > 0 ? amountRecovered / (taxEvasionTotal + penaltiesRaised) : 0;

  const overdueCount = Number(t.overdue_count);
  const overduePct = totalSgd > 0 ? Math.round((overdueCount / totalSgd) * 100) : 0;

  const channelDist = channelRows.rows.map(r => ({
    channel: r.channel, count: Number(r.count),
    pct: totalSgd > 0 ? Math.round((Number(r.count) / totalSgd) * 100) : 0,
  }));

  const officeRaw = officeRows.rows.map(r => {
    const count = Number(r.count);
    const avgHours = Number(r.avg_hours);
    const baseline = Number(r.baseline_hours);
    return {
      office_id: r.office_id, name: r.name, count,
      pct: totalSgd > 0 ? Math.round((count / totalSgd) * 100) : 0,
      revenue: Number(r.revenue), fraud_count: Number(r.fraud_count),
      fraud_rate: count > 0 ? Number(r.fraud_count) / count : 0,
      avg_hours: Math.round(avgHours * 10) / 10,
      _ratio: avgHours / (baseline || 36),
    };
  });
  const ratios = officeRaw.map(o => o._ratio);
  const minR = ratios.length ? Math.min(...ratios) : 0;
  const maxR = ratios.length ? Math.max(...ratios) : 0;
  const officeDistribution = officeRaw.map(o => {
    const { _ratio, ...rest } = o;
    const efficiency = maxR > minR ? Math.round(((maxR - _ratio) / (maxR - minR)) * 58 + 40) : 70;
    return { ...rest, efficiency };
  });

  const topTariffsByRevenue = tariffRows.rows.map(r => ({
    tariff_code: r.tariff_code, tariff_description: '', // APPROX, matches fetchDeclarations()
    revenue: Number(r.revenue), declarations: Number(r.declarations),
  }));

  const topInspectors = inspectorRows.rows.map(r => {
    const total = Number(r.total);
    const fraudDetected = Number(r.fraud_detected);
    return {
      id: r.id, name: r.name, bureau: r.bureau ?? '',
      fraud_detected: fraudDetected, total,
      detection_rate: total > 0 ? fraudDetected / total : 0,
    };
  });

  const currentMonthKey = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; })();
  const trendMap: Record<string, { count: number; total: number; evasion: number }> = {};
  declMonthRows.rows.forEach(r => {
    trendMap[r.month] = { count: Number(r.count), total: Number(r.total), evasion: 0 };
  });
  fraudMonthRows.rows.forEach(r => {
    if (trendMap[r.month]) trendMap[r.month].evasion += Number(r.evasion);
  });
  const fraudTrend = Object.keys(trendMap)
    .filter(m => m !== currentMonthKey)
    .sort()
    .map(m => {
      const [y, mo] = m.split('-');
      const tm = trendMap[m];
      return {
        month: m, label: `${FR_MONTHS[Number(mo) - 1]} ${y.slice(2)}`,
        count: tm.count, total: tm.total, evasion: tm.evasion,
        rate: tm.total > 0 ? Math.round((tm.count / tm.total) * 1000) / 10 : 0,
      };
    });

  const caseStatusDist = statusDistResult.rows
    .map(r => ({ status: OVERVIEW_STATUS_LABELS[r.status] ?? r.status, count: Number(r.count), loss: Number(r.loss) }))
    .sort((a, b) => b.count - a.count);

  const monthlyMap: Record<string, { expected: number; collected: number; lost_fraud: number }> = {};
  declMonthRows.rows.forEach(r => {
    monthlyMap[r.month] = { expected: Number(r.expected), collected: Number(r.collected), lost_fraud: 0 };
  });
  fraudMonthRows.rows.forEach(r => {
    if (monthlyMap[r.month]) monthlyMap[r.month].lost_fraud += Number(r.evasion);
  });
  const monthlyRevenue = Object.keys(monthlyMap).sort().map(m => {
    const [y, mo] = m.split('-');
    const v = monthlyMap[m];
    return { month: m, label: `${FR_MONTHS[Number(mo) - 1]} ${y.slice(2)}`, expected: v.expected, collected: v.collected, lost_fraud: v.lost_fraud };
  }).filter(m => m.collected > 0 || m.lost_fraud > 0);

  // high_risk_importers: DATE-factor scoring over ~8,000 aggregated rows (not 1.05M)
  let highRiskImporters = 0;
  for (const r of importerRows.rows) {
    const total = Number(r.total);
    const fraudFlagged = Number(r.fraud_flagged);
    const fraudRate = total > 0 ? fraudFlagged / total : 0;
    const riskSystemAvg = Number(r.risk_system_avg);
    const highRiskTariffCount = Number(r.high_risk_tariff_count);
    const highRiskOriginCount = Number(r.high_risk_origin_count);
    const avgTaxGapRate = Number(r.fraud_tax_gap_sum) / Math.max(Number(r.fraud_taxes_declared_sum), 1);
    const confirmed = Number(r.confirmed);

    let score = 0;
    if (confirmed >= 2) score += 35;
    if (fraudRate > 0.15) score += 25;
    if (riskSystemAvg > 55) score += 15;
    if (total > 0 && highRiskTariffCount / total > 0.20) score += 20;
    if (total > 0 && highRiskOriginCount / total > 0.40) score += 15;
    if (avgTaxGapRate > 0.25) score += 10;
    score = Math.min(99, score);

    if (score >= 70) highRiskImporters++;
  }

  return {
    total_sgd: totalSgd,
    total_revenue: Number(t.total_revenue),
    taxes_assessed: Number(t.taxes_assessed),
    fraud_confirmed: Number(f.fraud_confirmed),
    fraud_count: Number(f.fraud_count),
    fraud_rate: totalSgd > 0 ? Number(t.fraud_flagged_count) / totalSgd : 0,
    revenue_loss: netLoss,
    tax_evasion_total: taxEvasionTotal,
    penalties_raised: penaltiesRaised,
    amount_recovered: amountRecovered,
    net_loss: netLoss,
    recovery_rate: recoveryRate,
    cases_open: Number(f.cases_open),
    cases_justice: Number(f.cases_justice),
    cases_abandoned: Number(f.cases_abandoned),
    collusion_suspected: 0, // APPROX, always 'false' -- matches fetchFraudCases()
    high_risk_importers: highRiskImporters,
    avg_clearance_hours: Math.round(Number(t.avg_clearance_hours)),
    clearance_overdue_count: overdueCount,
    clearance_overdue_pct: overduePct,
    channel_distribution: channelDist,
    office_distribution: officeDistribution,
    top_inspectors: topInspectors,
    top_tariffs_by_revenue: topTariffsByRevenue,
    fraud_trend: fraudTrend,
    case_status_dist: caseStatusDist,
    monthly_revenue: monthlyRevenue,
  };
}
