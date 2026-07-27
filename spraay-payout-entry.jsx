import { useState } from "react";

// ————— Spraay payout entry prototype —————
// Three ways in: type, pick from book, paste CSV. One list out.

const BOOK = [
  { id: 1, name: "Mom", addr: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", label: "Family", color: "#F59E0B", soft: "#FEF3C7" },
  { id: 2, name: "Marcus (dev)", addr: "0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC", label: "Team", color: "#0EA5E9", soft: "#E0F2FE" },
  { id: 3, name: "Jasmine (design)", addr: "0xaf4e43d512c73c673176962dca6b73f0fcff9118", label: "Team", color: "#0EA5E9", soft: "#E0F2FE" },
  { id: 4, name: "Uncle Ray", addr: "0xFBD832Db6D9a05A0434cd497707a1bDC43389CfD", label: "Family", color: "#F59E0B", soft: "#FEF3C7" },
  { id: 5, name: "Dev burner", addr: "0x000071B45D743AB62a1A2B351f4f92fb1dBEEF00", label: "Burner", color: "#EF4444", soft: "#FEE2E2" },
];

const short = (a) => (a && a.length > 14 ? a.slice(0, 6) + "…" + a.slice(-4) : a);
const looksValid = (a) => /^0x[a-fA-F0-9]{40}$/.test(a) || /\.eth$/.test(a);

let uid = 100;

export default function PayoutEntry() {
  const [rows, setRows] = useState([
    { id: 1, addr: "", name: "", amt: "" },
    { id: 2, addr: "", name: "", amt: "" },
    { id: 3, addr: "", name: "", amt: "" },
  ]);
  const [pickerFor, setPickerFor] = useState(null); // row id
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [sameAmt, setSameAmt] = useState(true);
  const [amtAll, setAmtAll] = useState("25");

  const filled = rows.filter((r) => r.addr.trim());
  const total = sameAmt
    ? (filled.length * (Number(amtAll) || 0)).toFixed(2)
    : filled.reduce((s, r) => s + (Number(r.amt) || 0), 0).toFixed(2);

  const setRow = (id, patch) =>
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addRow = () => setRows([...rows, { id: ++uid, addr: "", name: "", amt: "" }]);

  const removeRow = (id) =>
    setRows(rows.length > 1 ? rows.filter((r) => r.id !== id) : rows);

  const pickFromBook = (contact) => {
    setRow(pickerFor, { addr: contact.addr, name: contact.name });
    setPickerFor(null);
  };

  const importCsv = () => {
    const parsed = csvText
      .split(/\n+/)
      .map((line) => {
        const [a, b, c] = line.split(/[,\t;]+/).map((s) => s?.trim());
        // accept "address", "name,address", "name,address,amount"
        if (looksValid(a)) return { addr: a, name: b || "", amt: c || "" };
        if (looksValid(b)) return { addr: b, name: a || "", amt: c || "" };
        return null;
      })
      .filter(Boolean)
      .map((p) => ({ id: ++uid, ...p }));
    if (parsed.length) {
      const kept = rows.filter((r) => r.addr.trim());
      setRows([...kept, ...parsed]);
      setCsvText("");
      setCsvOpen(false);
    }
  };

  const F = "'Fredoka', sans-serif";

  return (
    <div style={{ minHeight: "100vh", background: "#FBFBF9", fontFamily: "'Inter', system-ui, sans-serif", color: "#101828", display: "flex", justifyContent: "center" }}>
      <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      <div style={{ width: "100%", maxWidth: 420, padding: "26px 18px 140px", position: "relative" }}>

        <div style={{ fontFamily: F, fontWeight: 700, fontSize: 24 }}>
          New payout<span style={{ color: "#0EA5E9" }}>.</span>
        </div>
        <p style={{ color: "#667085", fontSize: 14, fontWeight: 500, margin: "6px 0 20px" }}>
          Type an address, pick from your book, or import a list.
        </p>

        {/* amount mode */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button
            onClick={() => setSameAmt(true)}
            style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: sameAmt ? "2px solid #0EA5E9" : "2px solid #EAECF0", background: sameAmt ? "#E0F2FE" : "#fff", color: sameAmt ? "#0369A1" : "#667085", fontFamily: F, fontWeight: 600, fontSize: 14, cursor: "pointer" }}
          >
            Same amount each
          </button>
          <button
            onClick={() => setSameAmt(false)}
            style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: !sameAmt ? "2px solid #0EA5E9" : "2px solid #EAECF0", background: !sameAmt ? "#E0F2FE" : "#fff", color: !sameAmt ? "#0369A1" : "#667085", fontFamily: F, fontWeight: 600, fontSize: 14, cursor: "pointer" }}
          >
            Custom per person
          </button>
        </div>

        {sameAmt && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
            <input
              type="number"
              value={amtAll}
              onChange={(e) => setAmtAll(e.target.value)}
              aria-label="Amount for everyone"
              style={{ width: 100, padding: "11px 12px", borderRadius: 12, border: "2px solid #EAECF0", fontSize: 16, fontWeight: 600 }}
            />
            <span style={{ fontSize: 14, color: "#667085", fontWeight: 600 }}>USDC to each person</span>
          </div>
        )}

        {/* rows */}
        {rows.map((r, i) => (
          <div key={r.id} style={{ background: "#fff", border: "2px solid #EFF1F4", borderRadius: 16, padding: "12px 12px", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#98A2B3", width: 18, textAlign: "center" }}>{i + 1}</span>
              <div style={{ flex: 1 }}>
                {r.name ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{r.name}</span>
                    <span style={{ fontSize: 12.5, color: "#98A2B3", fontFamily: "monospace" }}>{short(r.addr)}</span>
                  </div>
                ) : (
                  <input
                    value={r.addr}
                    onChange={(e) => setRow(r.id, { addr: e.target.value })}
                    placeholder="0x… address or ENS"
                    style={{ width: "100%", boxSizing: "border-box", border: "none", outline: "none", fontSize: 14, fontFamily: "monospace", background: "transparent", padding: "4px 0" }}
                  />
                )}
              </div>
              {!sameAmt && (
                <input
                  type="number"
                  value={r.amt}
                  onChange={(e) => setRow(r.id, { amt: e.target.value })}
                  placeholder="$"
                  aria-label="Amount for this person"
                  style={{ width: 64, padding: "8px 8px", borderRadius: 10, border: "2px solid #EAECF0", fontSize: 14, fontWeight: 600 }}
                />
              )}
              <button
                onClick={() => setPickerFor(r.id)}
                aria-label="Pick from address book"
                title="Pick from address book"
                style={{ border: "none", background: "#F2F4F7", borderRadius: 10, padding: "9px 11px", fontSize: 15, cursor: "pointer" }}
              >
                📖
              </button>
              <button
                onClick={() => (r.addr || r.name ? setRow(r.id, { addr: "", name: "", amt: "" }) : removeRow(r.id))}
                aria-label="Clear row"
                style={{ border: "none", background: "transparent", color: "#98A2B3", fontSize: 17, cursor: "pointer", padding: 4 }}
              >
                ×
              </button>
            </div>
            {r.addr && !r.name && !looksValid(r.addr) && (
              <div style={{ fontSize: 12, color: "#D92D20", fontWeight: 600, marginTop: 6, marginLeft: 26 }}>
                That doesn't look like a valid address yet
              </div>
            )}
          </div>
        ))}

        {/* add row + csv */}
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button
            onClick={addRow}
            style={{ flex: 1, padding: "13px 0", borderRadius: 14, border: "2px dashed #CBD5E1", background: "transparent", color: "#344054", fontFamily: F, fontWeight: 600, fontSize: 15, cursor: "pointer" }}
          >
            + Add person
          </button>
          <button
            onClick={() => setCsvOpen(!csvOpen)}
            style={{ flex: 1, padding: "13px 0", borderRadius: 14, border: "2px dashed #CBD5E1", background: csvOpen ? "#F2F4F7" : "transparent", color: "#344054", fontFamily: F, fontWeight: 600, fontSize: 15, cursor: "pointer" }}
          >
            📄 Import list
          </button>
        </div>

        {csvOpen && (
          <div style={{ marginTop: 12 }}>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={4}
              placeholder={"Paste CSV or one per line:\nMarcus, 0x1646…, 250\nJasmine, 0xaf4e…, 250\nor just addresses"}
              style={{ width: "100%", boxSizing: "border-box", padding: 13, borderRadius: 14, border: "2px solid #EAECF0", fontSize: 13.5, fontFamily: "monospace", lineHeight: 1.5 }}
            />
            <button
              onClick={importCsv}
              style={{ marginTop: 8, width: "100%", padding: "12px 0", borderRadius: 12, border: "none", background: "#101828", color: "#fff", fontFamily: F, fontWeight: 600, fontSize: 15, cursor: "pointer" }}
            >
              Add these to the list
            </button>
          </div>
        )}

        {/* book picker sheet */}
        {pickerFor && (
          <div
            onClick={() => setPickerFor(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 20 }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ width: "min(420px, 100%)", background: "#fff", borderRadius: "22px 22px 0 0", padding: "18px 18px 30px", maxHeight: "70vh", overflowY: "auto" }}
            >
              <div style={{ fontFamily: F, fontWeight: 700, fontSize: 18, marginBottom: 12 }}>From your book</div>
              {BOOK.map((c) => (
                <button
                  key={c.id}
                  onClick={() => pickFromBook(c)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "2px solid #EFF1F4", borderRadius: 14, padding: "12px 14px", marginBottom: 8, cursor: "pointer", textAlign: "left" }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{c.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: c.color, background: c.soft, padding: "2px 8px", borderRadius: 999 }}>{c.label}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: "#98A2B3", fontFamily: "monospace" }}>{short(c.addr)}</div>
                  </div>
                  <span style={{ color: "#0EA5E9", fontWeight: 700, fontSize: 18 }}>+</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* sticky total bar */}
        {filled.length > 0 && (
          <div style={{ position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)", width: "min(400px, calc(100% - 28px))", background: "#101828", borderRadius: 18, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 12px 30px rgba(16,24,40,.35)" }}>
            <div style={{ color: "#fff" }}>
              <div style={{ fontSize: 12.5, opacity: 0.7, fontWeight: 500 }}>
                {filled.length} {filled.length === 1 ? "person" : "people"} · 1 transaction
              </div>
              <div style={{ fontFamily: F, fontWeight: 700, fontSize: 19 }}>${total} USDC</div>
            </div>
            <button style={{ border: "none", cursor: "pointer", background: "#0EA5E9", color: "#fff", fontFamily: F, fontWeight: 600, borderRadius: 14, padding: "12px 22px", fontSize: 16 }}>
              Review →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
