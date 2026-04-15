from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import risk
from app.schemas import HealthResponse

app = FastAPI(
    title="ReefRescue API",
    description="Coral bleaching risk prediction for the Great Barrier Reef",
    version="0.1.0",
)

# Allow requests from the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite default port
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(risk.router)

@app.get("/health", response_model=HealthResponse)
def health():
    return {"status": "ok"}