"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  filePath: string;
  year: number;
  baseYear: number;
  allowedHotels: string[]; // ["JCR", "MARRIOTT", ...]
  hotelFilter: string; // "JCR" o hotel
};

type Row = {
  hotel: string; // Empresa
  membership: string; // Bonboy
  qty: number; // Cantidad
  year: number;
  month: number; // 1..12 (si existe)
};

function normHotel(x: any) {
  const s = String(x ?? "").trim().toUpperCase();
  if (!s) return "";
  if (s.includes("MARRIOTT")) return "MARRIOTT";
  if (s.includes("BARILOCHE") || s.includes("BCR")) return "SHERATON BCR";
  if (s.includes("MAR DEL PLATA") || s.includes("MDQ")) return "SHERATON MDQ";
  if (s.includes("MAITEI")) return "MAITEI";
  return s;
}

function parseNumberES(v: any) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (!s) return 0;
  s = s.replace(/\./g, "").replace(/,/g, ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function yearFromDateLike(v: any): number {
  if (typeof v === "number" && v > 1900 && v < 2100) return Math.floor(v);
  const s = String(v ?? "").trim();
  const m4 = s.match(/(19|20)\d{2}/);
  if (m4) return Number(m4[0]);
  return 0;
}

function monthFromDateLike(v: any): number {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-]((19|20)\d{2}|\d{2})/);
  if (m) {
    const mm = Number(m[2]);
    if (mm >= 1 && mm <= 12) return mm;
  }
  return 0;
}

function fmtInt(n: number) {
  return (n ?? 0).toLocaleString("es-AR");
}
function fmtPct(n: number) {
  return (n ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

const COLOR_BY_MEM: Record<string, string> = {
  MRD: "#ef4444", // rojo
  GLD: "#f59e0b", // naranja
  TTM: "#a855f7", // violeta
  PLT: "#94a3b8", // gris-azulado
  SLR: "#cbd5e1", // gris claro
  AMB: "#38bdf8", // celeste
};

function normalizeMemName(raw: string) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  // Si viene "Member (MRD)" tomamos código
  const m = s.match(/\(([^)]+)\)/);
  if (m) return m[1].trim().toUpperCase();
  // si viene "MRD"
  if (s.length <= 5) return s.toUpperCase();
  return s.toUpperCase();
}

export default function MembershipSummary({ filePath, year, baseYear, allowedHotels, hotelFilter }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr("");

        const { rows: raw } = await readXlsxFromPublic(filePath);

        // Detectar headers
        const keys = Object.keys(raw?.[0] ?? {});
        const keyLC = keys.map((k) => String(k).trim().toLowerCase());

        const hotelKey =
          keys[keyLC.indexOf("empresa")] ??
          keys[keyLC.indexOf("hotel")] ??
          keys.find((k) => String(k).toLowerCase().includes("empresa")) ??
          "";

        const memKey =
          keys[keyLC.indexOf("bonboy")] ??
          keys[keyLC.indexOf("membership")] ??
          keys.find((k) => String(k).toLowerCase().includes("bon")) ??
          "";

        const qtyKey =
          keys[keyLC.indexOf("cantidad")] ??
          keys[keyLC.indexOf("qty")] ??
          keys.find((k) => String(k).toLowerCase().includes("cant")) ??
          "";

        const dateKey =
          keys[keyLC.indexOf("fecha")] ??
          keys[keyLC.indexOf("date")] ??
          keys.find((k) => String(k).toLowerCase().includes("fec")) ??
          "";

        if (!hotelKey || !memKey || !qtyKey || !dateKey) {
          setRows([]);
          setErr(
            `Headers no detectados. Detectado: hotel=${hotelKey || "—"} · membership=${memKey || "—"} · qty=${
              qtyKey || "—"
            } · fecha=${dateKey || "—"}`
          );
          return;
        }

        const parsed: Row[] = [];

        for (const r of raw) {
          const hotel = normHotel(r[hotelKey]);
          const membership = normalizeMemName(r[memKey]);
          const qty = parseNumberES(r[qtyKey]);
          const y = yearFromDateLike(r[dateKey]);
          const m = monthFromDateLike(r[dateKey]);

          if (!hotel || !membership || !y) continue;
          if (!qty) continue;

          parsed.push({ hotel, membership, qty, year: y, month: m || 0 });
        }

        setRows(parsed);
      } catch (e: any) {
        setErr(String(e?.message ?? e));
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [filePath]);

  // scope hotel: JCR suma 3 hoteles
  const scopedRows = useMemo(() => {
    const scope = hotelFilter;

    if (scope === "JCR") {
      const set = new Set(["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"]);
      return rows.filter((r) => set.has(r.hotel));
    }
    return rows.filter((r) => r.hotel === normHotel(scope));
  }, [rows, hotelFilter]);

  function sumFor(y: number) {
    // Mapa membership -> qty
    const map: Record<string, number> = {};
    for (const r of scopedRows) {
      if (r.year !== y) continue;
      map[r.membership] = (map[r.membership] ?? 0) + r.qty;
    }
    return map;
  }

  const cur = useMemo(() => sumFor(year), [scopedRows, year]);
  const base = useMemo(() => sumFor(baseYear), [scopedRows, baseYear]);

  const keys = useMemo(() => {
    const set: Record<string, true> = {};
    Object.keys(cur).forEach((k) => (set[k] = true));
    Object.keys(base).forEach((k) => (set[k] = true));
    return Object.keys(set);
  }, [cur, base]);

  const totalCur = useMemo(() => Object.values(cur).reduce((a, b) => a + b, 0), [cur]);
  const totalBase = useMemo(() => Object.values(base).reduce((a, b) => a + b, 0), [base]);

  const delta = useMemo(() => {
    if (!totalBase) return 0;
    return ((totalCur - totalBase) / totalBase) * 100;
  }, [totalCur, totalBase]);

  const list = useMemo(() => {
    const arr = keys
      .map((k) => ({
        key: k,
        cur: cur[k] ?? 0,
        base: base[k] ?? 0,
      }))
      .filter((x) => x.cur > 0 || x.base > 0)
      .sort((a, b) => b.cur - a.cur);

    return arr;
  }, [keys, cur, base]);

  const titleHotel =
    hotelFilter === "JCR" ? "JCR" : normHotel(hotelFilter);

  const noData = !loading && list.length === 0;

  return (
    <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
      <div style={{ display: "flex", gap: "1rem", alignItems: "baseline", flexWrap: "wrap" }}>
        <div style={{ fontSize: "1.15rem", fontWeight: 950 }}>
          Membership ({titleHotel})
        </div>
        <div style={{ opacity: 0.75 }}>
          Acumulado {year} · vs {baseYear}
        </div>
        <div style={{ marginLeft: "auto", opacity: 0.75, fontSize: ".9rem" }}>
          Fuente: Excel ({filePath})
        </div>
      </div>

      {loading ? (
        <div style={{ marginTop: ".75rem", opacity: 0.75 }}>Cargando membership…</div>
      ) : err ? (
        <div style={{ marginTop: ".75rem", color: "crimson" }}>{err}</div>
      ) : noData ? (
        <div style={{ marginTop: ".75rem", opacity: 0.75 }}>
          Sin datos para {titleHotel} en {year}.
        </div>
      ) : (
        <div
          style={{
            marginTop: "1rem",
            display: "grid",
            gridTemplateColumns: "minmax(0, 420px) minmax(0, 1fr)",
            gap: "1rem",
          }}
        >
          {/* Total */}
          <div
            style={{
              background: "rgba(0,0,0,0.03)",
              borderRadius: 20,
              padding: "1rem",
              border: "1px solid rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ opacity: 0.7, fontWeight: 700 }}>Total</div>
            <div style={{ fontSize: "3rem", fontWeight: 950, lineHeight: 1.05, marginTop: ".25rem" }}>
              {fmtInt(totalCur)}
            </div>
            <div
              style={{
                display: "inline-block",
                marginTop: ".8rem",
                padding: ".4rem .7rem",
                borderRadius: 999,
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                fontWeight: 800,
                color: "rgb(4, 120, 87)",
              }}
            >
              {delta >= 0 ? "+" : ""}
              {fmtPct(delta)} vs {baseYear}
            </div>

            <div style={{ marginTop: ".8rem", opacity: 0.65 }}>Composición</div>
          </div>

          {/* Barras por membresía (más chicas + responsive) */}
          <div style={{ display: "grid", gap: ".65rem" }}>
            {list.map((it) => {
              const pct = totalCur > 0 ? (it.cur / totalCur) * 100 : 0;
              const color = COLOR_BY_MEM[it.key] ?? "#64748b";

              return (
                <div
                  key={it.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "220px minmax(0, 1fr) 90px",
                    gap: ".75rem",
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontWeight: 850 }}>
                    {it.key === "MRD" ? "Member (MRD)" :
                     it.key === "GLD" ? "Gold Elite (GLD)" :
                     it.key === "TTM" ? "Titanium Elite (TTM)" :
                     it.key === "PLT" ? "Platinum Elite (PLT)" :
                     it.key === "SLR" ? "Silver Elite (SLR)" :
                     it.key === "AMB" ? "Ambassador Elite (AMB)" : it.key}
                    <div style={{ fontSize: ".9rem", opacity: 0.7, fontWeight: 700 }}>
                      {pct.toFixed(1).replace(".", ",")}% del total
                    </div>
                  </div>

                  <div
                    style={{
                      height: 12,
                      borderRadius: 999,
                      background: "rgba(0,0,0,0.08)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.max(0, Math.min(100, pct))}%`,
                        height: "100%",
                        borderRadius: 999,
                        background: color,
                      }}
                    />
                  </div>

                  <div style={{ textAlign: "right", fontWeight: 900 }}>
                    {fmtInt(it.cur)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* responsive tweak */}
      <style jsx>{`
        @media (max-width: 900px) {
          div[style*="grid-template-columns: minmax(0, 420px)"] {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 640px) {
          div[style*="grid-template-columns: 220px"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
