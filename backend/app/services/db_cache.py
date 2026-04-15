"""
db_cache.py — SQLite-backed cache for pre-loaded GeoJSON risk responses.

Replaces the slow first-load problem for known dates by storing fully
computed GeoJSON responses in a local SQLite database. The backend checks
this cache before hitting any external APIs.

Pre-load by running:
    python -m app.services.db_cache

From the backend directory.
"""

import os
import json
import sqlite3
import time
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(__file__), "../../risk_cache.db")

PRELOAD_DATES = [
    "2026-03-04",
    "2026-02-01",
    "2025-12-01",
    "2025-03-01",
    "2024-03-01",
    "2023-03-01",
    "2026-01-01",
    "2025-11-01",
    "2025-09-01",
    "2025-08-01",
    "2025-07-01",
    "2025-06-01",
    "2025-05-01",
    "2024-12-01",
    "2024-06-01",
    "2016-02-01",
    "2016-03-01",
    "2016-04-01",
    "2017-03-01",
    "2017-02-01",
]

LAYERS = ["combined", "sst", "uv", "dhw"]


# ── Database setup ─────────────────────────────────────────────────────────────

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS risk_cache (
                date    TEXT NOT NULL,
                layer   TEXT NOT NULL,
                geojson TEXT NOT NULL,
                cached_at TEXT NOT NULL,
                PRIMARY KEY (date, layer)
            )
        """)
        conn.commit()
    print(f"[db] Database initialised at {DB_PATH}")


# ── Read / write ───────────────────────────────────────────────────────────────

def get_cached(date: str, layer: str) -> dict | None:
    try:
        with get_connection() as conn:
            row = conn.execute(
                "SELECT geojson FROM risk_cache WHERE date = ? AND layer = ?",
                (date, layer)
            ).fetchone()
            if row:
                print(f"[db] Cache hit for {date} / {layer}")
                return json.loads(row["geojson"])
    except Exception as e:
        print(f"[db] Cache read error: {e}")
    return None


def set_cached(date: str, layer: str, geojson: dict):
    try:
        with get_connection() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO risk_cache (date, layer, geojson, cached_at)
                VALUES (?, ?, ?, ?)
                """,
                (date, layer, json.dumps(geojson), datetime.now(timezone.utc).isoformat())
            )
            conn.commit()
        print(f"[db] Cached {date} / {layer} ({len(geojson['features'])} features)")
    except Exception as e:
        print(f"[db] Cache write error: {e}")


def is_cached(date: str, layer: str) -> bool:
    try:
        with get_connection() as conn:
            row = conn.execute(
                "SELECT 1 FROM risk_cache WHERE date = ? AND layer = ?",
                (date, layer)
            ).fetchone()
            return row is not None
    except Exception:
        return False


def missing_layers(date: str) -> list[str]:
    """Return list of layers not yet cached for a given date."""
    return [l for l in LAYERS if not is_cached(date, l)]


def list_cached() -> list[dict]:
    try:
        with get_connection() as conn:
            rows = conn.execute(
                "SELECT date, layer, cached_at FROM risk_cache ORDER BY date, layer"
            ).fetchall()
            return [dict(row) for row in rows]
    except Exception:
        return []


# ── Pre-loader ─────────────────────────────────────────────────────────────────

def preload():
    """
    Pre-fetch and cache all combinations of PRELOAD_DATES x LAYERS.
    Smart: only fetches API data for layers that are actually missing.
    Skips API fetches entirely if all missing layers can reuse cached data.
    """
    from app.services.noaa import fetch_sst
    from app.services.uv import fetch_uv
    from app.services.dhw import fetch_dhw
    from app.services.predictor import predict
    import pandas as pd

    init_db()

    total_layers = len(PRELOAD_DATES) * len(LAYERS)
    done = 0
    skipped = 0
    errors = 0

    print(f"\n[db] Starting smart pre-load: {len(PRELOAD_DATES)} dates × {len(LAYERS)} layers = {total_layers} combinations\n")

    for date in PRELOAD_DATES:
        missing = missing_layers(date)

        if not missing:
            print(f"[db] {date} — all layers cached, skipping")
            skipped += len(LAYERS)
            done += len(LAYERS)
            continue

        print(f"\n{'='*60}")
        print(f"[db] {date} — missing layers: {missing}")
        print(f"{'='*60}")

        # Determine which API fetches are actually needed
        need_sst = any(l in missing for l in ["combined", "sst", "dhw", "uv"])
        need_uv  = any(l in missing for l in ["combined", "uv"])
        need_dhw = any(l in missing for l in ["combined", "dhw"])

        sst_df = uv_df = dhw_df = None

        try:
            if need_sst:
                print(f"[db] Fetching SST...")
                sst_df = fetch_sst(date)
            if need_uv:
                print(f"[db] Fetching UV...")
                uv_df = fetch_uv(date)
            if need_dhw:
                print(f"[db] Fetching DHW...")
                dhw_df = fetch_dhw(date)
        except Exception as e:
            print(f"[db] ERROR fetching data for {date}: {e} — skipping missing layers")
            errors += len(missing)
            done += len(missing)
            continue

        # Generate only the missing layers
        for layer in missing:
            try:
                if layer in ("sst", "dhw"):
                    uv_input = pd.DataFrame(columns=["latitude", "longitude", "uv_index"])
                else:
                    uv_input = uv_df if uv_df is not None else pd.DataFrame(columns=["latitude", "longitude", "uv_index"])

                if layer == "uv":
                    dhw_input = pd.DataFrame(columns=["latitude", "longitude", "dhw"])
                else:
                    dhw_input = dhw_df if dhw_df is not None else pd.DataFrame(columns=["latitude", "longitude", "dhw"])

                geojson = predict(sst_df, uv_input, dhw_input, layer=layer)
                set_cached(date, layer, geojson)
                done += 1
                print(f"[db] ✓ {done}/{total_layers} — {date} / {layer}")

            except Exception as e:
                print(f"[db] ERROR generating {date} / {layer}: {e}")
                errors += 1
                done += 1

        # Count already-cached layers for this date
        already_cached = len(LAYERS) - len(missing)
        skipped += already_cached
        done += already_cached

        time.sleep(1)

    print(f"\n[db] Pre-load complete")
    print(f"[db] Skipped (already cached): {skipped}")
    print(f"[db] Errors: {errors}")
    print(f"\n[db] Cached entries ({len(list_cached())} total):")
    for entry in list_cached():
        print(f"     {entry['date']} / {entry['layer']} (cached {entry['cached_at'][:19]})")


if __name__ == "__main__":
    preload()