"""
uv.py — Fetch shortwave radiation data from NASA POWER API.

NASA POWER supports regional bounding box queries returning a full grid.
Tiles are fetched in parallel to minimise latency.
No API key required.
"""

import requests
import pandas as pd
import time
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

# ── Constants ──────────────────────────────────────────────────────────────────
NASA_POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/regional"

PARAMETER = "ALLSKY_SFC_SW_DWN"  # All Sky Surface Shortwave Downward Irradiance

# GBR split into two 10° tiles to satisfy NASA POWER bounding box limit
TILES = [
    {"latitude-min": -25, "latitude-max": -15, "longitude-min": 142, "longitude-max": 152},
    {"latitude-min": -15, "latitude-max": -10, "longitude-min": 144, "longitude-max": 154},
]

_uv_cache: dict[str, pd.DataFrame] = {}

def _valid_date(date_str: str) -> str:
    """Walk back to a safe date if requested date is within NASA POWER's lag window."""
    date = datetime.strptime(date_str, "%Y-%m-%d")
    safe = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=3)
    if date > safe:
        date = safe
    return date.strftime("%Y%m%d")


def _fetch_tile(tile: dict, date_fmt: str) -> list[dict]:
    """
    Fetch a single NASA POWER tile with up to 3 retries.
    Returns a list of record dicts.
    """
    params = {
        "parameters": PARAMETER,
        "community": "RE",
        "start": date_fmt,
        "end": date_fmt,
        "format": "JSON",
        **tile,
    }

    for attempt in range(3):
        try:
            t0 = time.time()
            response = requests.get(NASA_POWER_URL, params=params, timeout=60)
            response.raise_for_status()
            elapsed = time.time() - t0
            print(f"[uv] Tile {tile['latitude-min']}→{tile['latitude-max']} "
                  f"fetched in {elapsed:.1f}s")
            break
        except requests.RequestException as e:
            if attempt == 2:
                raise RuntimeError(
                    f"NASA POWER tile request failed after 3 attempts: {e}"
                )
            print(f"[uv] Retry {attempt + 1} for tile {tile}...")
            time.sleep(1)

    records = []
    for feature in response.json().get("features", []):
        coords = feature["geometry"]["coordinates"]
        lon, lat = coords[0], coords[1]
        value = feature["properties"]["parameter"][PARAMETER].get(date_fmt)
        if value is not None and value != -999.0:
            records.append({
                "latitude":  round(lat, 4),
                "longitude": round(lon, 4),
                "uv_index":  value,
            })
    return records


def fetch_uv(date_str: str) -> pd.DataFrame:
    """
    Fetch shortwave radiation across the GBR region from NASA POWER.
    Both tiles are fetched in parallel to reduce total wait time.

    Returns a DataFrame with columns: latitude, longitude, uv_index
    """
    date_fmt = _valid_date(date_str)
    total_start = time.time()
    if date_fmt in _uv_cache:
        print(f"[uv] Cache hit for {date_fmt}")
        return _uv_cache[date_fmt]
    print(f"[uv] Fetching NASA POWER radiation for date: {date_fmt} (2 tiles in parallel)")

    all_records = []

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = {
            executor.submit(_fetch_tile, tile, date_fmt): tile
            for tile in TILES
        }
        for future in as_completed(futures):
            try:
                records = future.result()
                all_records.extend(records)
            except RuntimeError as e:
                raise RuntimeError(f"UV fetch failed: {e}")

    if not all_records:
        raise RuntimeError(f"No NASA POWER data returned for date {date_fmt}")

    df = pd.DataFrame(all_records).drop_duplicates(subset=["latitude", "longitude"])

    total_elapsed = time.time() - total_start
    print(f"[uv] Retrieved {len(df)} radiation grid points "
          f"in {total_elapsed:.1f}s total")
    print(df.describe())
    _uv_cache[date_fmt] = df

    return df


# ── Quick test ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    df = fetch_uv("2026-02-01")
    print(df.head(10))