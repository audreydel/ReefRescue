import { useState } from "react";

interface IntroModalProps {
  onStartTour: () => void;
  onSkip: () => void;
}

export default function IntroModal({ onStartTour, onSkip }: IntroModalProps) {
  const [page, setPage] = useState(0);

  const pages = [
    {
      icon: "🪸",
      title: "Welcome to ReefRescue!",
      content: (
        <>
          <p style={{ marginBottom: 14 }}>
            ReefRescue is an interactive platform that shows you the bleaching risk across the
            Great Barrier Reef in near real-time
          </p>
          <p>
            It was built to explore whether accessible design can help the public better understand
            coral bleaching risk as part of my dissertation at Trinity College Dublin. 
    
          </p>
        </>
      ),
    },
    {
      icon: "🌊",
      title: "What are coral reefs?",
      content: (
        <>
          <p style={{ marginBottom: 14 }}>
            Coral reefs are some of the most biodiverse ecosystems on the planet. 
            Despite covering less than 1% of the ocean floor, 
            they support around 25% of all marine species and
            provide food and income for over one billion people worldwide.
          </p>
          <p>
            The Great Barrier Reef stretches over 2,300 km along the northeast coast of Australia
            and is the world's largest coral reef system.
          </p>
        </>
      ),
    },
    {
      icon: "🌡️",
      title: "What is coral bleaching?",
      content: (
        <>
          <p style={{ marginBottom: 14 }}>
            Coral bleaching happens when ocean temperatures rise too high for too long. 
          </p>
          <p style={{ marginBottom: 14 }}>
            Corals expel the algae living inside them (the algae that give corals their colour) and
            most of their food. Without it, corals turn white and become vulnerable to disease
            and death.
          </p>
          <p>
            The Great Barrier Reef has experienced 4 mass bleaching events in the last six
            years, a direct consequence of climate change.
          </p>
        </>
      ),
    },
    {
      icon: "🗺️",
      title: "How to use ReefRescue",
      content: (
        <>
          <ul style={{ paddingLeft: 18, lineHeight: 2 }}>
            <li>The map shows bleaching risk across the reef — <b style={{ color: "#06D6A0" }}>green</b> is healthy, <b style={{ color: "#EF233C" }}>red</b> is critical</li>
            <li>Hover over any point to see its risk score and watch the mascot react</li>
            <li>Switch between <b>Sea Temperature</b>, <b>Sunlight Intensity</b>, <b>Accumulated Heat Stress</b>, and <b>Combined</b> layers</li>
            <li>Use the date picker or choose a key date from the sidebar to explore historical bleaching events</li>
          </ul>
        </>
      ),
    },
  ];

  const current = pages[page];
  const isLast = page === pages.length - 1;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(10, 20, 40, 0.85)",
      display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(6px)",
    }}>
      <div style={{
        background: "#fff",
        borderRadius: 24,
        padding: "36px 40px",
        maxWidth: 520,
        width: "90%",
        fontFamily: "'Nunito', sans-serif",
        boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
        position: "relative",
      }}>
        {/* Progress dots */}
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 28 }}>
          {pages.map((_, i) => (
            <div key={i} style={{
              width: i === page ? 24 : 8, height: 8, borderRadius: 4,
              background: i === page ? "#00A89A" : "#ddd",
              transition: "all 0.3s ease",
            }} />
          ))}
        </div>

        {/* Icon */}
        <div style={{ fontSize: 48, textAlign: "center", marginBottom: 16 }}>{current.icon}</div>

        {/* Title */}
        <div style={{ fontSize: 22, fontWeight: 900, color: "#1A2E3B", textAlign: "center", marginBottom: 16 }}>
          {current.title}
        </div>

        {/* Content */}
        <div style={{ fontSize: 14, color: "#4A6572", lineHeight: 1.8, marginBottom: 32 }}>
          {current.content}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={onSkip}
            style={{
              background: "none", border: "none", color: "#8BA3AF",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit", padding: "8px 4px",
            }}
          >
            Skip intro
          </button>

          <div style={{ display: "flex", gap: 10 }}>
            {page > 0 && (
              <button
                onClick={() => setPage(p => p - 1)}
                style={{
                  background: "#f5f5f5", border: "none", color: "#4A6572",
                  padding: "10px 20px", borderRadius: 12, fontSize: 13,
                  fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                ← Back
              </button>
            )}
            {!isLast ? (
              <button
                onClick={() => setPage(p => p + 1)}
                style={{
                  background: "linear-gradient(135deg, #00A89A, #007A72)",
                  border: "none", color: "#fff",
                  padding: "10px 24px", borderRadius: 12, fontSize: 13,
                  fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                  boxShadow: "0 4px 16px rgba(0,168,154,0.35)",
                }}
              >
                Next →
              </button>
            ) : (
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={onSkip}
                  style={{
                    background: "#f0f9f8", border: "2px solid #00A89A", color: "#00A89A",
                    padding: "10px 20px", borderRadius: 12, fontSize: 13,
                    fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Go to map
                </button>
                <button
                  onClick={onStartTour}
                  style={{
                    background: "linear-gradient(135deg, #00A89A, #007A72)",
                    border: "none", color: "#fff",
                    padding: "10px 24px", borderRadius: 12, fontSize: 13,
                    fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                    boxShadow: "0 4px 16px rgba(0,168,154,0.35)",
                  }}
                >
                  🗺️ Take the tour
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}