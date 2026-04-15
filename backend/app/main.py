from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import risk
from app.schemas import HealthResponse
import os
import requests

CACHE_PATH = os.path.join(os.path.dirname(__file__), "..", "risk_cache.db")
GDRIVE_FILE_ID = "1R8GCfPzPotHiPcgdagphOe1Mi33j5GfX"

def download_cache():
    if not os.path.exists(CACHE_PATH):
        print("Downloading risk_cache.db from Google Drive...")
        url = f"https://drive.google.com/uc?export=download&id={GDRIVE_FILE_ID}"
        session = requests.Session()
        response = session.get(url, stream=True)
        
        # Handle Google's virus scan warning for large files
        token = None
        for key, value in response.cookies.items():
            if key.startswith("download_warning"):
                token = value
        if token:
            response = session.get(url, params={"confirm": token}, stream=True)
        
        with open(CACHE_PATH, "wb") as f:
            for chunk in response.iter_content(chunk_size=32768):
                if chunk:
                    f.write(chunk)
        print("Download complete.")

download_cache()

app = FastAPI(
    title="ReefRescue API",
    description="Coral bleaching risk prediction for the Great Barrier Reef",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://reefrescue.netlify.app/"],  # update this after Netlify deploy
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(risk.router)

@app.get("/health", response_model=HealthResponse)
def health():
    return {"status": "ok"}