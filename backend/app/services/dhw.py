import requests
import pandas as pd
import time
from datetime import datetime, timedelta
from io import StringIO

# ── Constants ──────────────────────────────────────────────────────────────────
ERDDAP_BASE = "https://coastwatch.pfeg.noaa.gov/erddap/griddap"
DATASET_ID  = "NOAA_DHW"
VARIABLE    = "CRW_DHW"

LAT_MIN, LAT_MAX = -25.0, -10.0
LON_MIN, LON_MAX = 142.0, 154.0
STRIDE      = 3
MAX_RETRIES = 6

# ── In-memory cache ────────────────────────────────────────────────────────────
_dhw_cache: dict[str, pd.DataFrame] = {}


def _nearest_valid_date(date_str: str) -> str:
    """Walk back in 1-day steps to find the nearest available DHW date."""
    date = datetime.strptime(date_str, "%Y-%m-%d")
    for i in range(MAX_RETRIES):
        candidate = date - timedelta(days=i)
        candidate_str = candidate.strftime("%Y-%m-%dT12:00:00Z")
        url = _build_url(candidate_str)
        try:
            r = requests.head(url, timeout=30, allow_redirects=True)
            if r.status_code in(200, 301, 302, 303, 307, 308):
                return candidate_str
        except requests.RequestException:
            continue
    return date.strftime("%Y-%m-%dT12:00:00Z")


def _build_url(date_iso: str) -> str:
    return (
        f"{ERDDAP_BASE}/{DATASET_ID}.csv"
        f"?{VARIABLE}"
        f"[({date_iso})]"
        f"[({LAT_MIN}):{STRIDE}:({LAT_MAX})]"
        f"[({LON_MIN}):{STRIDE}:({LON_MAX})]"
    )


def fetch_dhw(date_str: str) -> pd.DataFrame:
    """
    Fetch real Degree Heating Week (DHW) data from NOAA Coral Reef Watch
    ERDDAP for the GBR on a given date.

    DHW represents accumulated thermal stress above the local bleaching
    threshold over the preceding 12 weeks. This is the same metric the
    model was trained on, replacing the runtime DHW proxy.

    Results are cached in memory — repeated requests for the same date
    return instantly without hitting ERDDAP again.

    Args:
        date_str: Date in YYYY-MM-DD format

    Returns:
        DataFrame with columns: latitude, longitude, dhw
    """
    date_iso = _nearest_valid_date(date_str)

    if date_iso in _dhw_cache:
        print(f"[dhw] Cache hit for {date_iso} ({len(_dhw_cache[date_iso])} cells)")
        return _dhw_cache[date_iso]

    url = _build_url(date_iso)
    print(f"[dhw] Fetching DHW from: {url}")

    t0 = time.time()
    try:
        r = requests.get(url, timeout=120)
        r.raise_for_status()
    except requests.RequestException as e:
        raise RuntimeError(f"NOAA CRW DHW request failed: {e}")

    elapsed = time.time() - t0
    print(f"[dhw] Downloaded in {elapsed:.1f}s")

    # ERDDAP CSV has 2 header rows — skip the units row
    df = pd.read_csv(StringIO(r.text), skiprows=[1])
    df.columns = df.columns.str.strip().str.lower()

    # CRW_DHW column comes through as crw_dhw after lowercasing
    df = df[["latitude", "longitude", "crw_dhw"]].copy()
    df.rename(columns={"crw_dhw": "dhw"}, inplace=True)
    df = df.dropna(subset=["dhw"])
    df["dhw"] = df["dhw"].clip(lower=0)

    if df.empty:
        raise RuntimeError(
            f"No valid DHW data returned for {date_str} — all values were NaN."
        )

    print(f"[dhw] Retrieved {len(df)} valid DHW grid cells (date: {date_iso})")

    _dhw_cache[date_iso] = df
    return df


# ── Quick test ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    df = fetch_dhw("2026-02-01")
    print(df.describe())
    print(df.head(10))

    print("\nTesting cache...")
    t0 = time.time()
    df2 = fetch_dhw("2026-02-01")
    print(f"Cache returned in {time.time() - t0:.4f}s")