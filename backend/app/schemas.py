from pydantic import BaseModel
from typing import Any

class HealthResponse(BaseModel):
    status: str

class RiskResponse(BaseModel):
    type: str
    features: list[dict[str, Any]]