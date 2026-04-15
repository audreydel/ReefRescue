"""
train.py — Train coral bleaching risk model on NOAA Coral Reef Watch data.

Data source: NOAA CRW Daily 5km Satellite Products (CoralTemp v3.1)
ERDDAP dataset ID: NOAA_DHW
Variables fetched:
  - CRW_SST        : sea surface temperature (degrees C)
  - CRW_DHW        : Degree Heating Weeks (deg C-weeks)
  - CRW_BAA        : Bleaching Alert Area (0=no stress, 1=watch, 2=alert1, 3=alert2, 4=alert3, 5=alert4)

Training years: chosen to capture a full range of GBR bleaching conditions:
  - 2015-01-01 to 2015-03-31  : pre-bleaching baseline (mild year)
  - 2016-01-01 to 2016-04-30  : worst bleaching year on record (Hughes et al. 2017)
  - 2017-01-01 to 2017-04-30  : second consecutive mass bleaching event
  - 2020-01-01 to 2020-04-30  : third mass bleaching event
  - 2022-01-01 to 2022-04-30  : fourth mass bleaching event (record 4-in-6-years)

Label mapping (NOAA BAA → our 4-class system):
  BAA 0 (No Stress)   → 0 Low
  BAA 1 (Watch)       → 1 Moderate
  BAA 2 (Alert 1)     → 2 High
  BAA 3-5 (Alert 2+)  → 3 Critical

Features used at training AND inference:
  - sst      : from NOAA ERDDAP erdMBsstd8day (same source as live app)
  - dhw      : computed via DHW proxy from SST + UV at inference time

At inference time predictor.py maps SST + UV → dhw_proxy using:
  anomaly   = max(0, SST - 27.0)
  uv_factor = 1 + max(0, (UV - 22) / 22) * 0.5
  dhw_proxy = anomaly * uv_factor * 4.0

References:
  - Liu et al. 2003 (Coral Reefs): original DHW threshold paper
  - Hughes et al. 2017 (Nature): 2016 GBR mass bleaching
  - NOAA CRW: https://coralreefwatch.noaa.gov/product/5km/
"""

import os
import pickle
import time
import numpy as np
import pandas as pd
import requests
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.pipeline import Pipeline 

# used to help skew towards Moderate
# from imblearn.over_sampling import SMOTE
# from imblearn.pipeline import Pipeline as ImbPipeline

# ── Config ────────────────────────────────────────────────────────────────────

FEATURES  = ["sst", "dhw"]
LABELS    = ["Low", "Moderate", "High", "Critical"]
MODEL_OUT = os.path.join(os.path.dirname(__file__), "model.pkl")

# GBR bounding box — same as live app
LAT_MIN, LAT_MAX = -25.0, -10.0
LON_MIN, LON_MAX = 142.0, 154.0
STRIDE = 10   # coarser stride for training data fetch (speed); app uses 3

# Historical periods: mix of bleaching years + no bleaching years
FETCH_PERIODS = [
     ("2015-01-15", "mild baseline — no mass bleaching"),
    ("2016-03-01", "2016 mass bleaching peak — worst on record"),
    ("2016-04-01", "2016 bleaching continuation"),
    ("2017-03-01", "2017 mass bleaching — second consecutive year"),
    ("2020-03-15", "2020 mass bleaching — third event"),
    ("2022-03-15", "2022 mass bleaching — fourth event in 6 years"),
    ("2024-03-01", "2024 global bleaching event — GBR at Alert 2"),

    ("2012-03-01", "2012 — no significant GBR bleaching"),
    ("2013-03-01", "2013 — quiet year"),
    ("2014-03-01", "2014 — pre-bleaching baseline"),
    ("2019-03-01", "2019 — mild year between 2017 and 2020 events"),
]

ERDDAP_BASE = "https://coastwatch.pfeg.noaa.gov/erddap/griddap/NOAA_DHW.csv"


# ── Fetch ─────────────────────────────────────────────────────────────────────

def fetch_crw_snapshot(date_str: str, description: str) -> pd.DataFrame | None:
    """
    Fetch a single-day snapshot of SST + DHW + BAA from NOAA CRW ERDDAP
    for the GBR region.
    """
    url = (
        f"{ERDDAP_BASE}?"
        f"CRW_SST[({date_str}T12:00:00Z)][({LAT_MIN}):{STRIDE}:({LAT_MAX})][({LON_MIN}):{STRIDE}:({LON_MAX})],"
        f"CRW_DHW[({date_str}T12:00:00Z)][({LAT_MIN}):{STRIDE}:({LAT_MAX})][({LON_MIN}):{STRIDE}:({LON_MAX})],"
        f"CRW_BAA[({date_str}T12:00:00Z)][({LAT_MIN}):{STRIDE}:({LAT_MAX})][({LON_MIN}):{STRIDE}:({LON_MAX})]"
    )

    print(f"  Fetching {date_str} ({description})...")
    try:
        r = requests.get(url, timeout=60)
        r.raise_for_status()
    except Exception as e:
        print(f"  WARNING: fetch failed for {date_str}: {e}")
        return None

    lines = r.text.strip().split("\n")
    # ERDDAP CSV: row 0 = headers, row 1 = units, rows 2+ = data
    if len(lines) < 3:
        print(f"  WARNING: no data rows for {date_str}")
        return None

    headers = lines[0].split(",")
    data_rows = [line.split(",") for line in lines[2:]]
    df = pd.DataFrame(data_rows, columns=headers)

    for col in df.columns:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.rename(columns={
        "CRW_SST": "sst",
        "CRW_DHW": "dhw",
        "CRW_BAA": "baa",
    })

    df = df.dropna(subset=["sst", "dhw", "baa"])
    df["dhw"] = df["dhw"].clip(lower=0)
    df["date"] = date_str

    print(f"  → {len(df)} grid points, BAA distribution: { dict(df['baa'].value_counts().sort_index()) }")
    return df[["sst", "dhw", "baa", "date"]]


# ── Label mapping ─────────────────────────────────────────────────────────────

def baa_to_class(baa: float) -> int:
    """
    Map NOAA Bleaching Alert Area level to our 4-class label.
    BAA 0 = No Stress   → Low
    BAA 1 = Watch       → Moderate
    BAA 2 = Alert 1     → High     (significant bleaching expected)
    BAA 3+ = Alert 2+   → Critical (mass bleaching / mortality expected)
    """
    baa = int(baa)
    if baa <= 0:   return 0
    elif baa == 1: return 1
    elif baa == 2: return 2
    else:          return 3


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("[train] Fetching NOAA CRW satellite data for GBR region...\n")

    frames = []
    for date_str, desc in FETCH_PERIODS:
        df = fetch_crw_snapshot(date_str, desc)
        if df is not None:
            frames.append(df)
        time.sleep(1)   # be polite to NOAA servers

    if not frames:
        print("[train] ERROR: All fetches failed. Check your internet connection.")
        return

    df = pd.concat(frames, ignore_index=True)
    df["risk_class"] = df["baa"].apply(baa_to_class)

    # Filter implausible SST
    df = df[(df["sst"] > 15) & (df["sst"] < 40)]

    print(f"\n[train] Total training samples: {len(df)}")
    print(f"[train] SST range: {df['sst'].min():.1f} – {df['sst'].max():.1f} °C")
    print(f"[train] DHW range: {df['dhw'].min():.1f} – {df['dhw'].max():.1f}")
    print(f"\n[train] Class distribution:")
    counts = df["risk_class"].value_counts().sort_index()
    for i, label in enumerate(LABELS):
        n = counts.get(i, 0)
        print(f"  {i} {label:10s}: {n:5d} ({n/len(df)*100:.1f}%)")

    X = df[FEATURES].values
    y = df["risk_class"].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"\n[train] Train: {len(X_train)}, Test: {len(X_test)}")

    # # SMOTE to oversample minority classes (High/Critical)
    # # k_neighbors=2 because some minority classes may have very few samples
    # pipeline = ImbPipeline([
    #     ("scaler", StandardScaler()),
    #     ("smote",  SMOTE(random_state=42, k_neighbors=2)),
    #     ("clf",    RandomForestClassifier(
    #         n_estimators=300,
    #         max_depth=10,
    #         min_samples_leaf=3,
    #         class_weight="balanced",
    #         random_state=42,
    #         n_jobs=-1,
    #     )),
    # ])


    # Replacing SMOTE
    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", RandomForestClassifier(
            n_estimators=300,
            max_depth=10,
            min_samples_leaf=3,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1,
        )),
    ])

    print("\n[train] 5-fold cross-validation...")
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(pipeline, X_train, y_train, cv=cv, scoring="f1_macro")
    print(f"[train] CV F1-macro: {cv_scores.mean():.3f} ± {cv_scores.std():.3f}")

    print("\n[train] Fitting final model...")
    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    print("\n[train] Test set performance:")
    print(classification_report(y_test, y_pred, target_names=LABELS))

    print("[train] Confusion matrix:")
    cm = confusion_matrix(y_test, y_pred)
    print(pd.DataFrame(cm, index=LABELS, columns=LABELS))

    rf = pipeline.named_steps["clf"]
    print(f"\n[train] Feature importances:")
    for feat, imp in zip(FEATURES, rf.feature_importances_):
        print(f"  {feat:10s}: {imp:.3f}")

    os.makedirs(os.path.dirname(MODEL_OUT), exist_ok=True)
    with open(MODEL_OUT, "wb") as f:
        pickle.dump(pipeline, f)
    print(f"\n[train] Saved → {MODEL_OUT}")

    # Sanity checks: [sst, dhw] → expected label
    test_cases = [
        ([25.0,  0.0], "cold, no stress      → expect Low"),
        ([28.0,  1.5], "warm, mild stress     → expect Low/Moderate"),
        ([29.0,  5.0], "hot, watch level      → expect Moderate/High"),
        ([30.5,  9.0], "very hot, warning     → expect High/Critical"),
        ([32.0, 16.0], "extreme, mass bleach  → expect Critical"),
    ]
    print("\n[train] Sanity checks:")
    for case, desc in test_cases:
        pred_class = pipeline.predict([case])[0]
        pred_proba = pipeline.predict_proba([case])[0]
        label      = LABELS[pred_class]
        risk_score = pred_proba[1]*0.35 + pred_proba[2]*0.65 + pred_proba[3]*1.0
        print(f"  {desc:40s} → {label:10s}  score={risk_score:.2f}")


if __name__ == "__main__":
    main()