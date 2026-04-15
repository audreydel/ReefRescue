// ─── Layer Info Modal ─────────────────────────────────────────────────────────

interface LayerInfoModalProps {
  layer: "sst" | "uv" | "dhw" | "combined";
  onClose: () => void;
}

const LAYER_INFO = {
  sst: {
    icon: "🌡️",
    title: "Sea Temperature",
    color: "#FF8C61",
    what: "Sea temperature measures how warm the top layer of the ocean is.",
    why: "Coral reefs have a temperature limit. When ocean water stays more than 1°C above the reef's long-term average for even a few weeks, corals begin to bleach. The warmer the water and the longer it stays warm, the worse the damage.",
    source: "Data comes from NOAA ERDDAP's 8-day composite product, which combines multiple satellite passes to fill gaps left by cloud cover with no API key required",
    colours: "Green = cool, safe temperatures. Red = dangerously warm water above the bleaching threshold.",
  },
  uv: {
    icon: "☀️",
    title: "Sunlight Intensity",
    color: "#FFB703",
    what: "The total amount of solar energy reaching the ocean surface each day, measured in kWh/m²/day.",
    why: "High sunlight intensity makes bleaching worse. When corals are already stressed by heat, strong sunlight damages the algae inside them even faster.",
    source: "Data comes from NASA POWER, which provides daily solar radiation estimates globally with no API key required.",
    colours: "Green = low sunlight intensity. Red = high solar radiation amplifying bleaching risk.",
  },
  dhw: {
    icon: "🔥",
    title: "Accumulated Heat Stress",
    color: "#FF8FAB",
    what: "How much heat stress a reef has accumulated over the past 12 weeks.",
    why: "A reef that has been 2°C above its limit for 4 weeks has experienced far more damage than one that briefly hit that temperature yesterday.",
    source: "Data comes from NOAA Coral Reef Watch, the satellite monitoring system that reef managers worldwide rely on.",
    colours: "Green = little accumulated stress. Red = severe heat stress built up over weeks, mass bleaching highly likely.",
  },
  combined: {
    icon: "🧠",
    title: "Combined Risk Model",
    color: "#FF6B4A",
    what: "The Combined layer uses a machine learning model (a Random Forest classifier) to combine sea temperature and accumulated heat stress into a single overall bleaching risk score.",
    why: "No single factor tells the full story. The model was trained on real NOAA Coral Reef Watch satellite data from four documented mass bleaching events on the Great Barrier Reef (2016, 2017, 2020, 2022), learning the relationship between environmental conditions and actual bleaching alert levels.",
    source: "The model achieves 72% accuracy across four risk levels. Sunlight intensity is also factored in through the heat stress calculation, amplifying risk when solar radiation is high.",
    colours: "Green = low predicted bleaching risk. Red = critical risk — conditions match those seen during mass bleaching events.",
  },
};

export function LayerInfoModal({ layer, onClose }: LayerInfoModalProps) {
  const info = LAYER_INFO[layer];

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(10,20,40,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 24,
          padding: "32px 36px",
          maxWidth: 480,
          width: "90%",
          fontFamily: "'Nunito', sans-serif",
          boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
          border: `2px solid ${info.color}40`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14,
              background: `${info.color}20`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22,
            }}>
              {info.icon}
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#1A2E3B" }}>{info.title}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#8BA3AF" }}
          >
            ✕
          </button>
        </div>

        {/* Sections */}
        {[
          { label: "What is it?", text: info.what },
          { label: "Why does it cause bleaching?", text: info.why },
          { label: "Where does the data come from?", text: info.source },
          { label: "What do the colours mean?", text: info.colours },
        ].map((section, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: info.color, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
              {section.label}
            </div>
            <div style={{ fontSize: 13, color: "#4A6572", lineHeight: 1.7 }}>
              {section.text}
            </div>
          </div>
        ))}

        <button
          onClick={onClose}
          style={{
            width: "100%", marginTop: 8,
            background: `linear-gradient(135deg, ${info.color}, ${info.color}cc)`,
            border: "none", color: "#fff",
            padding: "12px", borderRadius: 14, fontSize: 14,
            fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Got it!
        </button>
      </div>
    </div>
  );
}


// ─── Key Dates Panel ──────────────────────────────────────────────────────────

interface KeyDatesPanelProps {
  onSelectDate: (date: string) => void;
  currentDate: string;
}

const KEY_DATES = [    
     { date: "2016-02-01", label: "Feb 2016: Before Bleaching Event", desc: "Weeks before the worst bleaching event on record begins", color: "#FFB703" },
  { date: "2016-04-01", label: "Apr 2016: Peak Bleaching",      desc: "Height of the worst mass bleaching event ever recorded on the Great Barrier Reef", color: "#EF233C" },
    
    { date: "2025-07-01", label: "Jul 2025: Australian Winter",         desc: "Coldest month. Reef at its healthiest", color: "#06D6A0" },
    { date: "2026-02-01", label: "Feb 2026: Australian Summer",    desc: "Hottest month. Reef most at risk to bleaching", color: "#EF233C" },

    { date: "2026-03-01", label: "Mar 2026: Current",           desc: "Most recent available data", color: "#FF6B4A" },
];


export function KeyDatesPanel({ onSelectDate, currentDate }: KeyDatesPanelProps) {
  return (
    <div>
      <div style={{
        fontSize: 16, fontWeight: 900, letterSpacing: "0.14em",
        textTransform: "uppercase", color: "#8BA3AF", marginBottom: 10,
      }}>
        Key Dates
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {KEY_DATES.map(({ date, label, desc, color }) => {
          const isActive = currentDate === date;
          return (
            <button
              key={date}
              onClick={() => onSelectDate(date)}
              style={{
                background: isActive ? `${color}15` : "#fff",
                border: `2px solid ${isActive ? color : "#dfa680"}`,
                borderRadius: 12,
                padding: "9px 12px",
                cursor: "pointer",
                fontFamily: "'Nunito', sans-serif",
                textAlign: "left",
                transition: "all 0.2s",
                boxShadow: isActive ? `0 2px 12px ${color}30` : "0 1px 4px rgba(0,0,0,0.05)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <div style={{ fontSize: 13, fontWeight: 900, color: isActive ? color : "#1A2E3B" }}>
                  {label}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#8BA3AF", fontWeight: 600, paddingLeft: 16, lineHeight: 1.4 }}>
                {desc}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}