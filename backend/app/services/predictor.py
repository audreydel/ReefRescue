"""
predictor.py — ML inference returning GeoJSON risk layer.

Vectorised: all grid points are predicted in a single model call,
not row-by-row, so 14,000+ points completes in ~1s instead of 60s+.

Now uses real DHW from NOAA Coral Reef Watch instead of the SST+UV proxy,
matching the features the model was actually trained on.
"""

import os
import pickle
import numpy as np
import pandas as pd
from sklearn.neighbors import BallTree

MODEL_PATH   = os.path.join(os.path.dirname(__file__), "../ml/model.pkl")
GBR_CLIM_SST = 27.0

RISK_LABELS = {
    0: "Low Risk",
    1: "Moderate Risk",
    2: "High Risk",
    3: "Critical Risk",
}

_model = None

def _get_model():
    global _model
    if _model is None:
        with open(MODEL_PATH, "rb") as f:
            _model = pickle.load(f)
    return _model


def _align_grid(source_df: pd.DataFrame, target_df: pd.DataFrame, value_col: str) -> np.ndarray:
    """
    Align a coarser grid onto the SST grid via nearest-neighbour BallTree.
    Returns array of aligned values matching target_df row count.
    """
    target_rad = np.radians(target_df[["latitude", "longitude"]].values)
    source_rad = np.radians(source_df[["latitude", "longitude"]].values)
    tree = BallTree(source_rad, metric="haversine")
    idx  = tree.query(target_rad, k=1, return_distance=False).flatten()
    return source_df[value_col].values[idx]


def predict(
    sst_df: pd.DataFrame,
    uv_df: pd.DataFrame,
    dhw_df: pd.DataFrame,
    layer: str = "combined"
) -> dict:
    """
    Generate GeoJSON risk layer from SST, UV, and real DHW data.

    Args:
        sst_df  : columns [latitude, longitude, sst]
        uv_df   : columns [latitude, longitude, uv_index]
        dhw_df  : columns [latitude, longitude, dhw]
        layer   : "combined" | "sst" | "uv" | "dhw"

    Returns:
        GeoJSON FeatureCollection
    """
    model = _get_model()

    sst = sst_df["sst"].values
    lat = sst_df["latitude"].values
    lon = sst_df["longitude"].values

    # Align UV onto SST grid
    if len(uv_df) > 0:
        uv_aligned = _align_grid(uv_df, sst_df, "uv_index")
    else:
        uv_aligned = np.full(len(sst_df), 22.0)

    # Align real DHW onto SST grid
    if len(dhw_df) > 0:
        dhw_aligned = _align_grid(dhw_df, sst_df, "dhw")
    else:
        # Fallback to proxy if DHW fetch failed
        anomaly     = np.maximum(0.0, sst - GBR_CLIM_SST)
        uv_factor   = 1.0 + np.maximum(0.0, (uv_aligned - 22.0) / 22.0) * 0.5
        dhw_aligned = anomaly * uv_factor * 4.0

    # Layer isolation — hold non-active stressors at neutral values
    if layer == "sst":
        sst_input = sst
        dhw_input = np.maximum(0.0, sst - GBR_CLIM_SST) * 4.0
    elif layer == "uv":
        # UV (Sunlight Intensity) shown as standalone educational layer
        # Scale irradiance (typical GBR range 2-9 kWh/m²/day) to risk score directly
        uv_min, uv_max = 2.0, 9.0
        uv_scaled = (uv_aligned - uv_min) / (uv_max - uv_min)
        uv_scaled = np.clip(uv_scaled, 0.0, 1.0)
        
        features = [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [round(float(lon[i]), 4), round(float(lat[i]), 4)]},
                "properties": {
                    "sst":        round(float(sst_df["sst"].values[i]), 3),
                    "uv_index":   round(float(uv_aligned[i]), 2),
                    "dhw":        0.0,
                    "risk_score": round(float(uv_scaled[i]), 4),
                    "risk_label": ["Low Risk", "Moderate Risk", "High Risk", "Critical Risk"][min(3, int(uv_scaled[i] * 4))],
                },
            }
            for i in range(len(sst))
        ]
        return {"type": "FeatureCollection", "features": features}
    
    elif layer == "dhw":
        sst_input = np.full(len(sst_df), 29.0)
        dhw_input = dhw_aligned
    else:
        # Combined — real SST + real DHW
        sst_input = sst
        dhw_input = dhw_aligned

    # Single batched model call
    X = np.column_stack([sst_input, dhw_input])
    all_proba  = model.predict_proba(X)
    risk_class = np.argmax(all_proba, axis=1)
    risk_score = (
        all_proba[:, 1] * 0.35 +
        all_proba[:, 2] * 0.65 +
        all_proba[:, 3] * 1.0
    )

    features = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(float(lon[i]), 4), round(float(lat[i]), 4)]},
            "properties": {
                "sst":        round(float(sst_df["sst"].values[i]), 3),
                "uv_index":   round(float(uv_aligned[i]), 2),
                "dhw":        round(float(dhw_aligned[i]), 2),
                "risk_score": round(float(risk_score[i]), 4),
                "risk_label": RISK_LABELS[int(risk_class[i])],
            },
        }
        for i in range(len(sst))
    ]

    return {"type": "FeatureCollection", "features": features}