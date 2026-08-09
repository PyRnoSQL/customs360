// ── Raw Google Sheets row types (exact column names) ─────────────────────────

export interface SGDRow {
  sgd_id: string;
  date: string;
  importer_id: string;
  importer_name: string;
  importer_risk_profile: 'LOW' | 'MEDIUM' | 'HIGH';
  declarant_id: string;
  declarant_name: string;
  inspector_id: string;
  inspector_name: string;
  office_id: string;
  office_name: string;
  country: string;
  tariff_code: string;
  tariff_description: string;
  quantity: number;
  weight_kg: number;
  cif_value: number;
  taxes_declared: number;
  taxes_assessed: number;
  revenue_collected: number;
  tax_gap: number;
  clearance_hours: number;
  inspection_type: string;
  inspection_result: string;
  seizure_value: number;
  transit_country: string;
  payment_mode: string;
  regime_code: string;
  processing_days: number;
  officer_override: string;
  channel: string;
  fraud_flag: number; // 0 | 1
  fraud_type: string;
  risk_score_system: number;
}

export interface FraudRow {
  case_id: string;
  sgd_id: string;
  date_detection: string;
  date_ouverture_dossier: string;
  date_cloture: string;
  importer_id: string;
  importer_name: string;
  declarant_id: string;
  inspector_id: string;
  office_id: string;
  fraud_type: string;
  tariff_code: string;
  country_origin: string;
  declared_value: number;
  assessed_value: number;
  tax_evasion_amount: number;
  penalty_amount: number;
  total_amount_due: number;
  amount_recovered: number;
  recovery_rate: number;
  loss_net: number;
  status: 'EN_COURS' | 'CLOTURE_AMIABLE' | 'CLOTURE_CONTENTIEUX' | 'TRANSMIS_JUSTICE' | 'ABANDONNE';
  resolution_mode: string;
  ai_risk_score: number;
  was_system_flagged: string;
  collusion_suspected: string;
  repeat_offender: string;
  seizure_made: string;
  seizure_value: number;
  evidence_type: string;
  referral_to_justice: string;
  notes: string;
}

// ── Derived/aggregated types (computed at runtime) ────────────────────────────

export interface ImporterProfile {
  importer_id: string;
  total_declarations: number;
  total_cif_value: number;
  total_revenue: number;
  fraud_cases: number;
  fraud_rate: number;
  risk_score: number;
  offices: string[];
  countries: string[];
  tariff_codes: string[];
  unique_declarants: string[];
  date_factors: DATEFactor[];
  flow: 'IMPORT' | 'EXPORT' | 'MIXED';
}

export interface DATEFactor {
  label: string;
  weight: number;
  triggered: boolean;
}

export interface OfficeStats {
  office_id: string;
  total_sgds: number;
  total_revenue: number;
  avg_clearance_hours: number;
  fraud_cases: number;
  fraud_rate: number;
  efficiency_score: number;
  pct_of_total: number;
}

export interface TariffRisk {
  tariff_code: string;
  tariff_description: string;
  total_declarations: number;
  fraud_cases: number;
  fraud_rate: number;
  avg_cif: number;
  risk_level: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface MonthlyRevenue {
  month: string;
  label: string;
  expected: number;
  collected: number;
  lost_fraud: number;
}

export interface DelayRecord extends SGDRow {
  declared_hours: number;
  overshoot_hours: number;
  is_suspicious: boolean;
}

export interface AIAnalysis {
  analyse: string;
  causes: string[];
  actions: string[];
  niveau_risque: 'CRITIQUE' | 'ÉLEVÉ' | 'MOYEN' | 'FAIBLE';
  bureau_concerne: string;
  indicateur_cle: string;
}

export interface Overview {
  total_sgd: number;
  total_revenue: number;
  taxes_assessed: number;
  fraud_confirmed: number;
  fraud_count: number;
  fraud_rate: number;
  revenue_loss: number;
  tax_evasion_total: number;
  penalties_raised: number;
  amount_recovered: number;
  net_loss: number;
  recovery_rate: number;
  cases_open: number;
  cases_justice: number;
  cases_abandoned: number;
  collusion_suspected: number;
  high_risk_importers: number;
  avg_clearance_hours: number;
  clearance_overdue_count: number;
  clearance_overdue_pct: number;
  channel_distribution: { channel: string; count: number; pct: number }[];
  office_distribution: { office_id: string; name: string; count: number; pct: number; revenue: number; fraud_count: number; fraud_rate: number; avg_hours: number; efficiency: number }[];
  top_inspectors: { id: string; name: string; bureau: string; fraud_detected: number; total: number; detection_rate: number }[];
  top_tariffs_by_revenue: { tariff_code: string; tariff_description: string; revenue: number; declarations: number }[];
  fraud_trend: { month: string; label: string; count: number; total: number; rate: number; evasion: number }[];
  case_status_dist: { status: string; count: number; loss: number }[];
  monthly_revenue: MonthlyRevenue[];
}
