import { Router, Request, Response } from 'express';
import { getSheetData, invalidateCache, cacheStatus } from '../services/sheets';
import {
  buildOverview, buildImporterProfiles, buildOfficeStats,
  buildTariffRisk, buildDelays, buildMonthlyRevenue
} from '../services/analytics';

const router = Router();

// Helper — wraps async handlers
const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response) => fn(req, res).catch(err => {
    console.error(err);
    res.status(500).json({ error: err.message ?? 'Internal server error' });
  });

// ── GET /api/overview ─────────────────────────────────────────────────────────
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
  const totalLoss = fraud.reduce((s, f) => s + f.loss_amount, 0);
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
    nodes.push({ id: s.sgd_id, label: s.sgd_id, type: 'sgd', risk: s.fraud_flag ? 90 : 10, fraud: s.fraud_flag === 1 });
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
  const totalLoss = fraud.reduce((s, f) => s + f.loss_amount, 0);
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
