import requests
import pandas as pd
import time
from datetime import datetime, timedelta
from io import StringIO

# ── Constants ──────────────────────────────────────────────────────────────────
ERDDAP_BASE = "https://coastwatch.pfeg.noaa.gov/erddap/griddap"
DATASET_ID  = "erdMBsstd8day"
VARIABLE    = "sst"

LAT_MIN, LAT_MAX = -25.0, -10.0
LON_MIN, LON_MAX = 142.0, 154.0
STRIDE      = 3   
MAX_RETRIES = 6

# ── In-memory cache ────────────────────────────────────────────────────────────
# Keyed by resolved date string so repeated requests return instantly
_sst_cache: dict[str, pd.DataFrame] = {}


def _nearest_8day_date(date_str: str) -> str:
    """Walk back in 8-day steps to find the nearest available composite date."""
    date = datetime.strptime(date_str, "%Y-%m-%d")
    for i in range(MAX_RETRIES):
        candidate = date - timedelta(days=8 * i)
        candidate_str = candidate.strftime("%Y-%m-%dT12:00:00Z")
        url = _build_url(candidate_str)
        try:
            r = requests.head(url, timeout=10)
            if r.status_code == 200:
                return candidate_str
        except requests.RequestException:
            continue
    return date.strftime("%Y-%m-%dT12:00:00Z")


def _build_url(date_iso: str) -> str:
    return (
        f"{ERDDAP_BASE}/{DATASET_ID}.csv"
        f"?{VARIABLE}"
        f"[({date_iso})]"
        f"[(0.0)]"
        f"[({LAT_MIN}):{STRIDE}:({LAT_MAX})]"
        f"[({LON_MIN}):{STRIDE}:({LON_MAX})]"
    )


def fetch_sst(date_str: str) -> pd.DataFrame:
    """
    Fetch SST data from NOAA ERDDAP for the GBR on a given date.

    Results are cached in memory — repeated requests for the same date
    return instantly without hitting ERDDAP again.

    Args:
        date_str: Date in YYYY-MM-DD format

    Returns:
        DataFrame with columns: latitude, longitude, sst
    """
    # Resolve to nearest valid 8-day composite date
    date_iso = _nearest_8day_date(date_str)

    # Return cached result if available
    if date_iso in _sst_cache:
        print(f"[noaa] Cache hit for {date_iso} ({len(_sst_cache[date_iso])} cells)")
        return _sst_cache[date_iso]

    url = _build_url(date_iso)
    print(f"[noaa] Fetching SST from: {url}")

    t0 = time.time()
    try:
        response = requests.get(url, timeout=60)
        response.raise_for_status()
    except requests.RequestException as e:
        raise RuntimeError(f"ERDDAP request failed: {e}")

    elapsed = time.time() - t0
    print(f"[noaa] Downloaded in {elapsed:.1f}s")

    # ERDDAP CSV has 2 header rows — skip the units row
    df = pd.read_csv(StringIO(response.text), skiprows=[1])
    df.columns = df.columns.str.strip().str.lower()
    df = df[["latitude", "longitude", VARIABLE]].copy()
    df.rename(columns={VARIABLE: "sst"}, inplace=True)
    df = df.dropna(subset=["sst"])

    if df.empty:
        raise RuntimeError(
            f"No valid SST data returned for {date_str} — all values were NaN."
        )

    print(f"[noaa] Retrieved {len(df)} valid SST grid cells (date: {date_iso})")

    # Store in cache
    _sst_cache[date_iso] = df
    return df


# ── Quick test ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    df = fetch_sst("2026-02-01")
    print(df.describe())
    print(df.head(10))

    # Test cache hit
    print("\nTesting cache...")
    t0 = time.time()
    df2 = fetch_sst("2026-02-01")
    print(f"Cache returned in {time.time() - t0:.4f}s")