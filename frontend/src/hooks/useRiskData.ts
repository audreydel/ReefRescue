import { useState, useEffect, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export type RiskFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    sst: number;
    uv_index: number;
    dhw: number;
    risk_score: number;
    risk_label: string;
  };
};

type RiskData = {
  features: RiskFeature[];
  loading: boolean;
  error: string | null;
};

export function useRiskData(date: string, layer: string): RiskData {
  const [features, setFeatures] = useState<RiskFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track the current request key — if date/layer changes while a fetch
  // is in flight, we ignore the stale response instead of aborting it
  const requestKeyRef = useRef("");

  useEffect(() => {
    const key = `${date}__${layer}`;
    requestKeyRef.current = key;
    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/risk?date=${date}&layer=${layer}`)
      .then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        // Only update state if this is still the latest request
        if (requestKeyRef.current === key) {
          setFeatures(data.features ?? []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (requestKeyRef.current === key) {
          setError(err.message);
          setLoading(false);
        }
      });
  }, [date, layer]);

  return { features, loading, error };
}