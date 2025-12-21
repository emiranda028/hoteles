"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

export type MembershipHotelFilter = "JCR" | "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ";

type Props = {
  title: string;
  year: number;
  baseYear: number;
  filePath: string;
  allowedHotels: string[]; // normalmente JCR_HOTELS
  hotelFilter?: MembershipHotelFilter; // si no se pasa => "JCR"
  compactCharts?: boolean;
};

type Row = {
  year: number;
  month: number; // 1-12
  hotel: "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ";
  membership: string;
  qty: number;
};

function normStr(v: any) {
  return String(v ?? "").trim();
}

function upperClean(v: any) {
  return normStr(v).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function parseNumLoose(v: any): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const cleaned = s
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseDateLoose(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  const s = String(v).trim();
  if (!s) return null;

  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  const m1 = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]) - 1;
    const yy = Number(m1[3].length === 2 ? "20" + m1[3] : m1[3]);
    const dt = new Date(yy, mm, dd);
    return isNaN(dt.getTime()) ? null : dt;
  }

  return null;
}

function normHotel(raw: any): Row["hotel"] | "" {
  const s = upperClean(raw);
  if (s.includes("MARRIOTT")) return "MARRIOTT";
  if (s.includes("BARILOCHE") || s.includes("BCR")) return "SHERATON BCR";
  if (s.includes("MAR DEL PLATA") || s.includes("MDQ")) return "SHERATON MDQ";
  return "";
}

function pickKeyInsensitive(obj: any, candidates: string[]) {
  if (!obj) return "";
  const keys = Object.keys(obj);
  const lowerMap = new Map<string, string>();
  for (const k of keys) lowerMap.set(String(k).trim().toLowerCase(), k);

  for (const c of candidates) {
    const hit = lowerMap.get(c.toLowerCase());
    if (hit) return hit;
  }
  return "";
}

function monthFromAny(v: any): number {
  if (typeof v === "number" && v >= 1 && v <= 12) return Math.floor(v);
  const d = parseDateLoose(v);
  if (d) return d.getMonth() + 1;
  const s = String(v ?? "").trim();
  const m = s.match(/-(\d{1,2})-/); // por si viene dd-mm-yy
  if (m) {
    const mm = Number(m[1]);
    if (mm >= 1 && mm <= 12) return mm;
  }
  return 0;
}

function yearFromAny(v: any): number {
  if (typeof v === "number" && v > 1900 && v < 2100) return Math.floor(v);
  const d = parseDateLoose(v);
  if (d) return d.getFullYear();
  const s = String(v ?? "").trim();
  const m = s.match(/(19\d{2}|20\d{2})/);
  if (m) return Number(m[1]);
  return 0;
}

const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function palette(name: string) {
  // colores consistentes por membresía
  const k = upperClean(name);
  if (k.includes("BONVOY") || k.includes("BONBOY")) return "linear-gradient(90deg, rgba(99,102,241,.9), rgba(236,72,153,.85))";
  if (k.includes("HILTON") || k.includes("HONORS")) return "linear-gradient(90deg, rgba(59,130,246,.9), rgba(16,185,129,.85))";
  if (k.includes("ACCOR") || k.includes("ALL")) return "linear-gradient(90deg, rgba(245,158,11,.9), rgba(239,68,68,.85))";
  if (k.includes("WYNDHAM")) return "linear-gradient(90deg, rgba(168,85,247,.9), rgba(59,130,246,.85))";
  return "linear-gradient(90deg, rgba(107,114,128,.7), rgba(17,24,39,.45))";
}

export default function MembershipSummary({
  title,
  year,
  baseYear,
  filePath,
  allowedHotels,
  hotelFilter = "JCR",
  compactCharts = true,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<{ sheet?: string; keys?: string[]; err?: string; detected?: string }>({});

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setMeta({});
        const rr = await readXlsxFromPublic(filePath);
        const raw = rr.rows ?? [];
        const keys = raw.length ? Object.keys(raw[0] ?? {}) : [];

        const kHotel = pickKeyInsensitive(raw[0], ["empresa", "hotel"]);
        const kMember = pickKeyInsensitive(raw[0], ["bonboy", "bonvoy", "membership", "membresia", "membresía"]);
        const kQty = pickKeyInsensitive(raw[0], ["cantidad", "qty", "total", "count"]);
        const kFecha = pickKeyInsensitive(raw[0], ["fecha", "date", "dia", "día"]);

        const detected = `hotel=${kHotel || "—"} · membership=${kMember || "—"} · qty=${kQty || "—"} · fecha=${kFecha || "—"}`;

        const parsed: Row[] = raw
          .map((r: any) => {
            const hotel = normHotel(kHotel ? r[kHotel] : r["Empresa"] ?? r["Hotel"]);
            const membership = normStr(kMember ? r[kMember] : r["Bonboy"] ?? r["Bonvoy"] ?? r["Membership"]);
            const qty = parseNumLoose(kQty ? r[kQty] : r["Cantidad"] ?? r["Qty"] ?? r["Total"]);
            const y = yearFromAny(kFecha ? r[kFecha] : r["Fecha"] ?? r["Date"] ?? r["Año"]);
            const m = monthFromAny(kFecha ? r[kFecha] : r["Fecha"] ?? r["Date"] ?? r["Mes"]);
            if (!hotel || !membership || qty <= 0 || !y || !m) return null;
            return { hotel, membership, qty, year: y, month: m };
          })
          .filter(Boolean) as Row[];

        if (!alive) return;
        setRows(parsed);
        setMeta({ sheet: rr.sheetName, keys, detected });
      } catch (e: any) {
        if (!alive) return;
        setRows([]);
        setMeta({ err: String(e?.message ?? e) });
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [filePath]);

  const hotelsToUse = useMemo(() => {
    if (hotelFilter === "JCR") return allowedHotels;
    // individual
    return [hotelFilter];
  }, [hotelFilter, allowedHotels]);

  const yearRows = useMemo(() => {
    return rows.filter((r) => r.year === year && hotelsToUse.includes(r.hotel));
  }, [rows, year, hotelsToUse]);

  const baseRows = useMemo(() => {
    return rows.filter((r) => r.year === baseYear && hotelsToUse.includes(r.hotel));
  }, [rows, baseYear, hotelsToUse]);

  const sumByMonthAndMembership = (list: Row[]) => {
    const m = new Map<string, number[]>();
    for (const r of list) {
      const key = r.membership.trim() || "OTRAS";
      if (!m.has(key)) m.set(key, Array(12).fill(0));
      const arr = m.get(key)!;
      arr[r.month - 1] += r.qty;
    }
    return m;
  };

  const curMap = useMemo(() => sumByMonthAndMembership(yearRows), [yearRows]);
  const baseMap = useMemo(() => sumByMonthAndMembership(baseRows), [baseRows]);

  const memberships = useMemo(() => {
    const set = new Set<string>();
    for (const k of Array.from(curMap.keys())) set.add(k);
    for (const k of Array.from(baseMap.keys())) set.add(k);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [curMap, baseMap]);

  const curTotal = useMemo(() => {
    let t = 0;
    for (const arr of Array.from(curMap.values())) for (let i = 0; i < 12; i++) t += arr[i];
    return t;
  }, [curMap]);

  const baseTotal = useMemo(() => {
    let t = 0;
    for (const arr of Array.from(baseMap.values())) for (let i = 0; i < 12; i++) t += arr[i];
    return t;
  }, [baseMap]);

  const monthlyTotals = useMemo(() => {
    const cur = Array(12).fill(0);
    const base = Array(12).fill(0);
    for (const arr of Array.from(curMap.values())) for (let i = 0; i < 12; i++) cur[i] += arr[i];
    for (const arr of Array.from(baseMap.values())) for (let i = 0; i < 12; i++) base[i] += arr[i];
    return { cur, base };
  }, [curMap, baseMap]);

  if (loading) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
        <div className="cardTitle">{title}</div>
        <div className="cardNote" style={{ marginTop: ".35rem" }}>
          Cargando <code>{filePath}</code>…
        </div>
      </div>
    );
  }

  if (meta.err) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
        <div className="cardTitle">{title}</div>
        <div className="delta down" style={{ marginTop: ".5rem" }}>{meta.err}</div>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
        <div className="cardTitle">{title}</div>
        <div className="cardNote" style={{ marginTop: ".35rem" }}>
          Sin filas parseadas. {meta.detected ? <>Detectado: <code>{meta.detected}</code></> : null}
        </div>
        <div className="cardNote" style={{ marginTop: ".35rem" }}>
          Keys ejemplo: <code>{(meta.keys ?? []).slice(0, 12).join(", ")}</code>
        </div>
      </div>
    );
  }

  // si no hay datos para el año elegido
  if (!yearRows.length) {
    const years = Array.from(new Set(rows.map((r) => r.year))).sort((a, b) => b - a);
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
        <div className="cardTitle">{title} — Acumulado {year} · vs {baseYear}</div>
        <div className="cardNote" style={{ marginTop: ".35rem" }}>
          Sin datos para {hotelFilter} en {year}.
        </div>
        <div className="cardNote" style={{ marginTop: ".35rem" }}>
          Años disponibles: <code>{years.length ? years.join(", ") : "—"}</code>
        </div>
        <div className="cardNote" style={{ marginTop: ".35rem" }}>
          Detectado: <code>{meta.detected ?? "—"}</code>
        </div>
      </div>
    );
  }

  const chartHeight = compactCharts ? 120 : 220;

  return (
    <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
      <div className="cardTitle">
        {title} — Acumulado {year} · vs {baseYear}
      </div>

      <div className="cardNote" style={{ marginTop: ".35rem" }}>
        Filtro: <b>{hotelFilter}</b> · Total {year}: <b>{curTotal.toLocaleString("es-AR")}</b>
        {baseTotal ? <> · Base {baseYear}: <b>{baseTotal.toLocaleString("es-AR")}</b></> : <> · Sin base {baseYear}</>}
      </div>

      {/* Tabla mensual */}
      <div style={{ marginTop: ".9rem", overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", minWidth: 760 }}>
          <thead>
            <tr>
              <th>Año</th>
              {MONTHS.map((m) => <th key={m}>{m}</th>)}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><b>{year}</b></td>
              {monthlyTotals.cur.map((v, i) => <td key={i}>{v.toLocaleString("es-AR")}</td>)}
              <td><b>{curTotal.toLocaleString("es-AR")}</b></td>
            </tr>
            <tr>
              <td style={{ color: "var(--muted)" }}>{baseYear}</td>
              {monthlyTotals.base.map((v, i) => <td key={i} style={{ color: "var(--muted)" }}>{v ? v.toLocaleString("es-AR") : "0"}</td>)}
              <td style={{ color: "var(--muted)" }}><b>{baseTotal.toLocaleString("es-AR")}</b></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Composición por membresía */}
      <div style={{ marginTop: "1rem" }}>
        <div className="cardTitle" style={{ fontSize: "1rem" }}>Composición</div>

        <div
          style={{
            marginTop: ".75rem",
            display: "grid",
            gap: ".75rem",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          }}
          className="gridResponsive2"
        >
          {memberships.map((m) => {
            const cur = curMap.get(m) ?? Array(12).fill(0);
            const sum = cur.reduce((a, b) => a + b, 0);
            const pct = curTotal ? (sum / curTotal) * 100 : 0;

            return (
              <div
                key={m}
                style={{
                  border: "1px solid rgba(0,0,0,.06)",
                  background: "rgba(0,0,0,.02)",
                  borderRadius: 18,
                  padding: ".85rem",
                  overflow: "hidden",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", alignItems: "baseline" }}>
                  <div style={{ fontWeight: 950, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{m}</div>
                  <div style={{ fontWeight: 950 }}>{sum.toLocaleString("es-AR")}</div>
                </div>

                <div style={{ color: "var(--muted)", fontSize: ".9rem", marginTop: ".15rem" }}>
                  {pct.toFixed(1).replace(".", ",")}% del total
                </div>

                {/* mini chart */}
                <div style={{ marginTop: ".65rem", height: chartHeight, display: "grid", gap: 6, alignItems: "end" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 6, height: chartHeight }}>
                    {cur.map((v, i) => {
                      const max = Math.max(...cur, 1);
                      const h = (v / max) * (chartHeight - 10);
                      return (
                        <div key={i} style={{ display: "grid", alignItems: "end" }}>
                          <div
                            title={`${MONTHS[i]}: ${v}`}
                            style={{
                              height: Math.max(6, h),
                              borderRadius: 10,
                              background: palette(m),
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <style jsx>{`
          @media (max-width: 900px) {
            .gridResponsive2 {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
