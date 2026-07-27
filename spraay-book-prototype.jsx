import { useState, useMemo } from "react";

// ————— Spraay Address Book prototype —————
// Directory first. Batch pay baked in.

const LABELS = {
  family: { name: "Family", color: "#F59E0B", soft: "#FEF3C7" },
  team: { name: "Team", color: "#0EA5E9", soft: "#E0F2FE" },
  primary: { name: "Primary", color: "#8B5CF6", soft: "#EDE9FE" },
  burner: { name: "Burner", color: "#EF4444", soft: "#FEE2E2" },
  friend: { name: "Friend", color: "#10B981", soft: "#D1FAE5" },
};

const SEED = [
  { id: 1, name: "Mom", addr: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", label: "family" },
  { id: 2, name: "Marcus (dev)", addr: "0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC", label: "team" },
  { id: 3, name: "My main wallet", addr: "0xFBD832Db6D9a05A0434cd497707a1bDC43389CfD", label: "primary" },
  { id: 4, name: "Jasmine (design)", addr: "0xaf4e43d512c73c673176962dca6b73f0fcff9118", label: "team" },
  { id: 5, name: "Old burner", addr: "0x000071B45D743AB62a1A2B351f4f92fb1dBEEF00", label: "burner" },
];

const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);

export default function SpraayBook() {
  const [contacts, setContacts] = useState(SEED);
  const [selected, setSelected] = useState(new Set());
  const [copied, setCopied] = useState(null);
  const [view, setView] = useState("book"); // book | add | pay | done
  const [amount, setAmount] = useState(25);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ name: "", addr: "", label: "friend" });

  const shown = useMemo(
    () =>
      contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.addr.toLowerCase().includes(query.toLowerCase())
      ),
    [contacts, query]
  );

  const toggle = (id) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const copy = (c) => {
    navigator.clipboard?.writeText(c.addr).catch(() => {});
    setCopied(c.id);
    setTimeout(() => setCopied(null), 1400);
  };

  const chosen = contacts.filter((c) => selected.has(c.id));
  const total = (chosen.length * amount).toFixed(2);

  const addContact = () => {
    if (!form.name || !form.addr) return;
    setContacts([
      ...contacts,
      { id: Date.now(), name: form.name, addr: form.addr, label: form.label },
    ]);
    setForm({ name: "", addr: "", label: "friend" });
    setView("book");
  };

  const S = {
    page: {
      minHeight: "100vh",
      background: "#FBFBF9",
      fontFamily: "'Inter', system-ui, sans-serif",
      color: "#101828",
      display: "flex",
      justifyContent: "center",
    },
    wrap: { width: "100%", maxWidth: 420, padding: "26px 18px 120px", position: "relative" },
    h: { fontFamily: "'Fredoka'", fontWeight: 700 },
    btn: (bg, color = "#fff") => ({
      border: "none",
      cursor: "pointer",
      background: bg,
      color,
      fontFamily: "'Fredoka'",
      fontWeight: 600,
      borderRadius: 14,
    }),
  };

  return (
    <div style={S.page}>
      <link
        href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Inter:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      <div style={S.wrap}>
        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ ...S.h, fontSize: 25 }}>
            spraay<span style={{ color: "#0EA5E9" }}> book</span>
          </div>
          {view === "book" && (
            <button
              onClick={() => setView("add")}
              style={{ ...S.btn("#101828"), padding: "9px 16px", fontSize: 15 }}
            >
              + Add
            </button>
          )}
        </div>

        {view === "book" && (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search names or addresses…"
              style={{
                width: "100%",
                boxSizing: "border-box",
                margin: "16px 0 6px",
                padding: "13px 15px",
                borderRadius: 14,
                border: "2px solid #EAECF0",
                fontSize: 15,
                fontFamily: "'Inter'",
              }}
            />
            <p style={{ fontSize: 12.5, color: "#98A2B3", fontWeight: 500, margin: "6px 2px 14px" }}>
              Tap 📋 to copy an address · tick people to pay them together
            </p>

            {shown.map((c) => {
              const L = LABELS[c.label];
              const on = selected.has(c.id);
              return (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    background: on ? "#F0F9FF" : "#fff",
                    border: on ? "2px solid #0EA5E9" : "2px solid #EFF1F4",
                    borderRadius: 16,
                    padding: "13px 14px",
                    marginBottom: 10,
                    transition: "all .15s",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(c.id)}
                    aria-label={`Select ${c.name}`}
                    style={{ width: 20, height: 20, accentColor: "#0EA5E9", cursor: "pointer" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 15.5 }}>{c.name}</span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: L.color,
                          background: L.soft,
                          padding: "2px 8px",
                          borderRadius: 999,
                        }}
                      >
                        {L.name}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: "#98A2B3", fontFamily: "monospace" }}>
                      {short(c.addr)}
                    </div>
                  </div>
                  <button
                    onClick={() => copy(c)}
                    aria-label={`Copy ${c.name}'s address`}
                    style={{
                      ...S.btn(copied === c.id ? "#D1FAE5" : "#F2F4F7", copied === c.id ? "#047857" : "#344054"),
                      padding: "9px 12px",
                      fontSize: 14,
                    }}
                  >
                    {copied === c.id ? "Copied ✓" : "📋"}
                  </button>
                </div>
              );
            })}

            {shown.length === 0 && (
              <div style={{ textAlign: "center", color: "#98A2B3", padding: 40, fontSize: 14.5 }}>
                No matches. Add someone with the + button.
              </div>
            )}

            <button
              onClick={() => {}}
              style={{
                width: "100%",
                marginTop: 8,
                padding: "13px 0",
                borderRadius: 14,
                border: "2px dashed #CBD5E1",
                background: "transparent",
                color: "#667085",
                fontWeight: 600,
                fontSize: 14,
                fontFamily: "'Inter'",
                cursor: "pointer",
              }}
            >
              🔗 Request an address — send someone a link, their wallet lands here
            </button>

            {/* sticky pay bar */}
            {selected.size > 0 && (
              <div
                style={{
                  position: "fixed",
                  bottom: 18,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "min(400px, calc(100% - 28px))",
                  background: "#101828",
                  borderRadius: 18,
                  padding: "14px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  boxShadow: "0 12px 30px rgba(16,24,40,.35)",
                }}
              >
                <div style={{ color: "#fff" }}>
                  <div style={{ fontSize: 12.5, opacity: 0.7, fontWeight: 500 }}>
                    {selected.size} selected
                  </div>
                  <div style={{ ...S.h, fontSize: 17 }}>Pay them together</div>
                </div>
                <button
                  onClick={() => setView("pay")}
                  style={{ ...S.btn("#0EA5E9"), padding: "12px 22px", fontSize: 16 }}
                >
                  Pay {selected.size} →
                </button>
              </div>
            )}
          </>
        )}

        {view === "add" && (
          <div style={{ marginTop: 20 }}>
            <div style={{ ...S.h, fontSize: 20, marginBottom: 16 }}>Add a wallet</div>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Name — e.g. Mom, My burner"
              style={{ width: "100%", boxSizing: "border-box", padding: 14, borderRadius: 14, border: "2px solid #EAECF0", fontSize: 15, marginBottom: 12, fontFamily: "'Inter'" }}
            />
            <input
              value={form.addr}
              onChange={(e) => setForm({ ...form, addr: e.target.value })}
              placeholder="0x… address or ENS"
              style={{ width: "100%", boxSizing: "border-box", padding: 14, borderRadius: 14, border: "2px solid #EAECF0", fontSize: 14, fontFamily: "monospace", marginBottom: 14 }}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
              {Object.entries(LABELS).map(([k, L]) => (
                <button
                  key={k}
                  onClick={() => setForm({ ...form, label: k })}
                  style={{
                    ...S.btn(form.label === k ? L.soft : "#F2F4F7", form.label === k ? L.color : "#667085"),
                    padding: "9px 14px",
                    fontSize: 14,
                    border: form.label === k ? `2px solid ${L.color}` : "2px solid transparent",
                  }}
                >
                  {L.name}
                </button>
              ))}
            </div>
            <button onClick={addContact} style={{ ...S.btn("#101828"), width: "100%", padding: "16px 0", fontSize: 18 }}>
              Save to book
            </button>
            <button
              onClick={() => setView("book")}
              style={{ marginTop: 12, width: "100%", background: "none", border: "none", color: "#667085", fontWeight: 600, fontSize: 14.5, cursor: "pointer" }}
            >
              ← Back
            </button>
          </div>
        )}

        {view === "pay" && (
          <div style={{ marginTop: 20 }}>
            <div style={{ ...S.h, fontSize: 20 }}>Pay {chosen.length} people</div>
            <div style={{ margin: "14px 0", display: "flex", flexWrap: "wrap", gap: 6 }}>
              {chosen.map((c) => (
                <span key={c.id} style={{ fontSize: 12.5, fontWeight: 600, background: "#E0F2FE", color: "#0369A1", padding: "5px 11px", borderRadius: 999 }}>
                  {c.name}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".04em", color: "#98A2B3", textTransform: "uppercase", marginTop: 18 }}>
              Amount each
            </div>
            <div style={{ display: "flex", gap: 10, margin: "10px 0 20px" }}>
              {[10, 25, 50, 100].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(v)}
                  style={{
                    ...S.btn(amount === v ? "#E0F2FE" : "#fff", amount === v ? "#0369A1" : "#344054"),
                    flex: 1,
                    padding: "14px 0",
                    fontSize: 17,
                    border: amount === v ? "2px solid #0EA5E9" : "2px solid #EAECF0",
                  }}
                >
                  ${v}
                </button>
              ))}
            </div>
            <div style={{ background: "#fff", border: "2px solid #EAECF0", borderRadius: 18, padding: "16px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 12.5, color: "#667085", fontWeight: 600 }}>
                  {chosen.length} people · ${amount} each
                </div>
                <div style={{ ...S.h, fontSize: 26 }}>${total} USDC</div>
              </div>
              <div style={{ fontSize: 12, color: "#98A2B3", fontWeight: 600, textAlign: "right" }}>
                1 transaction<br />you keep your keys
              </div>
            </div>
            <button
              onClick={() => setView("done")}
              style={{ ...S.btn("#0EA5E9"), width: "100%", marginTop: 16, padding: "17px 0", fontSize: 19, boxShadow: "0 8px 20px #0EA5E944" }}
            >
              Spray it →
            </button>
            <button
              onClick={() => setView("book")}
              style={{ marginTop: 12, width: "100%", background: "none", border: "none", color: "#667085", fontWeight: 600, fontSize: 14.5, cursor: "pointer" }}
            >
              ← Back to book
            </button>
          </div>
        )}

        {view === "done" && (
          <div style={{ textAlign: "center", paddingTop: 46 }}>
            <div style={{ fontSize: 58 }}>💧</div>
            <div style={{ ...S.h, fontSize: 25, margin: "12px 0 6px" }}>Sprayed!</div>
            <div style={{ color: "#667085", fontSize: 15, fontWeight: 500 }}>
              ${total} to {chosen.length} people, one transaction.
            </div>
            <button
              onClick={() => {
                setSelected(new Set());
                setView("book");
              }}
              style={{ ...S.btn("#fff", "#0369A1"), marginTop: 26, padding: "13px 28px", fontSize: 16, border: "2px solid #0EA5E9" }}
            >
              Back to my book
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
