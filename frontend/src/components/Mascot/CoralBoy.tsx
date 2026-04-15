import { useEffect, useState } from "react";

type RiskState = "low" | "moderate" | "high" | "critical";

interface CoralBoyProps {
  riskScore: number | null; // 0–1, null = no hover (use mean)
  meanRisk: number;         // 0–1, fallback when not hovering
}

function getRiskState(score: number): RiskState {
  if (score < 0.3)  return "low";
  if (score < 0.55) return "moderate";
  if (score < 0.75) return "high";
  return "critical";
}

const STATE_CONFIG: Record<RiskState, {
  label: string;
  color: string;
  bg: string;
  border: string;
  message: string;
  image: string;
}> = {
  low: {
    label: "Healthy Reef! 🎉",
    color: "#06D6A0",
    bg: "#E8FDF5",
    border: "#06D6A0",
    message: "The reef is thriving!",
    image: "/mascot/low.png",
  },
  moderate: {
    label: "Stay Alert 👀",
    color: "#FFB703",
    bg: "#FFFBEB",
    border: "#FFB703",
    message: "Stress is building up",
    image: "/mascot/moderate.png",
  },
  high: {
    label: "High Stress ⚠️",
    color: "#FF6B4A",
    bg: "#FFF3F0",
    border: "#FF6B4A",
    message: "Coral under pressure!",
    image: "/mascot/high.png",
  },
  critical: {
    label: "Bleaching Risk! 🚨",
    color: "#EF233C",
    bg: "#FFF0F2",
    border: "#EF233C",
    message: "Critical — reef in danger!",
    image: "/mascot/critical.png",
  },
};

export default function CoralBoy({ riskScore, meanRisk }: CoralBoyProps) {
  const activeScore = riskScore ?? meanRisk;
  const state = getRiskState(activeScore);
  const config = STATE_CONFIG[state];

  const [displayState, setDisplayState] = useState<RiskState>(state);
  const [fading, setFading] = useState(false);

  // Crossfade when state changes
  useEffect(() => {
    if (state !== displayState) {
      setFading(true);
      const t = setTimeout(() => {
        setDisplayState(state);
        setFading(false);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [state, displayState]);

  const displayConfig = STATE_CONFIG[displayState];

  return (
    <div style={{
      position: "relative",
      zIndex: 20,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 0,
      filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.22))",
    }}>

      {/* Speech bubble */}
      <div style={{
        background: "rgba(255,255,255,0.97)",
        border: `2.5px solid ${config.border}`,
        borderRadius: 14,
        padding: "8px 14px",
        fontSize: 14,
        fontWeight: 800,
        color: config.color,
        fontFamily: "'Nunito', sans-serif",
        boxShadow: `0 4px 16px ${config.color}30`,
        textAlign: "center",
        maxWidth: 140,
        lineHeight: 1.4,
        marginBottom: 8,
        position: "relative",
        transition: "border-color 0.3s ease, color 0.3s ease, box-shadow 0.3s ease",
      }}>
        <div style={{ fontSize: 15, marginBottom: 2 }}>{config.label}</div>
        <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600 }}>{config.message}</div>

        {/* Bubble tail pointing down */}
        <div style={{
          position: "absolute",
          bottom: -11,
          left: "50%",
          transform: "translateX(-50%)",
          width: 0, height: 0,
          borderLeft: "8px solid transparent",
          borderRight: "8px solid transparent",
          borderTop: `11px solid ${config.border}`,
          transition: "border-top-color 0.3s ease",
        }}/>
        <div style={{
          position: "absolute",
          bottom: -8,
          left: "50%",
          transform: "translateX(-50%)",
          width: 0, height: 0,
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          borderTop: "8px solid rgba(255,255,255,0.97)",
        }}/>
      </div>

      {/* Mascot image */}
      <div style={{
        width: 130,
        height: 130,
        position: "relative",
      }}>
        <img
          src={displayConfig.image}
          alt={`Coral boy — ${displayState} risk`}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            opacity: fading ? 0 : 1,
            transform: fading ? "scale(0.94)" : "scale(1)",
            transition: "opacity 0.2s ease, transform 0.2s ease",
          }}
        />
      </div>

      {/* Risk score pill */}
      <div style={{
        background: config.bg,
        border: `2px solid ${config.border}`,
        borderRadius: 20,
        padding: "3px 14px",
        fontSize: 14,
        fontWeight: 900,
        color: config.color,
        fontFamily: "'Nunito', sans-serif",
        marginTop: 4,
        transition: "all 0.3s ease",
        boxShadow: `0 2px 8px ${config.color}25`,
      }}>
        {(activeScore * 100).toFixed(0)}<span style={{ fontSize: 10, fontWeight: 600, opacity: 0.7 }}>/100</span>
      </div>
    </div>
  );
}