"""
CUSTOMS360 — Python AI Microservice
Models: DATE graph scoring, Isolation Forest (anomaly), XGBoost (fraud probability)
Communication: HTTP REST called by Node backend via AI_SERVICE_URL env variable
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np
import uvicorn
import os
import json
from typing import Optional

# Lazy imports so startup is fast even if sklearn/xgboost take time
try:
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import StandardScaler
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    print("⚠️  sklearn not available — Isolation Forest disabled")

try:
    import xgboost as xgb
    XGB_AVAILABLE = True
except ImportError:
    XGB_AVAILABLE = False
    print("⚠️  xgboost not available — XGBoost scoring disabled")

app = FastAPI(title="CUSTOMS360 AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Pydantic models ───────────────────────────────────────────────────────────

class SGDRecord(BaseModel):
    sgd_id: str
    importer_id: str
    declarant_id: str
    office_id: str
    tariff_code: str
    quantity: float
    weight: float
    cif_value: float
    taxes_declared: float
    revenue_collected: float
    clearance_hours: float
    fraud_flag: Optional[int] = None

class ScoreRequest(BaseModel):
    records: list[SGDRecord]

class ScoreResponse(BaseModel):
    sgd_id: str
    isolation_score: float        # -1 (anomaly) to 1 (normal), normalised 0-100
    xgboost_fraud_prob: float     # 0.0 - 1.0
    date_risk_score: float        # 0 - 100
    composite_risk: float         # 0 - 100
    is_anomaly: bool
    risk_level: str               # CRITIQUE | ÉLEVÉ | MOYEN | FAIBLE

class ImporterScoreRequest(BaseModel):
    importer_id: str
    total_declarations: int
    fraud_cases: int
    unique_declarants: int
    avg_cif_weight_ratio: float
    high_risk_tariff_count: int
    multi_office: bool

# ── DATE Algorithm ────────────────────────────────────────────────────────────

def date_risk(rec: SGDRecord, all_records: list[SGDRecord]) -> float:
    """
    DATE (Declarant-Agent-Tariff-Entity) graph-based risk score.
    Approximated here with feature engineering — full graph version
    requires a graph database in production.
    """
    imp_records = [r for r in all_records if r.importer_id == rec.importer_id]
    if not imp_records:
        return 0.0

    # Feature 1: CIF/Weight ratio anomaly
    cif_weight = rec.cif_value / max(rec.weight, 0.01)
    avg_cif_weight = np.mean([r.cif_value / max(r.weight, 0.01) for r in imp_records])
    ratio_anomaly = abs(cif_weight - avg_cif_weight) / max(avg_cif_weight, 1)

    # Feature 2: Revenue gap (taxes declared vs revenue collected)
    rev_gap = max(0, rec.taxes_declared - rec.revenue_collected) / max(rec.taxes_declared, 1)

    # Feature 3: Fraud rate for this importer
    fraud_rate = sum(1 for r in imp_records if r.fraud_flag == 1) / len(imp_records)

    # Feature 4: Declarant concentration
    declarants = set(r.declarant_id for r in imp_records)
    concentration = 1.0 / max(len(declarants), 1)

    HIGH_RISK = {'85044000','62046200','85176200','87032390','84715000'}
    tariff_risk = 1.0 if rec.tariff_code in HIGH_RISK else 0.3

    score = (
        ratio_anomaly * 25 +
        rev_gap * 30 +
        fraud_rate * 25 +
        concentration * 10 +
        tariff_risk * 10
    )
    return min(100.0, float(score))

# ── Isolation Forest ──────────────────────────────────────────────────────────

_iso_model: Optional[object] = None
_iso_scaler: Optional[object] = None

def get_features(rec: SGDRecord) -> list[float]:
    """Extract numeric features for Isolation Forest."""
    cif_per_unit = rec.cif_value / max(rec.quantity, 1)
    cif_per_kg = rec.cif_value / max(rec.weight, 0.01)
    tax_rate = rec.taxes_declared / max(rec.cif_value, 1)
    rev_ratio = rec.revenue_collected / max(rec.taxes_declared, 1)
    return [
        rec.quantity, rec.weight, rec.cif_value,
        rec.taxes_declared, rec.revenue_collected,
        rec.clearance_hours, cif_per_unit, cif_per_kg,
        tax_rate, rev_ratio,
    ]

def fit_isolation_forest(records: list[SGDRecord]):
    global _iso_model, _iso_scaler
    if not SKLEARN_AVAILABLE or len(records) < 10:
        return
    X = np.array([get_features(r) for r in records])
    _iso_scaler = StandardScaler()
    X_scaled = _iso_scaler.fit_transform(X)
    _iso_model = IsolationForest(n_estimators=100, contamination=0.1, random_state=42)
    _iso_model.fit(X_scaled)

def isolation_score(rec: SGDRecord) -> tuple[float, bool]:
    """Returns (normalised score 0-100, is_anomaly)."""
    if not SKLEARN_AVAILABLE or _iso_model is None or _iso_scaler is None:
        return 50.0, False
    X = np.array([get_features(rec)])
    X_scaled = _iso_scaler.transform(X)
    raw = _iso_model.score_samples(X_scaled)[0]  # negative log-likelihood, lower = more anomalous
    # Normalise: typical range is -0.7 to 0.1
    normalised = float(np.clip((raw + 0.7) / 0.8 * 100, 0, 100))
    is_anomaly = _iso_model.predict(X_scaled)[0] == -1
    return normalised, is_anomaly

# ── XGBoost fraud probability ─────────────────────────────────────────────────

_xgb_model: Optional[object] = None

def fit_xgboost(records: list[SGDRecord]):
    global _xgb_model
    if not XGB_AVAILABLE:
        return
    labeled = [r for r in records if r.fraud_flag is not None]
    if len(labeled) < 20:
        return
    X = np.array([get_features(r) for r in labeled])
    y = np.array([r.fraud_flag for r in labeled])
    if len(set(y)) < 2:
        return  # need both classes
    _xgb_model = xgb.XGBClassifier(
        n_estimators=50, max_depth=4, learning_rate=0.1,
        use_label_encoder=False, eval_metric='logloss',
        random_state=42, verbosity=0
    )
    _xgb_model.fit(X, y)

def xgb_fraud_prob(rec: SGDRecord) -> float:
    if not XGB_AVAILABLE or _xgb_model is None:
        # Rule-based fallback
        features = get_features(rec)
        tax_rate = features[8]
        rev_ratio = features[9]
        base = 0.1
        if tax_rate < 0.05: base += 0.3
        if rev_ratio < 0.7: base += 0.25
        if rec.clearance_hours > 72: base += 0.15
        return min(0.95, base)
    X = np.array([get_features(rec)])
    return float(_xgb_model.predict_proba(X)[0][1])

# ── Main scoring endpoint ─────────────────────────────────────────────────────

@app.post("/score", response_model=list[ScoreResponse])
async def score_records(req: ScoreRequest):
    if not req.records:
        raise HTTPException(status_code=400, detail="No records provided")

    # Fit models on the batch (in production, models would be pre-trained)
    fit_isolation_forest(req.records)
    fit_xgboost(req.records)

    results = []
    for rec in req.records:
        iso_s, is_anom = isolation_score(rec)
        xgb_p = xgb_fraud_prob(rec)
        date_s = date_risk(rec, req.records)

        composite = (date_s * 0.45 + xgb_p * 100 * 0.35 + (100 - iso_s) * 0.20)
        composite = min(99.0, composite)

        risk_level = (
            "CRITIQUE" if composite >= 80 else
            "ÉLEVÉ"    if composite >= 60 else
            "MOYEN"    if composite >= 35 else
            "FAIBLE"
        )

        results.append(ScoreResponse(
            sgd_id=rec.sgd_id,
            isolation_score=round(iso_s, 2),
            xgboost_fraud_prob=round(xgb_p, 4),
            date_risk_score=round(date_s, 2),
            composite_risk=round(composite, 2),
            is_anomaly=is_anom,
            risk_level=risk_level,
        ))

    return results

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "sklearn": SKLEARN_AVAILABLE,
        "xgboost": XGB_AVAILABLE,
        "iso_model_fitted": _iso_model is not None,
        "xgb_model_fitted": _xgb_model is not None,
    }

@app.get("/")
async def root():
    return {"service": "CUSTOMS360 AI Microservice", "version": "1.0.0"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
