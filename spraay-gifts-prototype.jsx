import { useState, useMemo, useRef } from "react";

// ————— Spraay Gifts / Payouts prototype —————
// One batch endpoint underneath. Two skins on top.

const MODES = {
  gift: {
    label: "Gift",
    emoji: "🎁",
    accent: "#FF5D73",
    accentSoft: "#FFE9ED",
    accentDeep: "#D93A52",
    verb: "Spray gifts",
    tagline: "Send a little something to everyone at once.",
    presets: [
      { name: "Coffee on me", amt: 5 },
      { name: "Birthday", amt: 20 },
      { name: "Holiday bonus", amt: 50 },
      { name: "Just because", amt: 10 },
    ],
    doneMsg: "Gifts sprayed! 🎉",
  },
  payout: {
    label: "Payout",
    emoji: "💼",
    accent: "#0EA5E9",
    accentSoft: "#E3F4FD",
    accentDeep: "#0369A1",
    verb: "Send payouts",
    tagline: "Pay your whole team in one transaction.",
    presets: [
      { name: "Weekly pay", amt: 250 },
      { name: "Contractor", amt: 500 },
      { name: "Stipend", amt: 100 },
      { name: "Reimburse", amt: 75 },
    ],
    doneMsg: "Payouts sent ✓",
  },
};

const short = (a) => (a.length > 12 ? a.slice(0, 6) + "…" + a.slice(-4) : a);

export default function SpraayApp() {
  const [mode, setMode] = useState("gift");
  const [amount, setAmount] = useState(5);
  const [raw, setRaw] = useState("");
  const [stage, setStage] = useState("form"); // form | confirm | done
  const [drops, setDrops] = useState([]);
  const dropId = useRef(0);

  const m = MODES[mode];
  const recipients = useMemo(
    () =>
      raw
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [raw]
  );
  const total = (recipients.length * amount).toFixed(2);

  const fireSpray = () => {
    const burst = Array.from({ length: 26 }, () => ({
      id: dropId.current++,
      x: (Math.random() - 0.5) * 320,
      y: -(60 + Math.random() * 260),
      r: Math.random() * 360,
      e: Math.random() > 0.5 ? m.emoji : "💧",
      d: 0.7 + Math.random() * 0.8,
    }));
    setDrops(burst);
    setTimeout(() => setDrops([]), 1600);
  };

  const confirm = () => {
    fireSpray();
    setStage("done");
    // In production: POST /api/v1/batch/execute with {recipients, amount, token:"USDC"}
  };

  const reset = () => {
    setStage("form");
    setRaw("");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#FDFDFB",
        fontFamily: "'Inter', system-ui, sans-serif",
        color: "#101828",
        display: "flex",
        justifyContent: "center",
        transition: "background .4s",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <div style={{ width: "100%", maxWidth: 420, padding: "28px 20px 48px", position: "relative" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "'Fredoka'", fontWeight: 700, fontSize: 26, letterSpacing: "-0.5px" }}>
            spraay<span style={{ color: m.accent }}>.</span>
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#667085",
              background: "#F2F4F7",
              padding: "4px 10px",
              borderRadius: 999,
            }}
          >
            USDC · Base
          </div>
        </div>

        {/* mode toggle */}
        <div
          role="tablist"
          aria-label="Mode"
          style={{
            display: "flex",
            background: "#F2F4F7",
            borderRadius: 16,
            padding: 5,
            marginTop: 22,
          }}
        >
          {Object.entries(MODES).map(([key, cfg]) => (
            <button
              key={key}
              role="tab"
              aria-selected={mode === key}
              onClick={() => {
                setMode(key);
                setAmount(cfg.presets[0].amt);
                setStage("form");
              }}
              style={{
                flex: 1,
                border: "none",
                cursor: "pointer",
                padding: "12px 0",
                borderRadius: 12,
                fontFamily: "'Fredoka'",
                fontWeight: 600,
                fontSize: 17,
                background: mode === key ? "#fff" : "transparent",
                color: mode === key ? cfg.accentDeep : "#667085",
                boxShadow: mode === key ? "0 2px 8px rgba(16,24,40,.08)" : "none",
                transition: "all .2s",
              }}
            >
              {cfg.emoji} {cfg.label}
            </button>
          ))}
        </div>

        <p style={{ color: "#667085", fontSize: 14.5, margin: "14px 2px 22px", fontWeight: 500 }}>
          {m.tagline}
        </p>

        {stage === "form" && (
          <>
            {/* presets */}
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".04em", color: "#98A2B3", textTransform: "uppercase" }}>
              1 · Pick an amount each
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "10px 0 6px" }}>
              {m.presets.map((p) => (
                <button
                  key={p.name}
                  onClick={() => setAmount(p.amt)}
                  style={{
                    border: amount === p.amt ? `2px solid ${m.accent}` : "2px solid #EAECF0",
                    background: amount === p.amt ? m.accentSoft : "#fff",
                    borderRadius: 14,
                    padding: "14px 12px",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all .15s",
                  }}
                >
                  <div style={{ fontFamily: "'Fredoka'", fontWeight: 600, fontSize: 20, color: "#101828" }}>
                    ${p.amt}
                  </div>
                  <div style={{ fontSize: 12.5, color: "#667085", fontWeight: 500 }}>{p.name}</div>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0 24px" }}>
              <span style={{ fontSize: 13, color: "#667085", fontWeight: 500 }}>or custom:</span>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                aria-label="Custom amount"
                style={{
                  width: 90,
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "2px solid #EAECF0",
                  fontSize: 15,
                  fontWeight: 600,
                  fontFamily: "'Inter'",
                }}
              />
              <span style={{ fontSize: 13, color: "#667085", fontWeight: 600 }}>USDC each</span>
            </div>

            {/* recipients */}
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".04em", color: "#98A2B3", textTransform: "uppercase" }}>
              2 · Who gets it?
            </div>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={"Paste wallet addresses or ENS names —\none per line\n\n0xA1b2…\nvitalik.eth\n0xC3d4…"}
              rows={5}
              style={{
                width: "100%",
                boxSizing: "border-box",
                marginTop: 10,
                padding: 14,
                borderRadius: 14,
                border: "2px solid #EAECF0",
                fontSize: 14.5,
                fontFamily: "'Inter'",
                resize: "vertical",
                lineHeight: 1.5,
              }}
            />
            {recipients.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {recipients.slice(0, 6).map((r, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      background: m.accentSoft,
                      color: m.accentDeep,
                      padding: "4px 10px",
                      borderRadius: 999,
                    }}
                  >
                    {short(r)}
                  </span>
                ))}
                {recipients.length > 6 && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#667085", padding: "4px 6px" }}>
                    +{recipients.length - 6} more
                  </span>
                )}
              </div>
            )}

            {/* total + CTA */}
            <div
              style={{
                marginTop: 26,
                background: "#fff",
                border: "2px solid #EAECF0",
                borderRadius: 18,
                padding: "16px 18px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 12.5, color: "#667085", fontWeight: 600 }}>
                  {recipients.length || "No"} {recipients.length === 1 ? "person" : "people"} · ${amount} each
                </div>
                <div style={{ fontFamily: "'Fredoka'", fontWeight: 700, fontSize: 26 }}>
                  ${total}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#98A2B3", fontWeight: 600, textAlign: "right" }}>
                1 transaction
                <br />
                you keep your keys
              </div>
            </div>

            <button
              disabled={recipients.length === 0 || amount <= 0}
              onClick={() => setStage("confirm")}
              style={{
                width: "100%",
                marginTop: 16,
                padding: "18px 0",
                borderRadius: 18,
                border: "none",
                cursor: recipients.length ? "pointer" : "not-allowed",
                background: recipients.length ? m.accent : "#EAECF0",
                color: recipients.length ? "#fff" : "#98A2B3",
                fontFamily: "'Fredoka'",
                fontWeight: 700,
                fontSize: 20,
                letterSpacing: ".01em",
                boxShadow: recipients.length ? `0 8px 20px ${m.accent}44` : "none",
                transition: "all .2s",
              }}
            >
              {m.verb} →
            </button>
          </>
        )}

        {stage === "confirm" && (
          <div style={{ textAlign: "center", paddingTop: 12 }}>
            <div style={{ fontSize: 52 }}>{m.emoji}</div>
            <div style={{ fontFamily: "'Fredoka'", fontWeight: 700, fontSize: 24, margin: "10px 0 4px" }}>
              ${total} to {recipients.length} {recipients.length === 1 ? "person" : "people"}
            </div>
            <div style={{ color: "#667085", fontSize: 14.5, fontWeight: 500 }}>
              ${amount} USDC each · one transaction · Base network
            </div>
            <button
              onClick={confirm}
              style={{
                width: "100%",
                marginTop: 28,
                padding: "18px 0",
                borderRadius: 18,
                border: "none",
                cursor: "pointer",
                background: m.accent,
                color: "#fff",
                fontFamily: "'Fredoka'",
                fontWeight: 700,
                fontSize: 20,
                boxShadow: `0 8px 20px ${m.accent}44`,
              }}
            >
              Confirm — {m.verb.toLowerCase()}
            </button>
            <button
              onClick={() => setStage("form")}
              style={{
                marginTop: 14,
                background: "none",
                border: "none",
                color: "#667085",
                fontWeight: 600,
                fontSize: 14.5,
                cursor: "pointer",
              }}
            >
              ← Go back
            </button>
          </div>
        )}

        {stage === "done" && (
          <div style={{ textAlign: "center", paddingTop: 30 }}>
            <div style={{ fontSize: 60 }}>{mode === "gift" ? "🎉" : "✅"}</div>
            <div style={{ fontFamily: "'Fredoka'", fontWeight: 700, fontSize: 26, margin: "12px 0 6px" }}>
              {m.doneMsg}
            </div>
            <div style={{ color: "#667085", fontSize: 15, fontWeight: 500 }}>
              ${total} on its way to {recipients.length} {recipients.length === 1 ? "person" : "people"}.
            </div>
            <button
              onClick={reset}
              style={{
                marginTop: 26,
                padding: "14px 30px",
                borderRadius: 16,
                border: `2px solid ${m.accent}`,
                background: "#fff",
                color: m.accentDeep,
                fontFamily: "'Fredoka'",
                fontWeight: 600,
                fontSize: 17,
                cursor: "pointer",
              }}
            >
              {mode === "gift" ? "Spray again" : "New payout"}
            </button>
          </div>
        )}

        {/* spray burst */}
        <div style={{ position: "absolute", left: "50%", bottom: 120, pointerEvents: "none" }}>
          {drops.map((d) => (
            <span
              key={d.id}
              style={{
                position: "absolute",
                fontSize: 22,
                animation: `fly${d.id % 2} ${d.d}s ease-out forwards`,
                "--tx": `${d.x}px`,
                "--ty": `${d.y}px`,
                "--tr": `${d.r}deg`,
              }}
            >
              {d.e}
            </span>
          ))}
        </div>
        <style>{`
          @keyframes fly0 { to { transform: translate(var(--tx), var(--ty)) rotate(var(--tr)); opacity: 0; } }
          @keyframes fly1 { to { transform: translate(var(--tx), var(--ty)) rotate(var(--tr)) scale(.6); opacity: 0; } }
          @media (prefers-reduced-motion: reduce) { span[style*="fly"] { animation: none !important; } }
        `}</style>
      </div>
    </div>
  );
}
