import { useState, useEffect } from "react";

interface TourStep {
  target: string;
  title: string;
  content: string;
}

interface GuidedTourProps {
  onEnd: () => void;
}

const STEPS: TourStep[] = [
    {
    target: "key-dates",
    title: "🗓️ Pick any key bleaching date",
    content: "These are pre-loaded dates covering bleaching risk in the Great Barrier Reef. These are the only dates that will load instantly.",
  },
  {
    target: "date-picker",
    title: "📅 Pick a date",
    content: 
    "Use the date picker to explore the reef on any date. Try different months to see how conditions change! (The map might take up to 2 mins to load)",
  },
  
  {
    target: "layer-buttons",
    title: "🌊 Switch between layers",
    content: "Each button shows a different environmental factor. Try switching between Sea Temperature, Sunlight Intensity, Accumulated Heat Stress, and Combined to see how each one changes the map.",
  },
  {
    target: "map-canvas",
    title: "🗺️ Hover over the map",
    content: "Move your mouse over any coloured dot to see the exact risk score for that location. The mascot in the bottom left will react to show you how serious the risk is!",
  },
  // {
  //   target: "how-it-works",
  //   title: "🪸 Learn more",
  //   content: "Click 'How this works' to see a full breakdown of the data sources and machine learning model behind ReefRescue.",
  // },
];

export default function GuidedTour({ onEnd }: GuidedTourProps) {
  const [step, setStep] = useState(0);
  const [hlBox, setHlBox] = useState<DOMRect | null>(null);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  useEffect(() => {
    const el = document.getElementById(current.target);
    if (el) {
      setHlBox(el.getBoundingClientRect());
    } else {
      setHlBox(null);
    }
  }, [step, current.target]);

  return (
    <>
      {/* Dark overlay with accurate cutout */}
      <div style={{ position: "fixed", inset: 0, zIndex: 900, pointerEvents: "none" }}>
        {hlBox ? (
          <>
            {/* Top */}
            <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: hlBox.top, background: "rgba(10,20,40,0.72)" }} />
            {/* Bottom */}
            <div style={{ position: "fixed", top: hlBox.bottom, left: 0, right: 0, bottom: 0, background: "rgba(10,20,40,0.72)" }} />
            {/* Left */}
            <div style={{ position: "fixed", top: hlBox.top, left: 0, width: hlBox.left, height: hlBox.height, background: "rgba(10,20,40,0.72)" }} />
            {/* Right */}
            <div style={{ position: "fixed", top: hlBox.top, left: hlBox.right, right: 0, height: hlBox.height, background: "rgba(10,20,40,0.72)" }} />
            {/* Highlight ring */}
            <div style={{
              position: "fixed",
              top: hlBox.top - 4, left: hlBox.left - 4,
              width: hlBox.width + 8, height: hlBox.height + 8,
              border: "3px solid #97eee6",
              borderRadius: 16,
              boxShadow: "0 0 0 4px rgba(151,238,230,0.25), 0 0 30px rgba(151,238,230,0.2)",
              pointerEvents: "none",
            }} />
          </>
        ) : (
          <div style={{ position: "fixed", inset: 0, background: "rgba(10,20,40,0.72)" }} />
        )}
      </div>

      {/* Tour card */}
      <div style={{
        position: "fixed",
        bottom: 40, left: "50%", transform: "translateX(-50%)",
        zIndex: 1000,
        background: "#fff",
        borderRadius: 20,
        padding: "24px 28px",
        maxWidth: 420,
        width: "90%",
        fontFamily: "'Nunito', sans-serif",
        boxShadow: "0 16px 60px rgba(0,0,0,0.3)",
        border: "2px solid #97eee6",
      }}>
        {/* Progress dots */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 5 }}>
            {STEPS.map((_, i) => (
              <div key={i} style={{
                width: i === step ? 20 : 6, height: 6, borderRadius: 3,
                background: i === step ? "#00A89A" : i < step ? "#97eee6" : "#ddd",
                transition: "all 0.3s",
              }} />
            ))}
          </div>
          <button
            onClick={onEnd}
            style={{ background: "none", border: "none", color: "#8BA3AF", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}
          >
            End tour ✕
          </button>
        </div>

        <div style={{ fontSize: 18, fontWeight: 900, color: "#1A2E3B", marginBottom: 10 }}>
          {current.title}
        </div>
        <div style={{ fontSize: 13, color: "#4A6572", lineHeight: 1.7, marginBottom: 20 }}>
          {current.content}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button
            onClick={() => step > 0 && setStep(s => s - 1)}
            style={{
              background: "#f5f5f5", border: "none",
              color: step === 0 ? "#ccc" : "#4A6572",
              padding: "10px 20px", borderRadius: 12, fontSize: 13,
              fontWeight: 800, cursor: step === 0 ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            ← Back
          </button>
          <button
            onClick={() => isLast ? onEnd() : setStep(s => s + 1)}
            style={{
              background: "linear-gradient(135deg, #00A89A, #007A72)",
              border: "none", color: "#fff",
              padding: "10px 24px", borderRadius: 12, fontSize: 13,
              fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              boxShadow: "0 4px 16px rgba(0,168,154,0.35)",
            }}
          >
            {isLast ? "Done! 🎉" : "Next →"}
          </button>
        </div>
      </div>
    </>
  );
}