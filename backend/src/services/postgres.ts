import { Pool } from 'pg';
import type { SGDRow, FraudRow } from '../types/index';

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
