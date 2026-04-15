from fastapi import APIRouter, HTTPException, Query
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
from app.services.noaa import fetch_sst
from app.services.uv import fetch_uv
from app.services.dhw import fetch_dhw
from app.services.predictor import predict
from app.services.db_cache import get_cached, set_cached, init_db
from app.schemas import RiskResponse

router = APIRouter()

init_db()


@router.get("/risk", response_model=RiskResponse)
def get_risk(
    date: str = Query(default="2026-02-01"),
    layer: str = Query(default="combined"),
):
    if layer not in ("sst", "uv", "dhw", "combined"):
        raise HTTPException(status_code=400, detail="layer must be sst, uv, dhw, or combined")

    try:
        # Check SQLite cache first — instant for pre-loaded dates
        cached = get_cached(date, layer)
        if cached:
            return cached

        # Determine which sources are needed for this layer
        need_uv  = layer in ("uv", "combined")
        need_dhw = layer in ("sst", "dhw", "combined")

        # Fetch all needed sources in parallel
        fetch_tasks = {"sst": fetch_sst}
        if need_uv:  fetch_tasks["uv"]  = fetch_uv
        if need_dhw: fetch_tasks["dhw"] = fetch_dhw

        results = {}
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = {
                executor.submit(fn, date): name
                for name, fn in fetch_tasks.items()
            }
            for future in as_completed(futures):
                name = futures[future]
                results[name] = future.result()

        sst_df  = results["sst"]
        uv_df   = results.get("uv",  pd.DataFrame(columns=["latitude", "longitude", "uv_index"]))
        dhw_df  = results.get("dhw", pd.DataFrame(columns=["latitude", "longitude", "dhw"]))

        geojson = predict(sst_df, uv_df, dhw_df, layer=layer)
        set_cached(date, layer, geojson)
        return geojson

    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))