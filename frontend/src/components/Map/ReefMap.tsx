import { useState, useEffect, useRef } from "react";
import { useRiskData } from "../../hooks/useRiskData";
import CoralBoy from "../Mascot/CoralBoy";
import IntroModal from "../Intro/IntroModal";
import GuidedTour from "../GuidedTour/GuidedTour";
import { LayerInfoModal, KeyDatesPanel } from "../UI/UI";

// ─── GBR Configuration ────────────────────────────────────────────────────────
const GBR_BOUNDS = { latMin: -25, latMax: -10, lonMin: 142, lonMax: 154 };
const COASTLINE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson";


// ─── Colour palette ───────────────────────────────────────────────────────────
const C = {
  coral1:       "#ffe7d3",
  coral:      "#fff6d7",
  coralDark:  "#E04B2A",
  teal:       "#97eee6",
  tealLight:  "#a4e0db",
  tealDark:   "#00A89A",
  tealDeep:   "#007A72",
  purple:     "#E04B2A",
  purpleLight:"#FFB2E6",
  yellow:     "#FFD166",
  yellowDark:     "#e2b854",
  pink:       "#FF8FAB",
  lightPink:  "#FFB2E6",
  sand:       "#FFD6AF",
  sandLight:  "#ffefdf",
  bg:         "#F0F9FF",
  bgGrad1:    "#E8F4FD",
  bgGrad2:    "#FFF0F5",
  sidebar:    "#FFFFFF",
  brown:      "#1A2E3B",
  brownMid:   "#4A6572",
  brownLight: "#8BA3AF",
  border:     "#dfa680",
  white:      "#FFFFFF",
  green:      "#06D6A0",
  amber:      "#FFB703",
  red:        "#EF233C",
};

// ─── Risk helpers ─────────────────────────────────────────────────────────────
function riskLabel(value: number) {
  if (value < 0.3)  return { label: "Low Risk",      color: "#06D6A0", text: "#fff" };
  if (value < 0.55) return { label: "Moderate Risk", color: "#FFB703", text: "#fff" };
  if (value < 0.75) return { label: "High Risk",     color: "#FF6B4A", text: "#fff" };
  return               { label: "Critical Risk",     color: "#EF233C", text: "#fff" };
}

function valueToColor(value: number): string {
  if (value < 0.3) {
    // Low Risk — green
    return `rgb(6, 214, 160)`;
  } else if (value < 0.55) {
    // Moderate Risk — yellow to amber
    const t = (value - 0.3) / 0.25;
    return `rgb(255, ${Math.round(183 - t * 50)}, 3)`;
  } else if (value < 0.75) {
    // High Risk — orange
    const t = (value - 0.55) / 0.2;
    return `rgb(255, ${Math.round(133 - t * 80)}, 0)`;
  } else {
    // Critical Risk — red
    return `rgb(239, 35, 60)`;
  }
}

function project(lon: number, lat: number, W: number, H: number) {
  return {
    x: ((lon - GBR_BOUNDS.lonMin) / (GBR_BOUNDS.lonMax - GBR_BOUNDS.lonMin)) * W,
    y: ((GBR_BOUNDS.latMax - lat) / (GBR_BOUNDS.latMax - GBR_BOUNDS.latMin)) * H,
  };
}

function drawCoastline(ctx: CanvasRenderingContext2D, geojson: any, W: number, H: number) {
  ctx.save();
  ctx.fillStyle = "#87ab78";
  ctx.strokeStyle = "#6a9960";
  ctx.lineWidth = 0.8;
  for (const feature of geojson.features ?? []) {
    const geom = feature.geometry;
    if (!geom) continue;
    const polygons =
      geom.type === "Polygon" ? [geom.coordinates] :
      geom.type === "MultiPolygon" ? geom.coordinates : [];
    for (const polygon of polygons) {
      for (const ring of polygon) {
        let inBounds = false;
        let sumX = 0, sumY = 0, count = 0;
        for (const [lon, lat] of ring) {
          if (lon >= GBR_BOUNDS.lonMin - 2 && lon <= GBR_BOUNDS.lonMax + 2 &&
              lat >= GBR_BOUNDS.latMin - 2 && lat <= GBR_BOUNDS.latMax + 2) {
            inBounds = true; 
          }
          const { x, y } = project(lon, lat, W, H);
          sumX += x; sumY += y; count++;
        }
        if (!inBounds) continue;

        // Gradient centred on polygon centroid
        const cx = sumX / count;
        const cy = sumY / count;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.4);
        grad.addColorStop(0, "#8db580");   // darker green inland
        grad.addColorStop(0.5, "#3e4f3a"); // mid green

        ctx.beginPath();
        let first = true;
        for (const [lon, lat] of ring) {
          const { x, y } = project(lon, lat, W, H);
          first ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          first = false;
        }
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.stroke();

      }
    }
  }
  ctx.restore();
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ReefMap() {
  const [layer, setLayer]     = useState("combined");
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; lat: string; lon: string;
    value: number; risk: { label: string; color: string; text: string };
  } | null>(null);
  const [panelOpen, setPanelOpen]   = useState(false);
  const [loaded, setLoaded]         = useState(false);
  
  const getDefaultDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().split("T")[0];
  };
  const [date, setDate] = useState(getDefaultDate);


  const [coastlineGeoJSON, setCoastlineGeoJSON] = useState<any>(null);
  const [mascotScore, setMascotScore] = useState<number | null>(null);

  // ─── Welcome Screen ────────────────────────────────────────────────────────

  const [showIntro, setShowIntro]       = useState(true);
  const [showTour, setShowTour]         = useState(false);
  const [layerInfoOpen, setLayerInfoOpen] = useState<string | null>(null);

  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const containerRef  = useRef<HTMLDivElement>(null);

  const { features, loading, error } = useRiskData(date, layer);

  useEffect(() => {
    fetch(COASTLINE_URL).then(r => r.json()).then(setCoastlineGeoJSON)
      .catch(e => console.warn("[coastline]", e));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || loading || !features.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (coastlineGeoJSON) drawCoastline(ctx, coastlineGeoJSON, W, H);
    ctx.globalAlpha = 0.92;
    for (const f of features) {
      const { x, y } = project(f.geometry.coordinates[0], f.geometry.coordinates[1], W, H);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = valueToColor(f.properties.risk_score);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [features, loading, layer, coastlineGeoJSON]);

  useEffect(() => { setTimeout(() => setLoaded(true), 300); }, []);

  const layerMeta: Record<string, { label: string; unit: string; icon: string; description: string; color: string }> = {
    sst:      { label: "Sea Surface Temp",      unit: "°C proxy",   icon: "", color: C.coral,   description: "Stress from elevated ocean temperatures. This is the primary driver of coral bleaching events." },
    uv:       { label: "Sunlight Itensity",          unit: "index proxy", icon: "", color: C.yellowDark,  description: "Sunlight intensity intensifies heat stress on the coral & speeds up bleaching." },
    dhw:      { label: "Accumulated Heat Stress", unit: "DHW",         icon: "", color: C.pink,    description: "Measures how long the reef has been above its temperature limit. The longer it stays hot, the greater the bleaching risk." },
    combined: { label: "Combined Risk",         unit: "ML score",    icon: "", color: C.purple,  description: "A Machine Learning Model combines the 2 main stressors (Sea Temperature & Accumulated heat Stress) to predict the overall bleaching risk based on historical data." },
  };

  const stats = (() => {
    if (!features.length) return { mean: "—", criticalPct: "—" };
    const scores = features.map(f => f.properties.risk_score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const critical = scores.filter(v => v >= 0.75).length;
    return { mean: (mean * 100).toFixed(0), criticalPct: ((critical / scores.length) * 100).toFixed(0) };
  })();

  const layerColor = layerMeta[layer].color;

  return (
    <div style={{
      fontFamily: "'Nunito', sans-serif",
      background: C.sidebar,
      height: "100vh",
      color: C.brown,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .fade-in { opacity: 0; transform: translateY(8px); animation: fadeUp 0.5s ease forwards; }
        @keyframes fadeUp { to { opacity: 1; transform: translateY(0); } }

        .layer-btn {
          border: 2px solid ${C.border};
          background: ${C.white};
          color: ${C.brownMid};
          padding: 11px 16px;
          border-radius: 14px;
          cursor: pointer;
          font-family: inherit;
          font-size: 13px;
          font-weight: 700;
          transition: all 0.2s cubic-bezier(.34,1.56,.64,1);
          text-align: left;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .layer-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.1);
          border-color: ${C.teal};
          color: ${C.tealDeep};
        }
        .layer-btn.active-sst       { background: linear-gradient(135deg,#FF8C61,#FFB085); border-color: #FF8C61; color: #fff; box-shadow: 0 4px 16px rgba(255,140,97,0.4); }
        .layer-btn.active-uv        { background: linear-gradient(135deg,#FFB703,#FFD166); border-color: #FFB703; color: #fff; box-shadow: 0 4px 16px rgba(255,183,3,0.4); }
        .layer-btn.active-dhw       { background: linear-gradient(135deg,#FF8FAB,#FFB2E6); border-color: #FF8FAB; color: #fff; box-shadow: 0 4px 16px rgba(255,143,171,0.4); }
        .layer-btn.active-combined  { background: linear-gradient(135deg,#FF6B4A,#FF9068); border-color: #FF6B4A; color: #fff; box-shadow: 0 4px 16px rgba(255,107,74,0.4); }
        .stat-card {
          background: ${C.white};
          border: 2px solid ${C.border};
          border-radius: 16px;
          padding: 14px 16px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.06);
          transition: transform 0.2s;
        }
        .stat-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.1); }

        .tooltip-box {
          position: fixed;
          background: ${C.white};
          border: 2px solid ${C.border};
          border-radius: 16px;
          padding: 14px 18px;
          pointer-events: none;
          z-index: 100;
          min-width: 180px;
          box-shadow: 0 12px 40px rgba(0,0,0,0.15);
        }

        .explanation-panel { overflow: hidden; transition: max-height 0.4s ease, opacity 0.4s ease; }
        .explanation-panel.open  { max-height: 600px; opacity: 1; }
        .explanation-panel.closed { max-height: 0; opacity: 0; }

        .pipeline-step {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 12px 14px;
          background: ${C.white};
          border-radius: 12px;
          border-left: 4px solid ${C.teal};
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .legend-swatch { width: 18px; height: 18px; border-radius: 8px; flex-shrink: 0; }
        .section-label { font-size: 10px; font-weight: 900; letter-spacing: 0.14em; text-transform: uppercase; color: ${C.brownLight}; margin-bottom: 10px; }

        .pill-badge {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 4px 12px; border-radius: 20px;
          font-size: 11px; font-weight: 800;
          letter-spacing: 0.04em;          
        }
        aside::-webkit-scrollbar { width: 4px; }
        aside::-webkit-scrollbar-track { background: transparent; }
        aside::-webkit-scrollbar-thumb { background: #dfa680; border-radius: 2px; }
      `}</style>

      {/* ── Header ──────────────────── */}
      <header style={{
        padding: "12px 28px",
        borderBottom: `2px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: C.sand,
        backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 50,
        boxShadow: "0 2px 20px rgba(0,0,0,0.07)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 14,
            background: `linear-gradient(135deg, ${C.teal}, ${C.tealDeep})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, boxShadow: `0 4px 14px rgba(0,201,184,0.45)`,
          }}>🐠</div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: C.brown, lineHeight: 1 }}>
              Reef<span style={{ color: C.coral }}>Rescue</span>
            </div>
            <div style={{ fontSize: 10, color: C.brownLight, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 800 }}>
              Coral Bleaching Risk Platform
            </div>
          </div>

          {/* Tour + Cache warm buttons */}
          <button
            onClick={() => setShowTour(true)}
            style={{
              background: C.tealDeep,
              border: "none",
              borderRadius: 12,
              padding: "6px 14px",
              fontSize: 14,
              fontWeight: 800,
              color: C.white,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Take a Tour
          </button>

          <button
            onClick={async () => {
              const dates = ["2016-02-01", "2016-04-01", "2023-03-01", "2025-07-01", "2026-02-01"];
              const layers = ["combined", "sst", "uv", "dhw"];
              for (const d of dates) {
                for (const l of layers) {
                  await fetch(`${import.meta.env.VITE_API_URL}/risk?date=${d}&layer=${l}`);
                  console.log(`Warmed: ${d} / ${l}`);
                }
              }
              alert("Cache warmed!");
            }}
            style={{
              background: C.tealDeep,
              border: "none",
              borderRadius: 12,
              padding: "6px 14px",
              fontSize: 11,
              fontWeight: 800,
              color: C.white,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            🔥 Warm Cache
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ background: C.white, border: `2px solid ${C.border}`, borderRadius: 12, padding: "6px 14px", fontSize: 12 }}>
            <span style={{ color: C.brownLight, fontWeight: 700 }}>Region </span>
            <span style={{ color: C.tealDark, fontWeight: 900 }}>Great Barrier Reef</span>
          </div>
          <div id="date-picker" style={{ background: C.white, border: `2px solid ${C.border}`, borderRadius: 12, padding: "4px 12px", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: C.brownLight, fontWeight: 700, fontSize: 12 }}>Date</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{ background: "transparent", border: "none", color: C.brown, fontSize: 12, fontFamily: "inherit", fontWeight: 800, outline: "none" }} />
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            background: loading ? "#FFF8E6" : "#E8FDF5",
            border: `2px solid ${loading ? "#FFD166" : "#06D6A0"}`,
            borderRadius: 12, padding: "6px 14px",
          }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: loading ? C.amber : C.green, boxShadow: `0 0 8px ${loading ? C.amber : C.green}` }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: loading ? "#B7820A" : "#047857" }}>
              {loading ? "Fetching…" : "Live Data"}
            </span>
          </div>
        </div>
      </header>

      

      <div style={{ flex: 1, display: "flex", minHeight: 0}}>

        {/* ──── Sidebar ──────────────────── */}
        <aside style={{
          width: 276, padding: "20px 16px",
          display: "flex", flexDirection: "column", gap: 20,
          background: C.sandLight,
          backdropFilter: "blur(10px)",
          borderRight: `2px solid ${C.border}`,
          flexShrink: 0,
          overflowY: "auto",
          overflowX: "hidden",
        }}>

          {/* Layer buttons */}
          <div id="layer-buttons" className={loaded ? "fade-in" : ""} style={{ animationDelay: "0.05s" }}>
            <div className="section-label">Bleaching Stressors</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(["sst","uv", "dhw", "combined"] as const).map(l => (
                <button
                  key={l}
                  className={`layer-btn ${layer === l ? `active-${l}` : ""}`}
                  onClick={() => setLayer(l)}
                >
                  <span style={{ flex: 1 }}>
                    {l === "sst" ? "Sea Temperature" : l === "uv" ? "Sunlight Intensity" : l === "dhw" ? "Accumulated Heat Stress" : "Combined Model"}
                  </span>
                  <span
                    onClick={e => { e.stopPropagation(); setLayerInfoOpen(l); }}
                    style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.7)", background: "rgba(0,0,0,0.15)", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
                  >
                    ?
                  </span>
                </button>
              ))}
            </div>
          </div>
          
          {/* ----------------- Active layer ----------------------------- */}
          <div className={loaded ? "fade-in" : ""} style={{ animationDelay: "0.1s" }}>
            <div style={{fontSize: 16}}className="section-label">Active Layer</div>
            <div style={{
              background: `linear-gradient(135deg, ${layerColor}15, ${layerColor}08)`,
              border: `2px solid ${layerColor}40`,
              borderRadius: 16, padding: 14,
            }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: layerColor, marginBottom: 6 }}>
                {layerMeta[layer].icon} {layerMeta[layer].label}
              </div>
              <div style={{ fontSize: 12, color: C.brownMid, lineHeight: 1.7 }}>{layerMeta[layer].description}</div>
              <div style={{ marginTop: 8 }}>
                <span className="pill-badge" style={{ background: `${layerColor}20`, color: layerColor }}>
                  {layerMeta[layer].unit}
                </span>
              </div>
            </div>
          </div>


          {/* ----------------- Key Dates ----------------------------- */}
          <div id="key-dates">
            <KeyDatesPanel
              onSelectDate={setDate}
              currentDate={date}
            />
          </div>
          

          

          {/* Stats */}
          <div className={loaded ? "fade-in" : ""} style={{ animationDelay: "0.15s" }}>
            {/* <div className="section-label">Current Summary</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}> */}
              {/* <div className="stat-card">
                <div style={{ fontSize: 11, color: C.brownLight, fontWeight: 800, marginBottom: 4 }}>Average Reef Health</div>
                <div style={{ fontSize: 30, fontWeight: 900, color: C.brown, lineHeight: 1 }}>
                  {stats.mean}
                  <span style={{ fontSize: 14, color: C.brownLight, fontWeight: 600 }}>/100</span>
                </div>
              </div> */}
              {/* <div className="stat-card" style={{ borderColor: `${C.red}30` }}>
                <div style={{ fontSize: 11, color: C.brownLight, fontWeight: 800, marginBottom: 4 }}>Reefs in Danger</div>
                <div style={{ fontSize: 30, fontWeight: 900, color: C.red, lineHeight: 1 }}>
                  {stats.criticalPct}
                  <span style={{ fontSize: 14, color: C.brownLight, fontWeight: 600 }}>% of reefs are in danger</span>
                </div>
              </div> */}
            {/* </div> */}
          </div>

    

          {/* <div style={{ marginTop: "auto" }}>
            <button id="how-it-works"
              onClick={() => setPanelOpen(!panelOpen)}
              style={{
                width: "100%", border: "none", cursor: "pointer",
                background: `linear-gradient(135deg, ${C.teal}, ${C.tealDeep})`,
                color: C.white, padding: "12px 18px", borderRadius: 14,
                fontFamily: "inherit", fontSize: 13, fontWeight: 800,
                boxShadow: `0 4px 16px rgba(0,201,184,0.35)`,
                transition: "all 0.2s",
              }}
            >
              {panelOpen ? "▲ Hide explanation" : "🪸 How this works"}
            </button>
          </div> */}
        </aside>


        {/* ── Map ──────────────────── */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", padding: "12px 12px 12px 12px", gap: 14, overflow: "hidden", minHeight: 0 }}>

          <div
            className={loaded ? "fade-in" : ""}
            ref={containerRef}
            style={{
              flex: 1, position: "relative", minHeight:0,
              borderRadius: 20, overflow: "hidden",
              border: `2px solid ${C.border}`,
              background: "#061828",
              boxShadow: "0 8px 40px rgba(0,0,0,0.14)",
              animationDelay: "0.05s",
            }}
        
          >
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 30% 60%, rgba(0,100,180,0.5) 0%, #061828 65%)" }} />

            {/* Lat labels */}
            {[0, 0.25, 0.5, 0.75, 1].map(t => (
              <div key={t} style={{ position: "absolute", left: 8, top: `${t * 100}%`, fontSize: 9, color: "rgba(255,255,255,0.25)", transform: "translateY(-50%)", fontWeight: 800 }}>
                {(GBR_BOUNDS.latMax + (GBR_BOUNDS.latMin - GBR_BOUNDS.latMax) * t).toFixed(0)}°S
              </div>
            ))}
            {[0, 0.33, 0.67, 1].map(t => (
              <div key={t} style={{ position: "absolute", bottom: 6, left: `calc(${t * 100}% + 18px)`, fontSize: 9, color: "rgba(255,255,255,0.25)", fontWeight: 800 }}>
                {(GBR_BOUNDS.lonMin + (GBR_BOUNDS.lonMax - GBR_BOUNDS.lonMin) * t).toFixed(0)}°E
              </div>
            ))}

            {/* City labels */}
            {[
              { name: "Cairns",     lat: -16.9, lon: 145.8 },
              { name: "Townsville", lat: -19.3, lon: 146.8 },
              { name: "Mackay",     lat: -21.1, lon: 149.2 },
            ].map(city => {
              const xPct = ((city.lon - GBR_BOUNDS.lonMin) / (GBR_BOUNDS.lonMax - GBR_BOUNDS.lonMin)) * 100;
              const yPct = ((GBR_BOUNDS.latMax - city.lat) / (GBR_BOUNDS.latMax - GBR_BOUNDS.latMin)) * 100;
              return (
                <div key={city.name} style={{ position: "absolute", left: `${xPct}%`, top: `${yPct}%`, transform: "translate(-50%,-50%)", pointerEvents: "none", zIndex: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.7)", margin: "0 auto", boxShadow: "0 0 6px rgba(255,255,255,0.5)" }} />
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.65)", whiteSpace: "nowrap", marginTop: 3, textShadow: "0 1px 4px #000", fontWeight: 800 }}>{city.name}</div>
                </div>
              );
            })}

            {/* Loading */}
            {loading && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
                <div style={{
                  background: "rgba(255,255,255,0.95)", borderRadius: 18, padding: "16px 28px",
                  fontSize: 14, fontWeight: 900, color: C.tealDeep,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
                  display: "flex", alignItems: "center", gap: 12,
                  border: `2px solid ${C.teal}`,
                }}>
                  <span style={{ fontSize: 22 }}>⏳</span> Loading real data…
                </div>
              </div>
            )}
            {error && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
                <div style={{ background: "rgba(255,255,255,0.95)", borderRadius: 18, padding: "16px 28px", fontSize: 13, fontWeight: 800, color: C.red, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", border: `2px solid ${C.red}` }}>⚠️ {error}</div>
              </div>
            )}

            {/* Canvas */}
            <canvas id="map-canvas"
              ref={canvasRef} width={1200} height={900}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", cursor: "crosshair" }}
              onMouseMove={e => {
                const canvas = canvasRef.current;
                if (!canvas || !features.length) return;
                const rect = canvas.getBoundingClientRect();
                const mx = ((e.clientX - rect.left) / rect.width) * (GBR_BOUNDS.lonMax - GBR_BOUNDS.lonMin) + GBR_BOUNDS.lonMin;
                const my = GBR_BOUNDS.latMax - ((e.clientY - rect.top) / rect.height) * (GBR_BOUNDS.latMax - GBR_BOUNDS.latMin);
                let nearest = features[0], minDist = Infinity;
                for (const f of features) {
                  const dx = f.geometry.coordinates[0] - mx;
                  const dy = f.geometry.coordinates[1] - my;
                  const d = dx * dx + dy * dy;
                  if (d < minDist) { minDist = d; nearest = f; }
                }
                if (Math.sqrt(minDist) < 0.3) {
                  setMascotScore(nearest.properties.risk_score); 
                  setTooltip({ x: e.clientX, y: e.clientY, lat: Math.abs(nearest.geometry.coordinates[1]).toFixed(2), lon: nearest.geometry.coordinates[0].toFixed(2), value: nearest.properties.risk_score, risk: riskLabel(nearest.properties.risk_score) });
                } else {
                    setMascotScore(null);
                    setTooltip(null); 
                }
              }}
              onMouseLeave={() => {
                setTooltip(null);
                setMascotScore(null);
              }}
            />

            {/* Map title */}
            <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", fontSize: 11, fontWeight: 900, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", pointerEvents: "none" }}>
              Great Barrier Reef — {layerMeta[layer].label}
            </div>

            {/* Layer badge */}
            <div style={{
              position: "absolute", top: 12, right: 12,
              background: layerColor, borderRadius: 10,
              padding: "5px 14px", fontSize: 11, fontWeight: 900,
              color: "#fff", boxShadow: `0 3px 12px ${layerColor}60`,
              letterSpacing: "0.04em",
            }}>
              {layerMeta[layer].icon} {layer.toUpperCase()}
            </div>

            {/* Scale */}
            <div style={{ position: "absolute", bottom: 16, right: 16, fontSize: 10, color: "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
              <div style={{ width: 40, height: 2, background: "rgba(255,255,255,0.25)", borderRadius: 1 }} />~100 km
            </div>

            {/* Watermark */}
            <div style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", fontSize: 9, color: "rgba(255,255,255,0.18)", fontWeight: 700, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
              DATA: NOAA ERDDAP · NASA POWER · Natural Earth · Prototype Only
            </div>

            {/* Mascot + Legend */}
            <div style={{
              position: "absolute",
              bottom: 20,
              left: 20,
              zIndex: 20,
              display: "flex",
              flexDirection: "row",
              alignItems: "flex-end",
              gap: 12,
            }}>

              {/* Mascot */}
              <CoralBoy
                riskScore={mascotScore}
                meanRisk={features.length ? features.reduce((a,b) => a + b.properties.risk_score, 0) / features.length : 0}
              />


              {/* Mini Legend */}
              <div style={{
                background: "rgba(255,255,255,0.92)",
                borderRadius: 14,
                padding: "10px 14px",
                border: `2px solid rgba(255,255,255,0.3)`,
                boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                backdropFilter: "blur(8px)",
              }}>
                {[
                  { label: "Critical Risk", color: "#EF233C" },
                  { label: "High Risk",     color: "#FF6B4A" },
                  { label: "Moderate Risk", color: "#FFB703" },
                  { label: "Low Risk",      color: "#06D6A0" },
                ].map(item => (
                  <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#1A2E3B", whiteSpace: "nowrap" }}>{item.label}</span>
                  </div>
                ))}
              </div>
              
              {/* % Reefs in danger */}
              <div className="stat-card" style={{ borderColor: `${C.red}30` }}>
                <div style={{ fontSize: 16, color: C.brownLight, fontWeight: 800, marginBottom: 4 }}>Reefs in Danger</div>
                <div style={{ fontSize: 30, fontWeight: 900, color: C.red, lineHeight: 1 }}>
                  {stats.criticalPct}%
                  <span style={{ fontSize: 14, color: C.brownLight, fontWeight: 600 }}> of reefs in danger</span>
                </div>
              </div>
            </div>
          </div>

          

          {/* Explanation panel */}
          <div className={`explanation-panel ${panelOpen ? "open" : "closed"}`}>
            <div style={{ background: C.white, border: `2px solid ${C.border}`, borderRadius: 20, padding: 24, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: C.coral, marginBottom: 18 }}>
                🪸 How ReefRescue Works
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                {[
                  { icon: "📡", title: "Data Ingestion",      desc: "Real SST from NOAA ERDDAP (8-day composite) & shortwave radiation from NASA POWER regional API" },
                  { icon: "🔧", title: "Feature Engineering",  desc: "Raw measurements are spatially aligned via nearest-neighbour matching and normalised" },
                  { icon: "🧠", title: "ML Prediction",        desc: "Random Forest classifier (scikit-learn) predicts bleaching risk probability per grid cell" },
                  { icon: "🗺️", title: "Visualisation",        desc: "Risk scores mapped to a colour-coded canvas heatmap with Natural Earth coastline overlay" },
                  { icon: "👁️", title: "User Interpretation",  desc: "Explore toggleable layers and hover for site-specific SST, UV, and risk values" },
                ].map((step, i) => (
                  <div key={i}>
                    {i > 0 && <div style={{ color: C.border, fontSize: 18, textAlign: "center", padding: "2px 0" }}>↓</div>}
                    <div className="pipeline-step">
                      <span style={{ fontSize: 20 }}>{step.icon}</span>
                      <div>
                        <div style={{ fontWeight: 900, fontSize: 13, color: C.brown }}>{step.title}</div>
                        <div style={{ fontSize: 12, color: C.brownMid, marginTop: 2, lineHeight: 1.6 }}>{step.desc}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {[
                  { icon: "⚠️", text: "Research prototype only. Risk scores are indicative, not operational." },
                  { icon: "🔬", text: "Interpretability over accuracy — designed for public understanding." },
                  { icon: "📊", text: "Labels based on SST and radiation thresholds from published literature." },
                ].map((note, i) => (
                  <div key={i} style={{ flex: 1, background: C.bgGrad1, border: `2px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", fontSize: 11, color: C.brownMid, lineHeight: 1.6, fontWeight: 600 }}>
                    <span style={{ marginRight: 6 }}>{note.icon}</span>{note.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
      {showIntro && (
        <IntroModal
          onStartTour={() => { setShowIntro(false); setShowTour(true); }}
          onSkip={() => setShowIntro(false)}
        />
      )}
      {showTour && <GuidedTour onEnd={() => setShowTour(false)} />}
      {layerInfoOpen && (
        <LayerInfoModal
          layer={layerInfoOpen as any}
          onClose={() => setLayerInfoOpen(null)}
        />
      )}

      {/* ── Tooltip ── */}
      {tooltip && (
        <div className="tooltip-box" style={{ left: tooltip.x + 16, top: tooltip.y - 10 }}>
          <div style={{ fontSize: 10, color: C.brownLight, marginBottom: 8, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 900 }}>Grid Point</div>
          <div style={{ fontSize: 12, color: C.brownMid, fontWeight: 700 }}>📍 {tooltip.lat}°S, {tooltip.lon}°E</div>
          <div style={{ marginTop: 10 }}>
            <span style={{ background: tooltip.risk.color, color: "#fff", padding: "5px 12px", borderRadius: 10, fontSize: 12, fontWeight: 900, boxShadow: `0 2px 8px ${tooltip.risk.color}60` }}>
              {tooltip.risk.label}
            </span>
          </div>
          <div style={{ marginTop: 10, fontSize: 20, fontWeight: 900, color: C.brown, lineHeight: 1 }}>
            {(tooltip.value * 100).toFixed(0)}
            <span style={{ fontSize: 12, color: C.brownLight, fontWeight: 600 }}>/100</span>
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: C.brownLight, fontWeight: 700 }}>
            {layerMeta[layer].icon} {layerMeta[layer].label}
          </div>
        </div>
      )}
    </div>
  );
}