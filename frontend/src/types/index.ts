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
  expected: number;
  collected: number;
  lost_fraud: number;
}

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
  declarant_id: string;
  country: string;
  office_id: string;
  tariff_code: string;
  quantity: number;
  weight: number;
  cif_value: number;
  taxes_declared: number;
  revenue_collected: number;
  clearance_hours: number;
  fraud_flag: number;
}

export interface FraudRow {
  case_id: string;
  sgd_id: string;
  importer_id: string;
  declarant_id: string;
  fraud_type: string;
  loss_amount: number;
  ai_probability: number;
  status: 'CONFIRMED' | 'UNDER_REVIEW' | 'SUSPECTED';
  office_id: string;
  tariff_code: string;
  date: string;
}

export interface OfficeStats {
  office_id: string;
  name: string;
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
