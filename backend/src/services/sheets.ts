import { google } from 'googleapis';
import type { SGDRow, FraudRow } from '../types/index';

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

// Cache to avoid hammering the Sheets API on every request
interface Cache {
  sgd: SGDRow[];
  fraud: FraudRow[];
  lastFetched: number;
}

let cache: Cache = { sgd: [], fraud: [], lastFetched: 0 };
// DEMO_MODE=true → 15s refresh so live Sheet edits appear almost instantly
// Production → set CACHE_TTL_SECONDS=300 (5 min) to reduce Sheets API calls
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_SECONDS ?? (process.env.DEMO_MODE === 'true' ? 15 : 300)) * 1000;

function getAuth() {
  // GOOGLE_SERVICE_ACCOUNT_JSON is the full JSON key pasted as env var on Railway
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env variable not set');
  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
}

function parseRow<T>(headers: string[], values: string[]): T {
  const obj: Record<string, string | number> = {};
  headers.forEach((h, i) => {
    const v = (values[i] ?? '').trim();
    // Numeric columns
    const numericCols = new Set([
      'quantity','weight','cif_value','taxes_declared','revenue_collected',
      'clearance_hours','fraud_flag','loss_amount','ai_probability'
    ]);
    obj[h] = numericCols.has(h) ? (isNaN(Number(v)) ? 0 : Number(v)) : v;
  });
  return obj as T;
}

async function fetchSheet<T>(tabName: string): Promise<T[]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A:Z`,
  });
  const rows = response.data.values ?? [];
  if (rows.length < 2) return [];
  const headers = rows[0].map((h: string) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return rows.slice(1)
    .filter(r => r.some((c: string) => c?.trim()))
    .map(r => parseRow<T>(headers, r));
}

export async function getSheetData(): Promise<{ sgd: SGDRow[]; fraud: FraudRow[] }> {
  const now = Date.now();
  if (now - cache.lastFetched < CACHE_TTL_MS && cache.sgd.length > 0) {
    return { sgd: cache.sgd, fraud: cache.fraud };
  }
  console.log('🔄 Fetching fresh data from Google Sheets...');
  const [sgd, fraud] = await Promise.all([
    fetchSheet<SGDRow>('SGD_DECLARATIONS'),
    fetchSheet<FraudRow>('FRAUD_CASES'),
  ]);
  cache = { sgd, fraud, lastFetched: now };
  console.log(`✅ Loaded ${sgd.length} SGDs, ${fraud.length} fraud cases`);
  return { sgd, fraud };
}

export function invalidateCache() {
  cache.lastFetched = 0;
}

export function cacheStatus() {
  return {
    last_fetched: cache.lastFetched ? new Date(cache.lastFetched).toISOString() : null,
    age_seconds: cache.lastFetched ? Math.round((Date.now() - cache.lastFetched) / 1000) : null,
    ttl_seconds: Math.round(CACHE_TTL_MS / 1000),
    sgd_count: cache.sgd.length,
    fraud_count: cache.fraud.length,
    demo_mode: process.env.DEMO_MODE === 'true',
  };
}
