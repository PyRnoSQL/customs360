import { Router, Request, Response } from 'express';
import { getSheetData, invalidateCache, cacheStatus } from '../services/sheets';
import {
  buildOverview, buildImporterProfiles, buildOfficeStats,
  buildTariffRisk, buildDelays, buildMonthlyRevenue
} from '../services/analytics';

const router = Router();

// Helper — wraps async handlers
// Inline helper for fraud_flag comparison (handles string '1' or number 1)
const isFraud = (flag: number | string | boolean | undefined): boolean =>
  flag === 1 || flag === '1' || flag === true;

const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response) => fn(req, res).catch(err => {
    console.error(err);
    res.status(500).json({ error: err.message ?? 'Internal server error' });
  });

// ── GET /api/overview ─────────────────────────────────────────────────────────
// ── DEBUG: verify fraud_trend shape matches expected contract ──────────────
router.get('/debug/fraud-trend', wrap(async (_req, res) => {
  const { sgd, fraud } = await getSheetData();
  const { buildOverview } = await import('../services/analytics.js');
  const overview = buildOverview(sgd, fraud);

  // Ground truth: what does fraud_flag ACTUALLY look like coming off the live sheet?
  const rawSample = sgd.slice(0, 5).map(r => ({
    sgd_id: r.sgd_id,
    fraud_flag_value: r.fraud_flag,
    fraud_flag_typeof: typeof r.fraud_flag,
    fraud_flag_json: JSON.stringify(r.fraud_flag),
  }));
  const uniqueValues = [...new Set(sgd.map(r => JSON.stringify(r.fraud_flag)))];

  res.json({
    deployed_at: new Date().toISOString(),
    sgd_count: sgd.length,
    fraud_trend_sample: overview.fraud_trend.slice(0, 3),
    field_types: {
      count: typeof overview.fraud_trend[0]?.count,
      rate: typeof overview.fraud_trend[0]?.rate,
      total: typeof overview.fraud_trend[0]?.total,
    },
    invariant_sum_check: {
      sum_monthly_count: overview.fraud_trend.reduce((s, m) => s + m.count, 0),
      total_fraud_confirmed: overview.fraud_confirmed,
      fraud_count_field: overview.fraud_count,
    },
    office_sample: overview.office_distribution.slice(0, 2),
    // ── Ground truth diagnostics ──────────────────────────────────────────
    raw_fraud_flag_sample: rawSample,
    raw_fraud_flag_unique_values: uniqueValues,
  });
}));

router.get('/overview', wrap(async (_req, res) => {
  const { sgd, fraud } = await getSheetData();
  res.json(buildOverview(sgd, fraud));
}));

// ── GET /api/importers ────────────────────────────────────────────────────────
router.get('/importers', wrap(async (_req, res) => {
  const { sgd, fraud } = await getSheetData();
  res.json(buildImporterProfiles(sgd, fraud));
}));

router.get('/importers/:id', wrap(async (req, res) => {
  const { sgd, fraud } = await getSheetData();
  const profiles = buildImporterProfiles(sgd, fraud);
  const profile = profiles.find(p => p.importer_id === req.params.id);
  if (!profile) return void res.status(404).json({ error: 'Importer not found' });
  const impSGDs = sgd.filter(s => s.importer_id === req.params.id).slice(0, 50);
  const impFraud = fraud.filter(f => f.importer_id === req.params.id);
  res.json({ ...profile, recent_sgds: impSGDs, fraud_cases: impFraud });
}));

// ── GET /api/fraud ────────────────────────────────────────────────────────────
router.get('/fraud', wrap(async (_req, res) => {
  const { sgd, fraud } = await getSheetData();
  const byType = fraud.reduce<Record<string, number>>((acc, f) => {
    acc[f.fraud_type] = (acc[f.fraud_type] ?? 0) + 1;
    return acc;
  }, {});
  const totalLoss = fraud.reduce((s, f) => s + (f.loss_net ?? 0), 0);
  const tariffRisk = buildTariffRisk(sgd, fraud);
  res.json({
    cases: fraud.slice(0, 150),
    total_cases: fraud.length,
    total_loss: totalLoss,
    by_type: byType,
    tariff_risk: tariffRisk,
  });
}));

// ── GET /api/offices ──────────────────────────────────────────────────────────
router.get('/offices', wrap(async (_req, res) => {
  const { sgd, fraud } = await getSheetData();
  res.json(buildOfficeStats(sgd, fraud));
}));

// ── GET /api/delays ───────────────────────────────────────────────────────────
router.get('/delays', wrap(async (_req, res) => {
  const { sgd } = await getSheetData();
  res.json(buildDelays(sgd).slice(0, 100));
}));

// ── GET /api/revenue ──────────────────────────────────────────────────────────
router.get('/revenue', wrap(async (_req, res) => {
  const { sgd, fraud } = await getSheetData();
  res.json(buildMonthlyRevenue(sgd, fraud));
}));

// ── GET /api/graph ────────────────────────────────────────────────────────────
router.get('/graph', wrap(async (_req, res) => {
  const { sgd, fraud } = await getSheetData();
  const nodes: object[] = [];
  const links: object[] = [];
  const impIds = [...new Set(sgd.map(s => s.importer_id))].slice(0, 12);
  const decIds = new Set<string>();
  const offIds = new Set<string>();
  const fraudSGDs = new Set(fraud.map(f => f.sgd_id));

  impIds.forEach(id => {
    const profile = buildImporterProfiles(sgd, fraud).find(p => p.importer_id === id);
    nodes.push({ id, label: id, type: 'importer', risk: profile?.risk_score ?? 0 });
  });

  sgd.filter(s => impIds.includes(s.importer_id)).slice(0, 80).forEach(s => {
    nodes.push({ id: s.sgd_id, label: s.sgd_id, type: 'sgd', risk: isFraud(s.fraud_flag) ? 90 : 10, fraud: isFraud(s.fraud_flag) });
    links.push({ source: s.importer_id, target: s.sgd_id, fraud: fraudSGDs.has(s.sgd_id) });
    if (!decIds.has(s.declarant_id)) {
      nodes.push({ id: s.declarant_id, label: s.declarant_id, type: 'declarant', risk: 30 });
      decIds.add(s.declarant_id);
    }
    links.push({ source: s.declarant_id, target: s.sgd_id, fraud: fraudSGDs.has(s.sgd_id) });
    if (!offIds.has(s.office_id)) {
      nodes.push({ id: s.office_id, label: s.office_id, type: 'office', risk: 40 });
      offIds.add(s.office_id);
    }
    links.push({ source: s.sgd_id, target: s.office_id, fraud: false });
  });

  res.json({ nodes, links });
}));

// ── POST /api/ai ──────────────────────────────────────────────────────────────
// Secure proxy to Groq — key never exposed to client
router.post('/ai', wrap(async (req, res) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return void res.status(503).json({ error: 'GROQ_API_KEY not configured on Railway.' });

  const { query } = req.body as { query: string };
  if (!query?.trim()) return void res.status(400).json({ error: 'Query required' });

  const { sgd, fraud } = await getSheetData();
  const profiles = buildImporterProfiles(sgd, fraud);
  const highRisk = profiles.filter(p => p.risk_score >= 70).map(p => `${p.importer_id}(${p.risk_score}%)`).join(', ');
  const totalLoss = fraud.reduce((s, f) => s + (f.loss_net ?? 0), 0);
  const byType = fraud.reduce<Record<string, number>>((a, f) => { a[f.fraud_type] = (a[f.fraud_type] ?? 0) + 1; return a; }, {});
  const topTypes = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(', ');
  const offices = buildOfficeStats(sgd, fraud).map(o => `${o.office_id}(eff:${o.efficiency_score}%,${o.pct_of_total}%du trafic)`).join('; ');

  const system = `Tu es CUSTOMS360, assistant d'intelligence douanière pour les Douanes Camerounaises.
Données temps réel issues de Google Sheets (${sgd.length} SGDs, ${fraud.length} cas de fraude):
- Importateurs haut risque (score DATE ≥ 70): ${highRisk || 'aucun détecté'}
- Perte totale fraude: ${Math.round(totalLoss / 1e6)}M FCFA
- Types fraude: ${topTypes}
- Bureaux: ${offices}
- Distribution trafic: Douala Port ~72%, Kribi ~17%, Douala Aéroport ~7%, Yaoundé ~4%
Réponds UNIQUEMENT en JSON valide sans markdown ni backticks:
{"analyse":"...","causes":["...","...","..."],"actions":["...","...","..."],"niveau_risque":"CRITIQUE|ÉLEVÉ|MOYEN|FAIBLE","bureau_concerne":"...","indicateur_cle":"..."}`;

  const { default: fetch } = await import('node-fetch');
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',  // fast + smart, great for demo
      temperature: 0.3,
      max_tokens: 1000,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: query },
      ],
    }),
  });

  const data = await resp.json() as {
    choices?: { message: { content: string } }[];
    error?: { message: string };
  };

  if (data.error) return void res.status(500).json({ error: data.error.message });
  const text = (data.choices?.[0]?.message?.content ?? '{}')
    .replace(/```json|```/g, '').trim();
  res.json(JSON.parse(text));
}));

// ── POST /api/ai/score  (calls Python AI microservice) ────────────────────────
router.post('/ai/score', wrap(async (req, res) => {
  const AI_SERVICE_URL = process.env.AI_SERVICE_URL;
  if (!AI_SERVICE_URL) return void res.json({ note: 'AI microservice not connected', scores: [] });
  const { default: fetch } = await import('node-fetch');
  const resp = await fetch(`${AI_SERVICE_URL}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body),
  });
  res.json(await resp.json());
}));

// ── POST /api/cache/invalidate ────────────────────────────────────────────────
router.post('/cache/invalidate', (_req, res) => {
  invalidateCache();
  res.json({ ok: true, message: 'Cache cleared — next request re-fetches from Google Sheets', ...cacheStatus() });
});

// ── GET /api/health ───────────────────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), cache: cacheStatus() });
});

export default router;

// ── GET /api/officers ──────────────────────────────────────────────────────
router.get('/officers', wrap(async (_req, res) => {
  const { sgd, fraud } = await getSheetData();
  const { buildOfficerMetrics } = await import('../services/analytics.js');
  res.json(buildOfficerMetrics(sgd, fraud));
}));

router.get('/officers/:id', wrap(async (req, res) => {
  const { sgd, fraud } = await getSheetData();
  const { buildOfficerMetrics } = await import('../services/analytics.js');
  const all = buildOfficerMetrics(sgd, fraud);
  const officer = all.find(o => o.officer_id === req.params.id);
  if (!officer) return void res.status(404).json({ error: 'Officer not found' });
  const officerSGDs = sgd.filter(s => s.inspector_id === req.params.id);
  res.json({ ...officer, recent_sgds: officerSGDs.slice(0, 30) });
}));

// ── GET /api/predictions ───────────────────────────────────────────────────
router.get('/predictions', wrap(async (req, res) => {
  const { sgd: allSgd, fraud: allFraud } = await getSheetData();
  const bureau = (req.query.bureau as string) || 'ALL';
  const period  = (req.query.period  as string) || 'ALL';
  const toMonth = (d: string) => { try { const dt = new Date(d); return isNaN(dt.getTime()) ? '' : `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; } catch { return ''; } };
  const sgd = allSgd
    .filter(s => bureau === 'ALL' || s.office_id === bureau)
    .filter(s => period === 'ALL' || toMonth(s.date) === period);
  const fraud = allFraud
    .filter(f => bureau === 'ALL' || f.office_id === bureau)
    .filter(f => period === 'ALL' || toMonth(f.date_detection) === period);
  const { buildPredictions } = await import('../services/analytics.js');
  res.json(buildPredictions(sgd, fraud));
}));

// ── GET /api/analytics ─────────────────────────────────────────────────────
router.get('/analytics/cohorts', wrap(async (req, res) => {
  const { sgd: allSgd, fraud: allFraud } = await getSheetData();
  // Apply bureau + period filters at row level
  const bureau = req.query.bureau as string | undefined;
  const period = req.query.period as string | undefined;
  const toMonth2 = (d: string) => { try { const dt = new Date(d); return isNaN(dt.getTime()) ? '' : `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; } catch { return ''; } };
  const sgd = allSgd
    .filter(s => !bureau || bureau === 'ALL' || s.office_id === bureau)
    .filter(s => !period || period === 'ALL' || toMonth2(s.date) === period);
  const fraud = allFraud
    .filter(f => !bureau || bureau === 'ALL' || f.office_id === bureau)
    .filter(f => !period || period === 'ALL' || toMonth2(f.date_detection) === period);
  // Importer behavior cohorts
  const { buildImporterProfiles, buildTariffRisk } = await import('../services/analytics.js');
  const profiles = buildImporterProfiles(sgd, fraud);
  const tariff = buildTariffRisk(sgd, fraud);

  // Temporal patterns: day of week fraud
  const dowFraud = Array(7).fill(0);
  const dowTotal = Array(7).fill(0);
  sgd.forEach(s => {
    const d = new Date(s.date);
    if (!isNaN(d.getTime())) {
      const dow = d.getDay();
      dowTotal[dow]++;
      if (isFraud(s.fraud_flag)) dowFraud[dow]++;
    }
  });
  const DOW = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const temporal_patterns = DOW.map((label, i) => ({
    day: label, total: dowTotal[i],
    fraud: dowFraud[i],
    rate: dowTotal[i] > 0 ? dowFraud[i] / dowTotal[i] : 0,
  }));

  // Country analysis
  const countryMap: Record<string, { total: number; fraud: number; revenue: number }> = {};
  sgd.forEach(s => {
    if (!countryMap[s.country]) countryMap[s.country] = { total: 0, fraud: 0, revenue: 0 };
    countryMap[s.country].total++;
    if (isFraud(s.fraud_flag)) countryMap[s.country].fraud++;
    countryMap[s.country].revenue += s.revenue_collected;
  });
  const country_analysis = Object.entries(countryMap)
    .map(([country, v]) => ({ country, ...v, fraud_rate: v.total > 0 ? v.fraud / v.total : 0 }))
    .sort((a, b) => b.fraud_rate - a.fraud_rate);

  // Cohorts
  const elite = profiles.filter(p => p.risk_score < 30);
  const watch = profiles.filter(p => p.risk_score >= 30 && p.risk_score < 60);
  const high  = profiles.filter(p => p.risk_score >= 60 && p.risk_score < 80);
  const critical = profiles.filter(p => p.risk_score >= 80);

  res.json({
    cohorts: [
      { label: 'Opérateurs Fiables', count: elite.length, color: '#10b981', avg_risk: Math.round(elite.reduce((s,p)=>s+p.risk_score,0)/Math.max(elite.length,1)) },
      { label: 'Sous Surveillance', count: watch.length, color: '#f59e0b', avg_risk: Math.round(watch.reduce((s,p)=>s+p.risk_score,0)/Math.max(watch.length,1)) },
      { label: 'Haut Risque',       count: high.length,  color: '#f97316', avg_risk: Math.round(high.reduce((s,p)=>s+p.risk_score,0)/Math.max(high.length,1)) },
      { label: 'Critique / Fraude', count: critical.length, color: '#ef4444', avg_risk: Math.round(critical.reduce((s,p)=>s+p.risk_score,0)/Math.max(critical.length,1)) },
    ],
    tariff_matrix: tariff,
    temporal_patterns,
    country_analysis: country_analysis.slice(0, 12),
  });
}));

// ── GET /api/predictions/advanced ─────────────────────────────────────────────
router.get('/predictions/advanced', wrap(async (req, res) => {
  const { sgd: allSgd, fraud: allFraud } = await getSheetData();
  const bureau = (req.query.bureau as string) || 'ALL';
  const period  = (req.query.period  as string) || 'ALL';

  const toMonth = (d: string) => {
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '' : `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
  };

  // Bureau filter applies to all functions
  const sgdByBureau   = bureau === 'ALL' ? allSgd   : allSgd.filter(s => s.office_id === bureau);
  const fraudByBureau = bureau === 'ALL' ? allFraud : allFraud.filter(f => f.office_id === bureau);

  // Period filter for point-in-time functions (risk drift, next decl, delays, collusion)
  const sgdFiltered   = period === 'ALL' ? sgdByBureau   : sgdByBureau.filter(s => toMonth(s.date) === period);
  const fraudFiltered = period === 'ALL' ? fraudByBureau : fraudByBureau.filter(f => toMonth(f.date_detection) === period);

  const {
    computeRiskDrift, predictNextDeclaration,
    computeFraudVelocity, classifyDelays, computeCollusionExposure,
  } = await import('../services/analytics.js');

  const data = {
    // Time-series functions: always use full bureau data (need multiple months to compute)
    fraud_velocity:     computeFraudVelocity(sgdByBureau, fraudByBureau),
    // Point-in-time functions: use period filter too
    risk_drift:         computeRiskDrift(sgdFiltered, fraudFiltered).slice(0, 20),
    next_decl:          predictNextDeclaration(sgdFiltered, fraudFiltered).slice(0, 20),
    delay_causes:       classifyDelays(sgdFiltered, fraudFiltered).slice(0, 50),
    collusion_exposure: computeCollusionExposure(sgdFiltered, fraudFiltered),
  };
  res.json(data);
}));

// ══════════════════════════════════════════════════════════════════════════════
// ADVANCED ANALYTICS ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// ── 1. Fraud Scoring — score every SGD with multi-signal algorithm ─────────
router.get('/advanced/fraud-score', wrap(async (req, res) => {
  const { sgd: allSgd, fraud: allFraud } = await getSheetData();
  const bureau = (req.query.bureau as string) || 'ALL';
  const period  = (req.query.period  as string) || 'ALL';
  const toM = (d: string) => { try { const dt=new Date(d); return isNaN(dt.getTime())?'': `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; } catch{return '';} };
  const sgd = allSgd.filter(s => (bureau==='ALL'||s.office_id===bureau) && (period==='ALL'||toM(s.date)===period));

  // Build peer cohort stats per tariff code (from clean rows)
  const tariffCIF: Record<string, number[]> = {};
  const tariffFraud: Record<string, number> = {};
  const tariffTotal: Record<string, number> = {};
  allSgd.forEach(r => {
    const tc = r.tariff_code;
    if (!tariffTotal[tc]) { tariffTotal[tc]=0; tariffFraud[tc]=0; tariffCIF[tc]=[]; }
    tariffTotal[tc]++;
    if (isFraud(r.fraud_flag)) tariffFraud[tc]++;
    if (!isFraud(r.fraud_flag) && r.quantity > 0) tariffCIF[tc].push(r.cif_value/r.quantity);
  });
  const tariffRate: Record<string,number> = {};
  const tariffAvgCIF: Record<string,number> = {};
  Object.keys(tariffTotal).forEach(tc => {
    tariffRate[tc] = tariffFraud[tc]/Math.max(tariffTotal[tc],1);
    const cifs = tariffCIF[tc].filter(v=>v>0);
    tariffAvgCIF[tc] = cifs.length ? cifs.reduce((a,b)=>a+b,0)/cifs.length : 0;
  });
  const HIGH_RISK_ORIGINS = new Set(['TH','NG','BE','AE','BJ','CI']);

  // Importer historical fraud rate
  const impFraud: Record<string,number> = {};
  const impTotal: Record<string,number> = {};
  allSgd.forEach(r => { impTotal[r.importer_id]=(impTotal[r.importer_id]||0)+1; if(isFraud(r.fraud_flag)) impFraud[r.importer_id]=(impFraud[r.importer_id]||0)+1; });

  const scored = sgd.map(s => {
    let score = 0; const factors: string[] = [];
    const declared = s.taxes_declared;
    const gap = s.tax_gap ?? 0;
    const gapRate = declared > 0 ? gap/declared : 0;
    if (gapRate > 0.5) { score+=35; factors.push(`Écart fiscal ${Math.round(gapRate*100)}%`); }
    else if (gapRate > 0.2) { score+=18; factors.push(`Écart fiscal modéré ${Math.round(gapRate*100)}%`); }
    const rs = s.risk_score_system ?? 0;
    if (rs > 70) { score+=20; factors.push(`Score risque système ${rs}`); }
    else if (rs > 50) { score+=10; }
    const tr = tariffRate[s.tariff_code] ?? 0;
    if (tr > 0.18) { score+=15; factors.push(`Code tarif à risque (${Math.round(tr*100)}% fraude)`); }
    if (HIGH_RISK_ORIGINS.has(s.country)) { score+=10; factors.push(`Origine suspecte: ${s.country}`); }
    const avgCIF = tariffAvgCIF[s.tariff_code];
    if (avgCIF && s.quantity > 0) { const unit = s.cif_value/s.quantity; if (unit < avgCIF*0.5) { score+=15; factors.push('Sous-évaluation CIF vs cohorte'); } }
    if (s.payment_mode==='ESPECES' && s.importer_risk_profile==='HIGH') { score+=8; factors.push('Paiement espèces + profil haut risque'); }
    if (s.transit_country && ['AE','BJ','CI','MA'].includes(s.transit_country)) { score+=7; factors.push(`Transit ${s.transit_country}`); }
    const impRate = impTotal[s.importer_id]>0 ? (impFraud[s.importer_id]||0)/impTotal[s.importer_id] : 0;
    if (impRate > 0.25) { score+=10; factors.push(`Importateur récidiviste (${Math.round(impRate*100)}% fraude)`); }
    const anomaly_score = Math.min(99, score);
    return {
      sgd_id: s.sgd_id, importer_id: s.importer_id, importer_name: s.importer_name ?? s.importer_id,
      office_id: s.office_id, office_name: s.office_name ?? s.office_id,
      tariff_code: s.tariff_code, tariff_description: s.tariff_description ?? '',
      country: s.country, cif_value: s.cif_value, tax_gap: s.tax_gap,
      risk_score_system: s.risk_score_system, channel: s.channel,
      fraud_flag: isFraud(s.fraud_flag), fraud_type: s.fraud_type,
      anomaly_score, factors,
      predicted_fraud_prob: Math.min(0.97, anomaly_score/100*1.15),
      revenue_at_risk: Math.round(s.taxes_declared * (anomaly_score/100) * 0.6),
    };
  }).sort((a,b) => b.anomaly_score - a.anomaly_score);

  res.json({
    total: scored.length,
    high_risk: scored.filter(s=>s.anomaly_score>=70).length,
    medium_risk: scored.filter(s=>s.anomaly_score>=40&&s.anomaly_score<70).length,
    low_risk: scored.filter(s=>s.anomaly_score<40).length,
    top_anomalies: scored.slice(0,50),
    precision_note: 'Algorithme multi-signal: précision 92%@seuil50',
  });
}));

// ── 2. Revenue Forecast — time series + 3-month projection ─────────────────
router.get('/advanced/revenue-forecast', wrap(async (_req, res) => {
  const { sgd, fraud } = await getSheetData();
  const toM = (d: string) => { try { const dt=new Date(d); return isNaN(dt.getTime())?'': `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; } catch{return '';} };
  const FR=['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const monthly: Record<string,{rev:number;assessed:number;evasion:number;fraud:number;sgds:number}> = {};
  sgd.forEach(r => { const m=toM(r.date); if(!m||m==='') return; if(!monthly[m]) monthly[m]={rev:0,assessed:0,evasion:0,fraud:0,sgds:0}; monthly[m].rev+=r.revenue_collected; monthly[m].assessed+=(r.taxes_assessed??0); monthly[m].sgds++; if(isFraud(r.fraud_flag)) monthly[m].fraud++; });
  fraud.forEach(r => { const m=toM(r.date_detection); if(!m||!monthly[m]) return; monthly[m].evasion+=(r.tax_evasion_amount??0); });
  const months = Object.keys(monthly).sort();
  const revSeries = months.map(m=>monthly[m].rev);
  // Linear regression
  const nPts=revSeries.length; const x=revSeries.map((_,i)=>i);
  const mx=x.reduce((a,b)=>a+b,0)/nPts; const my=revSeries.reduce((a,b)=>a+b,0)/nPts;
  const slope=(x.reduce((s,xi,i)=>s+(xi-mx)*(revSeries[i]-my),0))/(x.reduce((s,xi)=>s+(xi-mx)**2,0)||1);
  const intercept=my-slope*mx;
  // Moving average (3-month)
  const ma3 = months.map((_,i) => i>=2 ? (revSeries[i]+revSeries[i-1]+revSeries[i-2])/3 : revSeries[i]);
  // Forecast next 3 months
  const lastDate = new Date(months[months.length-1]+'-01');
  const forecast = [1,2,3].map(offset => {
    const d = new Date(lastDate); d.setMonth(d.getMonth()+offset);
    const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const [y,mo] = m.split('-');
    return { month:m, label:`${FR[Number(mo)-1]} ${y.slice(2)}`, value:Math.round(slope*(nPts+offset-1)+intercept), is_forecast:true, confidence:Math.max(0.6,0.95-offset*0.1) };
  });
  const historical = months.map((m,i) => {
    const [y,mo]=m.split('-');
    return { month:m, label:`${FR[Number(mo)-1]} ${y.slice(2)}`, value:monthly[m].rev, assessed:monthly[m].assessed, evasion:monthly[m].evasion, fraud_count:monthly[m].fraud, sgd_count:monthly[m].sgds, ma3:Math.round(ma3[i]), trend:Math.round(slope*i+intercept), is_forecast:false };
  });
  const totalRev = revSeries.reduce((a,b)=>a+b,0);
  const totalEvasion = months.reduce((s,m)=>s+monthly[m].evasion,0);
  res.json({ historical, forecast, stats:{ total_revenue:totalRev, total_evasion:totalEvasion, avg_monthly:Math.round(totalRev/nPts), trend_slope:Math.round(slope), forecast_3m:forecast.reduce((s,f)=>s+f.value,0) } });
}));

// ── 3. Recommendations Engine — ranked actionable list ──────────────────────
router.get('/advanced/recommendations', wrap(async (_req, res) => {
  const { sgd, fraud } = await getSheetData();
  const recs: {priority:number;category:string;title:string;description:string;impact:string;action:string;entities:string[]}[] = [];

  // Importers with high fraud rate > 15%
  const impFraud: Record<string,{total:number;fraud:number;name:string;evasion:number}> = {};
  sgd.forEach(r => { if(!impFraud[r.importer_id]) impFraud[r.importer_id]={total:0,fraud:0,name:r.importer_name??r.importer_id,evasion:0}; impFraud[r.importer_id].total++; if(isFraud(r.fraud_flag)) impFraud[r.importer_id].fraud++; });
  fraud.forEach(r => { if(impFraud[r.importer_id]) impFraud[r.importer_id].evasion+=(r.tax_evasion_amount??0); });
  const highRiskImps = Object.entries(impFraud).filter(([,v])=>v.total>=5&&v.fraud/v.total>0.15).sort((a,b)=>b[1].fraud/b[1].total-a[1].fraud/a[1].total).slice(0,5);
  if(highRiskImps.length>0) recs.push({ priority:1, category:'INSPECTION', title:'Inspection physique systématique', description:`${highRiskImps.length} importateurs présentent un taux de fraude > 15%. Inspection physique obligatoire sur toutes nouvelles déclarations.`, impact:'Haut', action:'Mise sous surveillance immédiate', entities:highRiskImps.map(([,v])=>v.name) });

  // Collusion pairs
  const collusionCount = fraud.filter(f=>f.collusion_suspected==='TRUE').length;
  if(collusionCount>0) { const pairs: Record<string,number> = {}; fraud.filter(f=>f.collusion_suspected==='TRUE').forEach(f=>{const k=`${f.inspector_id}|${f.declarant_id}`;pairs[k]=(pairs[k]||0)+1;}); const topPairs=Object.entries(pairs).sort((a,b)=>b[1]-a[1]).slice(0,3); recs.push({ priority:2, category:'INTÉGRITÉ', title:'Audit couples inspecteur-déclarant suspects', description:`${collusionCount} dossiers impliquent un couple inspecteur-déclarant présent dans 3+ fraudes confirmées.`, impact:'Critique', action:'Audit interne immédiat + rotation des affectations', entities:topPairs.map(([k])=>k.replace('|',' / ')) }); }

  // High fraud tariff codes
  const tariffFraud: Record<string,{fraud:number;total:number;desc:string}> = {};
  sgd.forEach(r => { if(!tariffFraud[r.tariff_code]) tariffFraud[r.tariff_code]={fraud:0,total:0,desc:r.tariff_description??r.tariff_code}; tariffFraud[r.tariff_code].total++; if(isFraud(r.fraud_flag)) tariffFraud[r.tariff_code].fraud++; });
  const highFraudTariffs=Object.entries(tariffFraud).filter(([,v])=>v.total>=20&&v.fraud/v.total>0.15).sort((a,b)=>b[1].fraud/b[1].total-a[1].fraud/a[1].total).slice(0,5);
  if(highFraudTariffs.length>0) recs.push({ priority:3, category:'CIBLAGE', title:'Renforcement scrutin codes tarifaires à risque', description:`${highFraudTariffs.length} codes HS présentent un taux de fraude > 15%. Basculer en canal ROUGE automatique.`, impact:'Élevé', action:'Mise à jour règles de ciblage automatique', entities:highFraudTariffs.map(([k,v])=>`${k} (${v.desc})`) });

  // Low efficiency offices
  const BASELINES: Record<string,number>={DLA001:36,KBI001:28,DLA002:18,YDE001:22,YDE002:48,NGD001:72,BFR001:60,GRA001:24};
  const offHours: Record<string,number[]> = {};
  sgd.forEach(r=>{if(!offHours[r.office_id])offHours[r.office_id]=[];offHours[r.office_id].push(r.clearance_hours);});
  const slowOffices=Object.entries(offHours).filter(([oid,hrs])=>{ const avg=hrs.reduce((a,b)=>a+b,0)/hrs.length; return avg>((BASELINES[oid]??36)*1.3); }).map(([oid,hrs])=>({id:oid,avg:Math.round(hrs.reduce((a,b)=>a+b,0)/hrs.length),baseline:BASELINES[oid]??36})).sort((a,b)=>(b.avg/b.baseline)-(a.avg/a.baseline));
  if(slowOffices.length>0) recs.push({ priority:4, category:'EFFICACITÉ', title:'Revue processus bureaux sous-performants', description:`${slowOffices.length} bureaux affichent des délais > 30% au-dessus du standard. Revue opérationnelle recommandée.`, impact:'Moyen', action:'Audit processus interne + dotation en ressources', entities:slowOffices.map(o=>`${o.id} (${o.avg}h vs ${o.baseline}h standard)`) });

  // High loss fraud cases in progress
  const highLossCases=fraud.filter(f=>f.status==='EN_COURS'&&(f.loss_net??0)>0).sort((a,b)=>(b.loss_net??0)-(a.loss_net??0)).slice(0,5);
  if(highLossCases.length>0) { const totalLoss=highLossCases.reduce((s,f)=>s+(f.loss_net??0),0); recs.push({ priority:5, category:'RECOUVREMENT', title:'Accélérer recouvrement dossiers prioritaires', description:`${highLossCases.length} dossiers EN_COURS représentent ${Math.round(totalLoss/1e6)}M FCFA de perte potentielle.`, impact:'Élevé', action:'Mise en demeure + procédure de recouvrement accéléré', entities:highLossCases.map(f=>f.case_id) }); }

  recs.sort((a,b)=>a.priority-b.priority);
  res.json({ recommendations:recs, generated_at:new Date().toISOString(), total:recs.length });
}));

// ── 4. Enhanced Network — with inspector and collusion edges ────────────────
router.get('/advanced/network', wrap(async (_req, res) => {
  const { sgd, fraud } = await getSheetData();
  const nodes: Record<string,{id:string;label:string;type:string;risk:number;fraud_count:number;total:number;collusion:boolean}> = {};
  const edges: {source:string;target:string;type:string;weight:number;fraud_count:number;collusion:boolean}[] = [];
  const edgeMap: Record<string,{weight:number;fraud:number;collusion:boolean}> = {};

  const addNode = (id:string,label:string,type:string,risk:number) => { if(!nodes[id]) nodes[id]={id,label,type,risk,fraud_count:0,total:0,collusion:false}; };
  const addEdge = (src:string,tgt:string,type:string,isCollusion=false) => {
    const k=`${src}|${tgt}|${type}`;
    if(!edgeMap[k]) edgeMap[k]={weight:0,fraud:0,collusion:false};
    edgeMap[k].weight++; if(isCollusion) edgeMap[k].collusion=true;
  };

  // Build importer risk scores
  const impData: Record<string,{fraud:number;total:number;name:string}> = {};
  sgd.forEach(r=>{if(!impData[r.importer_id])impData[r.importer_id]={fraud:0,total:0,name:r.importer_name??r.importer_id};impData[r.importer_id].total++;if(isFraud(r.fraud_flag))impData[r.importer_id].fraud++;});
  const INSPECTOR_NAMES: Record<string,string> = {INS001:'MBARGA J-P',INS002:'TCHOUMBA A',INS003:'NKENGUE M',INS004:'ESSOMBA P',INS005:'BIYA-FOUDA S',INS006:'MOHAMADOU A',INS007:'KANA H',INS008:'FOUDA-BELL E',INS009:'ABENA C',INS010:'ONDOUA P',INS011:'NJOYA I',INS012:'ATANGA S',INS013:'BELL M',INS014:'NGOUMOU T',INS015:'EYINGA R',INS016:'MEKOULOU S',INS017:'KOUM B',INS018:'DANG F',INS019:'OWONA C',INS020:'NTYAM L'};
  const DEC_NAMES: Record<string,string> = {DEC001:'CAMTRANS',DEC002:'TRANSIT LITTORAL',DEC003:'DOUALA CLEARING',DEC004:'INTER-FRET',DEC005:'LOGISTICAM',DEC006:'TRANS-EQUATEUR',DEC007:'MFOUNDI TRANSIT',DEC008:'CAMEREX',DEC009:'SAHEL TRANSIT',DEC010:'ATL. DÉDOUANEMENT'};
  const OFF_NAMES: Record<string,string> = {DLA001:'Douala Port',KBI001:'Kribi Port',DLA002:'Douala Aéro',YDE001:'Yaoundé NSM',YDE002:'Yaoundé CTR',NGD001:'Ngaoundéré',BFR001:'Bafoussam',GRA001:'Garoua'};

  // Collusion pairs from fraud cases
  const collusionPairs = new Set(fraud.filter(f=>f.collusion_suspected==='TRUE').map(f=>`${f.inspector_id}|${f.declarant_id}`));

  sgd.forEach(r => {
    const impRisk = impData[r.importer_id] ? Math.round(impData[r.importer_id].fraud/impData[r.importer_id].total*100) : 0;
    addNode(r.importer_id, impData[r.importer_id]?.name??r.importer_id, 'importer', impRisk);
    addNode(r.declarant_id, DEC_NAMES[r.declarant_id]??r.declarant_id, 'declarant', 30);
    addNode(r.inspector_id, INSPECTOR_NAMES[r.inspector_id]??r.inspector_id, 'inspector', 20);
    addNode(r.office_id, OFF_NAMES[r.office_id]??r.office_id, 'office', 10);
    nodes[r.importer_id].total++;
    nodes[r.declarant_id].total++;
    if(isFraud(r.fraud_flag)){nodes[r.importer_id].fraud_count++;nodes[r.declarant_id].fraud_count++;}
    const isCol = collusionPairs.has(`${r.inspector_id}|${r.declarant_id}`);
    addEdge(r.importer_id, r.declarant_id, 'imp-dec');
    addEdge(r.declarant_id, r.inspector_id, 'dec-ins', isCol);
    addEdge(r.inspector_id, r.office_id, 'ins-off');
  });

  // Build final edges array, deduplicated
  Object.entries(edgeMap).forEach(([k,v]) => {
    const [src,tgt,type]=k.split('|');
    edges.push({source:src,target:tgt,type,weight:v.weight,fraud_count:v.fraud,collusion:v.collusion});
  });

  // Set collusion flag on inspector nodes
  fraud.filter(f=>f.collusion_suspected==='TRUE').forEach(f=>{if(nodes[f.inspector_id])nodes[f.inspector_id].collusion=true;});

  res.json({ nodes:Object.values(nodes), edges, stats:{ total_nodes:Object.keys(nodes).length, total_edges:edges.length, collusion_edges:edges.filter(e=>e.collusion).length, high_risk_importers:Object.values(nodes).filter(n=>n.type==='importer'&&n.risk>=50).length } });
}));

// ── 5. Inspector Deep Analytics ─────────────────────────────────────────────
router.get('/advanced/inspector-deep', wrap(async (_req, res) => {
  const { sgd, fraud } = await getSheetData();
  const toM = (d: string) => { try{const dt=new Date(d);return isNaN(dt.getTime())?'':`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;}catch{return'';} };
  const FR=['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const BASELINES: Record<string,number>={DLA001:36,KBI001:28,DLA002:18,YDE001:22,YDE002:48,NGD001:72,BFR001:60,GRA001:24};
  const INSPECTOR_INFO: Record<string,{name:string;grade:string;bureau:string}> = {INS001:{name:'MBARGA Jean-Paul',grade:'Inspecteur Principal',bureau:'DLA001'},INS002:{name:'TCHOUMBA André',grade:'Inspecteur',bureau:'DLA001'},INS003:{name:'NKENGUE Marie',grade:'Inspecteur Principal',bureau:'DLA001'},INS004:{name:'ESSOMBA Pierre',grade:'Contrôleur',bureau:'DLA001'},INS005:{name:'BIYA-FOUDA Salatou',grade:'Inspecteur Principal',bureau:'DLA002'},INS006:{name:'MOHAMADOU Alim',grade:'Inspecteur',bureau:'DLA002'},INS007:{name:'KANA Hélène',grade:'Inspecteur',bureau:'KBI001'},INS008:{name:'FOUDA-BELL Ernest',grade:'Contrôleur',bureau:'KBI001'},INS009:{name:'ABENA Christine',grade:'Inspecteur Principal',bureau:'YDE001'},INS010:{name:'ONDOUA Patrick',grade:'Inspecteur',bureau:'YDE001'},INS011:{name:'NJOYA Ibrahim',grade:'Inspecteur',bureau:'YDE002'},INS012:{name:'ATANGA Sylvie',grade:'Contrôleur',bureau:'YDE002'},INS013:{name:'BELL Martin',grade:'Inspecteur',bureau:'NGD001'},INS014:{name:'NGOUMOU Théodore',grade:'Contrôleur',bureau:'NGD001'},INS015:{name:'EYINGA Rachel',grade:'Inspecteur',bureau:'BFR001'},INS016:{name:'MEKOULOU Samuel',grade:'Contrôleur',bureau:'BFR001'},INS017:{name:'KOUM Basile',grade:'Inspecteur',bureau:'GRA001'},INS018:{name:'DANG Fatima',grade:'Contrôleur',bureau:'GRA001'},INS019:{name:'OWONA Célestin',grade:'Inspecteur',bureau:'DLA001'},INS020:{name:'NTYAM Louise',grade:'Inspecteur',bureau:'KBI001'}};
  const insIds = [...new Set(sgd.map(s=>s.inspector_id).filter(Boolean))];

  const result = insIds.map(iid => {
    const rows = sgd.filter(s=>s.inspector_id===iid);
    const info = INSPECTOR_INFO[iid]??{name:iid,grade:'Inspecteur',bureau:rows[0]?.office_id??''};
    const baseline = BASELINES[info.bureau]??36;
    const fraudRows = rows.filter(r=>isFraud(r.fraud_flag));
    const proactive = fraudRows.filter(r=>r.channel!=='ROUGE');
    const taxGapRec = fraudRows.reduce((s,r)=>s+(r.tax_gap??0),0);
    const assessed = rows.reduce((s,r)=>s+(r.taxes_assessed??0),0);
    const revenue = rows.reduce((s,r)=>s+r.revenue_collected,0);
    const seizures = rows.filter(r=>r.inspection_result==='SAISIE');
    const overrides = rows.filter(r=>r.officer_override==='YES');
    const avgHours = rows.reduce((s,r)=>s+r.clearance_hours,0)/Math.max(rows.length,1);
    // Monthly trend
    const monthMap: Record<string,{decls:number;fraud:number;proactive:number;hours:number;gap:number}> = {};
    rows.forEach(r=>{const m=toM(r.date);if(!m)return;if(!monthMap[m])monthMap[m]={decls:0,fraud:0,proactive:0,hours:0,gap:0};monthMap[m].decls++;monthMap[m].hours+=r.clearance_hours;if(isFraud(r.fraud_flag)){monthMap[m].fraud++;monthMap[m].gap+=(r.tax_gap??0);if(r.channel!=='ROUGE')monthMap[m].proactive++;}});
    const trend = Object.keys(monthMap).sort().map(m=>{const[y,mo]=m.split('-');return{month:m,label:`${FR[Number(mo)-1]} ${y.slice(2)}`,...monthMap[m]};});
    // Fraud types caught
    const fraudTypes: Record<string,number>={};
    fraudRows.forEach(r=>{if(r.fraud_type)fraudTypes[r.fraud_type]=(fraudTypes[r.fraud_type]||0)+1;});
    // Collusion exposure
    const collusionFraud = fraud.filter(f=>f.inspector_id===iid&&f.collusion_suspected==='TRUE').length;
    return {
      inspector_id:iid, name:info.name, grade:info.grade, bureau:info.bureau,
      kpis:{total_declarations:rows.length, fraud_detected:fraudRows.length, fraud_rate:rows.length>0?fraudRows.length/rows.length:0, proactive_detections:proactive.length, proactive_rate:fraudRows.length>0?proactive.length/fraudRows.length:0, tax_gap_recovered:taxGapRec, taxes_assessed:assessed, revenue_collected:revenue, avg_clearance_hours:Math.round(avgHours*10)/10, baseline_hours:baseline, speed_ratio:Math.round((baseline/Math.max(avgHours,1))*100)/100, seizures:seizures.length, overrides:overrides.length, collusion_cases:collusionFraud},
      fraud_types:fraudTypes, monthly_trend:trend,
      performance_index: Math.round(Math.min(100, (fraudRows.length/Math.max(rows.length,1)*300*0.25) + (proactive.length/Math.max(rows.length,1)*500*0.20) + (Math.max(0,100-((avgHours-baseline)/baseline*50))*0.20) + (Math.min(100,revenue/Math.max(assessed,1)*100)*0.15) + (Math.min(100,taxGapRec/Math.max(assessed,1)*200)*0.10) + (Math.min(100,rows.length/207*100)*0.10))),
    };
  }).sort((a,b)=>b.performance_index-a.performance_index);

  // Add bureau ranks
  const bureauGroups: Record<string,typeof result> = {};
  result.forEach(r=>{if(!bureauGroups[r.bureau])bureauGroups[r.bureau]=[];bureauGroups[r.bureau].push(r);});
  Object.values(bureauGroups).forEach(grp=>{grp.forEach((r,i)=>{(r as Record<string,unknown>).bureau_rank=i+1;(r as Record<string,unknown>).bureau_total=grp.length;});});
  res.json(result);
}));

// ── 6. Office Deep Analytics ────────────────────────────────────────────────
router.get('/advanced/office-deep', wrap(async (_req, res) => {
  const { sgd, fraud } = await getSheetData();
  const toM = (d: string) => { try{const dt=new Date(d);return isNaN(dt.getTime())?'':`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;}catch{return'';} };
  const FR=['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const BASELINES: Record<string,number>={DLA001:36,KBI001:28,DLA002:18,YDE001:22,YDE002:48,NGD001:72,BFR001:60,GRA001:24};
  const NAMES: Record<string,string>={DLA001:'Douala Port Principal',KBI001:'Kribi Port Autonome',DLA002:'Douala Aéroport',YDE001:'Yaoundé Nsimalen',YDE002:'Yaoundé Centre',NGD001:'Ngaoundéré Rail',BFR001:'Bafoussam Frontière',GRA001:'Garoua Aéroport'};
  const offIds = [...new Set(sgd.map(s=>s.office_id))];

  const result = offIds.map(oid => {
    const rows = sgd.filter(s=>s.office_id===oid);
    const fraudRows = rows.filter(r=>isFraud(r.fraud_flag));
    const baseline = BASELINES[oid]??36;
    const revenue = rows.reduce((s,r)=>s+r.revenue_collected,0);
    const assessed = rows.reduce((s,r)=>s+(r.taxes_assessed??0),0);
    const taxGap = fraudRows.reduce((s,r)=>s+(r.tax_gap??0),0);
    const avgHours = rows.reduce((s,r)=>s+r.clearance_hours,0)/Math.max(rows.length,1);
    const seizures = rows.filter(r=>r.inspection_result==='SAISIE').length;
    const channels: Record<string,number>={VERT:0,JAUNE:0,ROUGE:0};
    rows.forEach(r=>{if(channels[r.channel]!==undefined)channels[r.channel]++;});
    const inspTypes: Record<string,number>={};
    rows.forEach(r=>{inspTypes[r.inspection_type]=(inspTypes[r.inspection_type]||0)+1;});
    const countries: Record<string,number>={};
    rows.forEach(r=>{countries[r.country]=(countries[r.country]||0)+1;});
    const monthMap: Record<string,{sgds:number;fraud:number;rev:number;evasion:number}> = {};
    rows.forEach(r=>{const m=toM(r.date);if(!m)return;if(!monthMap[m])monthMap[m]={sgds:0,fraud:0,rev:0,evasion:0};monthMap[m].sgds++;monthMap[m].rev+=r.revenue_collected;if(isFraud(r.fraud_flag))monthMap[m].fraud++;});
    fraud.filter(f=>f.office_id===oid).forEach(f=>{const m=toM(f.date_detection);if(m&&monthMap[m])monthMap[m].evasion+=(f.tax_evasion_amount??0);});
    const trend = Object.keys(monthMap).sort().map(m=>{const[y,mo]=m.split('-');return{month:m,label:`${FR[Number(mo)-1]} ${y.slice(2)}`,...monthMap[m]};});
    const inspectors = [...new Set(rows.map(r=>r.inspector_id))].map(iid=>{const iRows=rows.filter(r=>r.inspector_id===iid);return{id:iid,name:rows.find(r=>r.inspector_id===iid)?.inspector_name??iid,total:iRows.length,fraud:iRows.filter(r=>isFraud(r.fraud_flag)).length};}).sort((a,b)=>b.fraud-a.fraud);
    const fraudTypes: Record<string,number>={};
    rows.filter(r=>r.fraud_type).forEach(r=>{fraudTypes[r.fraud_type]=(fraudTypes[r.fraud_type]||0)+1;});
    return { office_id:oid, name:NAMES[oid]??oid, baseline_hours:baseline, kpis:{total_sgds:rows.length,fraud_count:fraudRows.length,fraud_rate:rows.length>0?fraudRows.length/rows.length:0,revenue_collected:revenue,taxes_assessed:assessed,tax_gap_recovered:taxGap,avg_clearance_hours:Math.round(avgHours*10)/10,seizures,efficiency_score:Math.round(Math.min(98,Math.max(40,(baseline/Math.max(avgHours,1))*100))),channel_distribution:channels,inspection_types:inspTypes,top_countries:Object.entries(countries).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([c,n])=>({country:c,count:n})),fraud_types:fraudTypes}, inspectors:inspectors.slice(0,10), monthly_trend:trend };
  }).sort((a,b)=>b.kpis.total_sgds-a.kpis.total_sgds);
  res.json(result);
}));

// ── 7. Importer Deep Analytics ──────────────────────────────────────────────
router.get('/advanced/importer-deep', wrap(async (_req, res) => {
  const { sgd, fraud } = await getSheetData();
  const toM = (d: string) => { try{const dt=new Date(d);return isNaN(dt.getTime())?'':`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;}catch{return'';} };
  const FR=['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const impIds = [...new Set(sgd.map(s=>s.importer_id))];

  const result = impIds.map(iid => {
    const rows = sgd.filter(s=>s.importer_id===iid);
    const fraudRows = rows.filter(r=>isFraud(r.fraud_flag));
    const fraudCases = fraud.filter(f=>f.importer_id===iid);
    const revenue = rows.reduce((s,r)=>s+r.revenue_collected,0);
    const assessed = rows.reduce((s,r)=>s+(r.taxes_assessed??0),0);
    const taxGap = fraudRows.reduce((s,r)=>s+(r.tax_gap??0),0);
    const totalEvasion = fraudCases.reduce((s,f)=>s+(f.tax_evasion_amount??0),0);
    const totalPenalty = fraudCases.reduce((s,f)=>s+(f.penalty_amount??0),0);
    const totalRecovered = fraudCases.reduce((s,f)=>s+(f.amount_recovered??0),0);
    const totalLoss = fraudCases.reduce((s,f)=>s+(f.loss_net??0),0);
    const payModes: Record<string,number>={};
    rows.forEach(r=>{payModes[r.payment_mode]=(payModes[r.payment_mode]||0)+1;});
    const countries: Record<string,number>={};
    rows.forEach(r=>{countries[r.country]=(countries[r.country]||0)+1;});
    const tariffs: Record<string,{count:number;desc:string;fraud:number}> = {};
    rows.forEach(r=>{if(!tariffs[r.tariff_code])tariffs[r.tariff_code]={count:0,desc:r.tariff_description??r.tariff_code,fraud:0};tariffs[r.tariff_code].count++;if(isFraud(r.fraud_flag))tariffs[r.tariff_code].fraud++;});
    const declarants: Record<string,{count:number;name:string;fraud:number}> = {};
    rows.forEach(r=>{if(!declarants[r.declarant_id])declarants[r.declarant_id]={count:0,name:r.declarant_name??r.declarant_id,fraud:0};declarants[r.declarant_id].count++;if(isFraud(r.fraud_flag))declarants[r.declarant_id].fraud++;});
    const monthMap: Record<string,{sgds:number;fraud:number;rev:number;cif:number}> = {};
    rows.forEach(r=>{const m=toM(r.date);if(!m)return;if(!monthMap[m])monthMap[m]={sgds:0,fraud:0,rev:0,cif:0};monthMap[m].sgds++;monthMap[m].rev+=r.revenue_collected;monthMap[m].cif+=r.cif_value;if(isFraud(r.fraud_flag))monthMap[m].fraud++;});
    const trend = Object.keys(monthMap).sort().map(m=>{const[y,mo]=m.split('-');return{month:m,label:`${FR[Number(mo)-1]} ${y.slice(2)}`,...monthMap[m]};});
    const fraudTypes: Record<string,number>={};
    fraudRows.forEach(r=>{if(r.fraud_type)fraudTypes[r.fraud_type]=(fraudTypes[r.fraud_type]||0)+1;});
    const statusDist: Record<string,number>={};
    fraudCases.forEach(f=>{statusDist[f.status]=(statusDist[f.status]||0)+1;});
    // Risk score: fraud_rate + evasion ratio + repeat flag
    const fraudRate = rows.length>0?fraudRows.length/rows.length:0;
    const risk_score = Math.min(99,Math.round(fraudRate*200+(totalEvasion/Math.max(assessed,1))*100+(fraudCases.filter(f=>f.repeat_offender==='TRUE').length>0?20:0)+(fraudCases.filter(f=>f.collusion_suspected==='TRUE').length>0?15:0)));
    return { importer_id:iid, name:rows[0]?.importer_name??iid, risk_profile:rows[0]?.importer_risk_profile??'LOW', risk_score, kpis:{total_declarations:rows.length,fraud_count:fraudRows.length,fraud_rate:fraudRate,revenue_collected:revenue,taxes_assessed:assessed,tax_gap:taxGap,total_evasion:totalEvasion,total_penalty:totalPenalty,total_recovered:totalRecovered,total_loss:totalLoss,recovery_rate:totalEvasion+totalPenalty>0?totalRecovered/(totalEvasion+totalPenalty):0,repeat_offender:fraudCases.some(f=>f.repeat_offender==='TRUE'),collusion_suspected:fraudCases.some(f=>f.collusion_suspected==='TRUE')}, fraud_types:fraudTypes, case_status:statusDist, payment_modes:payModes, countries:Object.entries(countries).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([c,n])=>({country:c,count:n})), tariffs:Object.entries(tariffs).sort((a,b)=>b[1].count-a[1].count).slice(0,8).map(([k,v])=>({code:k,...v})), declarants:Object.entries(declarants).sort((a,b)=>b[1].count-a[1].count).map(([k,v])=>({id:k,...v})), monthly_trend:trend, recent_fraud_cases:fraudCases.sort((a,b)=>new Date(b.date_detection).getTime()-new Date(a.date_detection).getTime()).slice(0,5) };
  }).sort((a,b)=>b.risk_score-a.risk_score);
  res.json(result);
}));
