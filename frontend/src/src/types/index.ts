export interface Overview {
  total_sgd: number;
  total_revenue: number;
  fraud_confirmed: number;
  revenue_loss: number;
  high_risk_importers: number;
  avg_clearance_hours: number;
  office_distribution: { office_id: string; name: string; count: number; pct: number }[];
  monthly_revenue: MonthlyRevenue[];
}

export interface MonthlyRevenue {
  month: string;
  label: string;
  expected: number;   // = taxes_assessed for the month
  collected: number;  // = revenue_collected
  lost_fraud: number; // = tax_evasion_amount from fraud cases
}

export interface ImporterProfile {
  importer_id: string;
  name: string;
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
  unique_declarant_names: string[];
  office_names: string[];
  date_factors: DATEFactor[];
  recent_sgds?: SGDRow[];
  fraud_cases_detail?: FraudRow[];
}

export interface DATEFactor {
  label: string;
  weight: number;
  triggered: boolean;
}

export interface SGDRow {
  sgd_id: string;
  date: string;
  importer_id: string;
  importer_name?: string;
  declarant_id: string;
  declarant_name?: string;
  inspector_id: string;
  inspector_name?: string;
  office_id: string;
  office_name?: string;
  country: string;
  tariff_code: string;
  tariff_description?: string;
  quantity: number;
  weight_kg: number;
  cif_value: number;
  taxes_declared: number;
  taxes_assessed: number;
  revenue_collected: number;
  tax_gap: number;
  clearance_hours: number;
  processing_days: number;
  inspection_type: string;
  inspection_result: string;
  seizure_value: number;
  transit_country: string;
  payment_mode: string;
  regime_code: string;
  officer_override: string;
  channel: string;
  fraud_flag: number; // 0 | 1 (may arrive as string from Sheets)
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
  importer_name?: string;
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

export interface OfficeStats {
  office_id: string;
  name: string;
  total_sgds: number;
  total_revenue: number;
  total_assessed: number;
  baseline_hours: number;
  avg_clearance_hours: number;
  fraud_cases: number;
  fraud_rate: number;
  efficiency_score: number;
  pct_of_total: number;
}

export interface TariffRisk {
  tariff_code: string;
  total_declarations: number;
  fraud_cases: number;
  fraud_rate: number;
  avg_cif: number;
  risk_level: 'HIGH' | 'MEDIUM' | 'LOW';
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

export interface FraudResponse {
  cases: FraudRow[];
  total_cases: number;
  total_loss: number;
  by_type: Record<string, number>;
  tariff_risk: TariffRisk[];
}
