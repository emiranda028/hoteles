"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  year: number;
  baseYear?: number;
  allowedHotels: string[]; // ["MARRIOTT","SHERATON BCR","SHERATON MDQ"]
  filePath: string; // "/data/jcr_membership.xlsx"
  title?: string;
  hotelFilter?: MembershipHotelFilter;
  compactCharts?: boolean;
};

export type MembershipHotelFilter = "JCR" | "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ";

type Row = {
  hotel: string;
  membership: string;
  qty: number;
  date: Date | null;
  year: number;
  month: number; // 1..12
};

const MONTHS = ["Año", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function num(v: any): number {
  if (typeof v === "number" && isFinite(v)) return v;
  const s = String(v ?? "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

function toUpperClean(s: any) {
  return String(s ?? "").trim().toUpperCase();
}

/** Excel serial date -> JS Date (Windows/1900 system). */
function excelSerialToDate(serial: number): Date {
  // Excel day 1 = 1900-01-01 (pero hay bug 1900 leap; por eso se usa 1899-12-30)
  const utcDays = serial - 25569; // days between 1899-12-30 and 1970-01-01
  const ms = utcDays * 86400 * 1000;
  return new Date(ms);
}

function parseDateLoose(v: any): Date | null {
  if (!v) return null;

  // Date object (ideal)
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  // Excel serial (ej 46004)
  if (typeof v === "number" && v > 30000 && v < 70000) {
    const d = excelSerialToDate(v);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(v).trim();
  if (!s) return null;

  // dd/mm/yyyy
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    let yy = Number(m1[3]);
    if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  const d2 = new Date(s);
  return isNaN(d2.getTime()) ? null : d2;
}

function pickKey(keys: string[], candidates: string[]) {
  const low = keys.map((k) => k.trim().toLowerCase());
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i].toLowerCase();
    const idx = low.indexOf(c);
    if (idx >= 0) return keys[idx];
  }
  return "";
}

function pct(a: number, b: number) {
  if (!b) return null;
  return ((a - b) / b) * 100;
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n);
}

function fmtPct(n: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(n);
}

const COLORS: Record<string, string> = {
  "MEMBER (MRD)": "#F06C6C",
  "GOLD ELITE (GLD)": "#F2B134",
  "TITANIUM ELITE (TTM)": "#A778F3",
  "PLATINUM ELITE (PLT)": "#93A1B6",
  "SILVER ELITE (SLR)": "#C9D3E0",
  "AMBASSADOR ELITE (AMB)": "#5DC6F2",
};

function colorFor(name: string) {
  const k = toUpperClean(name);
  if (COLORS[k]) return COLORS[k];
  // fallback estable
  const palette = ["#F06C6C", "#F2B134", "#A778F3", "#93A1B6", "#C9D3E0", "#5DC6F2", "#7ED957", "#FF6FB1"];
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export default function MembershipSummary({
  year,
  baseYear,
  allowedHotels,
  filePath,
  title = "Membership (JCR)",
  hotelFilter = "JCR",
  compactCharts = false,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetInfo, setSheetInfo] = useState<{ sheetName: string; keys: string[] }>({ sheetName: "", keys: [] });

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await readXlsxFromPublic(filePath);
        const keys = Object.keys(r.rows?.[0] ?? {});
        setSheetInfo({ sheetName: r.sheetName, keys });

        const kHotel = pickKey(keys, ["Empresa", "Hotel"]);
        const kMem = pickKey(keys, ["Bonboy", "Membership", "Membresia", "Membresía"]);
        const kQty = pickKey(keys, ["Cantidad", "Qty", "Quantity", "Total"]);
        const kFecha = pickKey(keys, ["Fecha", "Date"]);

        const parsed: Row[] = (r.rows ?? []).map((raw: any) => {
          const hotel = toUpperClean(raw[kHotel] ?? raw["Empresa"] ?? raw["Hotel"]);
          const membership = String(raw[kMem] ?? raw["Bonboy"] ?? raw["Membership"] ?? "").trim();
          const qty = num(raw[kQty] ?? raw["Cantidad"] ?? raw["Qty"] ?? raw["Total"]);
          const date = parseDateLoose(raw[kFecha] ?? raw["Fecha"] ?? raw["Date"]);
          const y = date ? date.getFullYear() : num(raw["Año"] ?? raw["Ano"]);
          const m = date ? date.getMonth() + 1 : num(raw["Mes"] ?? raw["N° Mes"] ?? raw["Nº Mes"]);
          return { hotel, membership, qty, date, year: y, month: m };
        });

        if (alive) setRows(parsed.filter((x) => x.membership && x.qty !== 0));
      } catch (e) {
        if (alive) setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [filePath]);

  // hoteles a usar según filtro (JCR suma los 3)
  const hotelsToUse = useMemo(() => {
    if (hotelFilter === "JCR") return allowedHotels.map(toUpperClean);
    return [toUpperClean(hotelFilter)];
  }, [allowedHotels, hotelFilter]);

  const yearRows = useMemo(() => {
    return rows.filter((r) => r.year === year && hotelsToUse.indexOf(r.hotel) >= 0);
  }, [rows, year, hotelsToUse]);

  const baseRows = useMemo(() => {
    if (!baseYear) return [];
    return rows.filter((r) => r.year === baseYear && hotelsToUse.indexOf(r.hotel) >= 0);
  }, [rows, baseYear, hotelsToUse]);

  const availableYears = useMemo(() => {
    const s = new Set<number>();
    for (let i = 0; i < rows.length; i++) {
      const y = rows[i].year;
      if (y > 1900 && y < 2100) s.add(y);
    }
    return Array.from(s).sort((a, b) => b - a);
  }, [rows]);

  const sumMap = (yr: number) => {
    const m = new Map<string, number>();
    const list = rows.filter((r) => r.year === yr && hotelsToUse.indexOf(r.hotel) >= 0);
    for (let i = 0; i < list.length; i++) {
      const k = String(list[i].membership || "").trim();
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + (list[i].qty ?? 0));
    }
    return m;
  };

  const totalYear = useMemo(() => {
    let t = 0;
    for (let i = 0; i < yearRows.length; i++) t += yearRows[i].qty ?? 0;
    return t;
  }, [yearRows]);

  const totalBase = useMemo(() => {
    let t = 0;
    for (let i = 0; i < baseRows.length; i++) t += baseRows[i].qty ?? 0;
    return t;
  }, [baseRows]);

  const delta = useMemo(() => pct(totalYear, totalBase), [totalYear, totalBase]);

  const list = useMemo(() => {
    const cur = sumMap(year);
    const base = baseYear ? sumMap(baseYear) : new Map<string, number>();

    const keys = Array.from(new Set<string>(Array.from(cur.keys()).concat(Array.from(base.keys()))));
    const out = keys
      .map((k) => {
        const curVal = cur.get(k) ?? 0;
        const baseVal = base.get(k) ?? 0;
        const share = totalYear ? (curVal / totalYear) * 100 : 0;
        return { k, curVal, baseVal, share };
      })
      .sort((a, b) => b.curVal - a.curVal);

    return out;
  }, [rows, year, baseYear, hotelsToUse, totalYear]); // rows cambia => recalcula

  const maxVal = useMemo(() => {
    let m = 0;
    for (let i = 0; i < list.length; i++) m = Math.max(m, list[i].curVal);
    return m || 1;
  }, [list]);

  const chipStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 999,
    fontWeight: 800,
    border: "1px solid rgba(0,0,0,.12)",
    background: "rgba(255,255,255,.7)",
  };

  return (
    <section className="section" style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            {title} ({hotelFilter})
          </div>
          <div className="sectionDesc" style={{ marginTop: 6 }}>
            Acumulado {year} · vs {baseYear ?? "—"}
          </div>
        </div>

        <div style={chipStyle}>
          <span style={{ opacity: 0.7, fontWeight: 900 }}>Sheet:</span>
          <span>{sheetInfo.sheetName || "—"}</span>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
        {/* TOTAL */}
        <div className="card" style={{ padding: 18, borderRadius: 22 }}>
          <div style={{ opacity: 0.65, fontWeight: 800 }}>Total</div>
          <div style={{ fontSize: 54, fontWeight: 950, letterSpacing: -1, marginTop: 6 }}>{loading ? "…" : fmtInt(totalYear)}</div>

          <div style={{ marginTop: 10 }}>
            {baseYear && totalBase ? (
              <span
                style={{
                  display: "inline-flex",
                  padding: "10px 14px",
                  borderRadius: 999,
                  fontWeight: 950,
                  border: "1px solid rgba(0,0,0,.12)",
                  background: "rgba(28, 189, 141, .12)",
                  color: "rgba(0,0,0,.75)",
                }}
              >
                {delta === null ? "—" : `${delta >= 0 ? "+" : ""}${fmtPct(delta)}%`} vs {baseYear}
              </span>
            ) : (
              <span style={{ opacity: 0.6, fontWeight: 700 }}>{baseYear ? "Sin base " + baseYear : "Sin base"}</span>
            )}
          </div>

          <div style={{ marginTop: 14, opacity: 0.7, fontWeight: 800 }}>Composición</div>
        </div>

        {/* LISTA + BARRAS */}
        <div className="card" style={{ padding: 18, borderRadius: 22 }}>
          {loading ? (
            <div style={{ opacity: 0.7, fontWeight: 800 }}>Cargando membership…</div>
          ) : list.length === 0 ? (
            <div style={{ opacity: 0.7, fontWeight: 800 }}>
              Sin datos para {hotelFilter} en {year}. <br />
              Años disponibles: {availableYears.length ? availableYears.join(", ") : "—"}
            </div>
          ) : (
            <div style={{ display: "grid", gap: compactCharts ? 10 : 14 }}>
              {list.slice(0, 12).map((it) => {
                const w = Math.max(0, Math.min(100, (it.curVal / maxVal) * 100));
                const c = colorFor(it.k);
                return (
                  <div
                    key={it.k}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(140px, 220px) 1fr minmax(70px, 90px)",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontWeight: 900, color: "rgba(0,0,0,.78)" }}>
                      {it.k}
                      <div style={{ marginTop: 3, opacity: 0.65, fontWeight: 800, fontSize: 13 }}>
                        {fmtPct(it.share)}% del total
                      </div>
                    </div>

                    <div
                      style={{
                        height: compactCharts ? 10 : 12,
                        borderRadius: 999,
                        background: "rgba(0,0,0,.08)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${w}%`,
                          height: "100%",
                          borderRadius: 999,
                          background: c,
                        }}
                      />
                    </div>

                    <div style={{ textAlign: "right", fontWeight: 950 }}>{fmtInt(it.curVal)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
