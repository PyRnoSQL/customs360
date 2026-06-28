# CUSTOMS360 — Monorepo Deployment Guide
## Railway · `customs360.up.railway.app`

---

## Repository Structure

```
customs360/                          ← GitHub repo root
├── railway.toml                     ← Main service build/deploy config
├── nixpacks.toml                    ← Build pipeline (Node 20 + Python)
├── .gitignore
├── .env.example                     ← Document all required env vars
│
├── frontend/                        ← Vite + React + TypeScript + Tailwind
│   ├── src/
│   │   ├── pages/                   ← 7 pages (Dashboard, Importers, Fraud…)
│   │   ├── components/UI.tsx        ← Shared components
│   │   ├── services/api.ts          ← All API calls + formatters
│   │   ├── hooks/useApi.ts          ← Data fetching hook
│   │   └── types/index.ts           ← TypeScript types
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── backend/                         ← Node.js + Express + TypeScript
│   ├── src/
│   │   ├── server.ts                ← Entry point
│   │   ├── routes/api.ts            ← 10 API endpoints
│   │   ├── services/
│   │   │   ├── sheets.ts            ← Google Sheets API + 5min cache
│   │   │   └── analytics.ts        ← DATE algorithm + all aggregations
│   │   └── types/index.ts
│   └── tsconfig.json
│
└── ai-service/                      ← Python FastAPI microservice
    ├── main.py                      ← DATE, Isolation Forest, XGBoost
    ├── requirements.txt
    └── railway.toml                 ← Separate Railway service config
```

---

## Data Flow

```
Google Sheets
  SGD_DECLARATIONS (14 cols)
  FRAUD_CASES (11 cols)
        ↓ googleapis (5min cache)
  Node backend /api/*
        ↓ aggregated at runtime
  Dashboard · Importers · Fraud · Delays · Offices · Graph
        ↓ /api/ai proxy
  Anthropic Claude (contextual analysis)
        ↓ /api/ai/score (optional)
  Python AI microservice (DATE + IsoForest + XGBoost)
```

---

## STEP 1 — Push to GitHub

```bash
git init
git add .
git commit -m "feat: CUSTOMS360 full stack deploy"
git remote add origin https://github.com/YOUR_USERNAME/customs360.git
git branch -M main
git push -u origin main
```

---

## STEP 2 — Deploy Main Service on Railway

### 2a. Create project
1. **railway.app** → **New Project** → **Deploy from GitHub repo**
2. Select your `customs360` repository
3. Railway reads `railway.toml` and `nixpacks.toml` automatically

### 2b. Set environment variables
Railway dashboard → your service → **Variables** tab:

| Variable | Value | Required |
|----------|-------|----------|
| `GOOGLE_SHEET_ID` | Your Sheet ID from the URL | ✅ |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full contents of your service account JSON file | ✅ |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` | ✅ |
| `AI_SERVICE_URL` | URL of Python service (add after Step 3) | ⬜ Optional |
| `NODE_ENV` | `production` | ✅ |

> **Tip for `GOOGLE_SERVICE_ACCOUNT_JSON`**: open the JSON file, select all, copy, paste as a single-line value in Railway's variable editor. Railway handles the escaping.

### 2c. Get your Railway URL
After deploy (~2 min build), Railway assigns:
```
https://customs360-production-xxxx.up.railway.app
```
You can rename this in **Settings → Networking → Generate Domain** to get `customs360.up.railway.app`.

### 2d. Verify
```bash
curl https://customs360.up.railway.app/api/health
# → {"status":"ok","timestamp":"..."}

curl https://customs360.up.railway.app/api/overview
# → {"total_sgd":500,"total_revenue":...}
```

---

## STEP 3 — Deploy Python AI Microservice (Optional but recommended)

The Python service runs as a **separate Railway service** in the same project.

### 3a. Add second service
Railway dashboard → **+ New Service** → **GitHub repo** → same `customs360` repo
→ **Root Directory**: set to `ai-service`

Railway will use `ai-service/railway.toml` for this service.

### 3b. Set variables on the AI service
| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |

Railway sets `PORT` automatically.

### 3c. Link services
Copy the internal URL of the Python service:
- Python service → **Settings** → copy the Railway internal domain (e.g. `customs360-ai.railway.internal`)

On the **main Node service** → Variables → add:
```
AI_SERVICE_URL=https://customs360-ai-production-xxxx.up.railway.app
```

Now the Node backend will forward `/api/ai/score` calls to Python for real ML scoring.

---

## Local Development

```bash
# Terminal 1 — Backend
cd backend
cp ../.env.example .env   # fill in your values
npm install
npm run dev               # http://localhost:3001

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev               # http://localhost:5173 (proxies /api → 3001)

# Terminal 3 — Python AI (optional)
cd ai-service
pip install -r requirements.txt
python main.py            # http://localhost:8000
```

---

## API Reference

| Method | Endpoint | Source | Description |
|--------|----------|--------|-------------|
| GET | `/api/health` | — | Health check |
| GET | `/api/overview` | Sheets | KPIs + monthly revenue |
| GET | `/api/importers` | Sheets → DATE | All importers with risk scores |
| GET | `/api/importers/:id` | Sheets | Full 360° profile |
| GET | `/api/fraud` | Sheets | Fraud cases + tariff risk |
| GET | `/api/offices` | Sheets | Office performance stats |
| GET | `/api/delays` | Sheets | Suspicious clearance delays |
| GET | `/api/revenue` | Sheets | Monthly revenue series |
| GET | `/api/graph` | Sheets | DATE network nodes + links |
| POST | `/api/ai` | Anthropic | Claude LLM recommendations |
| POST | `/api/ai/score` | Python | DATE + IsoForest + XGBoost |
| POST | `/api/cache/invalidate` | — | Force Sheets re-fetch |

---

## How Derived Data Works

The Google Sheet has **2 tabs only**. Everything else is computed:

| Dashboard data | Computed from |
|----------------|---------------|
| Importer profiles | Group SGD_DECLARATIONS by `importer_id` |
| DATE risk scores | Fraud rate + CIF/Weight ratio + declarant concentration |
| Office stats | Group SGD by `office_id`, aggregate revenue + clearance |
| Tariff risk | Group by `tariff_code`, count fraud flags |
| Monthly revenue | Group by `date.substring(0,7)`, sum revenue |
| Delay records | Filter SGDs where `clearance_hours` > office baseline |

---

## Redeploying After Sheet Changes

Railway auto-deploys on every `git push`. The Sheets cache resets every 5 minutes automatically. To force immediate refresh:

```bash
curl -X POST https://customs360.up.railway.app/api/cache/invalidate
```

---

*CUSTOMS360 v2.0 — Vite + React + TypeScript + Node + Python · Architecture NEXUS360*
