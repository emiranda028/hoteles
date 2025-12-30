"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useCsvClient, num, pct } from "./useCsvClient";

type Props = {
  filePath: string;   // "/data/hf_diario.csv"
  year: number;       // 2025
  baseYear: number;   // 2024
  hotelFilter: string; // "" => todos (JCR), "MARRIOTT" / "SHERATON BCR" / "SHERATON MDQ" / "MAITEI"
};

type Row = Record<string, any>;
type Grain = "year" | "quarter" | "month";

const card: React.CSSProperties = {
  padding: "1rem",
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,.08)",
  background: "rgba(255,255,255,.03)",
};

const subtle: React.CSSProperties = { opacity: 0.82 };

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function fmtMoneyUSD0(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function fmtPct01(n: number) {
  return (n * 100).toFixed(1) + "%";
}
function fmtInt(n: number) {
  return Math.round(n).toLocaleString("es-AR");
}

function parseDateSmart(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;

  const s = String(v).trim();
  if (!s) return null;

  // dd/mm/yyyy (Fecha)
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    const yy = Number(m1[3]);
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // dd-mm-yy (Date con texto tipo "01-06-22 Wed")
  const token = s.split(" ")[0];
  const m2 = token.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (m2) {
    const dd = Number(m2[1]);
    const mm = Number(m2[2]);
    let yy = Number(m2[3]);
    if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  const d3 = new Date(s);
  return isNaN(d3.getTime()) ? null : d3;
}

function pickKey(keys: string[], candidates: string[]) {
  const norm = (x: string) => x.toLowerCase().replace(/\s+/g, "");
  const map = new Map(keys.map((k) => [norm(k), k]));
  for (const c of candidates) {
    const hit = map.get(norm(c));
    if (hit) return hit;
  }
  return "";
}

function getQuarter(d: Date): 1 | 2 | 3 | 4 {
  return (Math.floor(d.getMonth() / 3) + 1) as any;
}

function monthKey(d: Date) {
  const m = d.getMonth() + 1;
  return `${d.getFullYear()}-${String(m).padStart(2, "0")}`;
}

function monthLabelES(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const names = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return `${names[(m ?? 1) - 1] ?? "—"} ${y ?? ""}`;
}

function weekdayLabelES(d: Date) {
  const labels = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  return labels[d.getDay()] ?? "—";
}

function average(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function sum(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0);
}

function groupBy<T>(items: T[], keyFn: (t: T) => string) {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = keyFn(it);
    const b = m.get(k);
    if (b) b.push(it);
    else m.set(k, [it]);
  }
  return m;
}

/* =========================================
   KPIs
   - Ocupación: promedio de Occ.% (como % diario)
   - ADR: promedio Average Rate
   - RevPAR: ADR * Ocupación
   - Room Revenue: suma Room Revenue
   - Doble ocupación: promedio (Adl.&Chl / Total Occ.)
========================================= */

function computeKpis(rows: Row[], keys: {
  kOcc: string;
  kAdr: string;
  kRev: string;
  kTotOcc: string;
  kAdl: string;
}) {
  const occDaily01 = rows.map(r => pct(num(r[keys.kOcc])));      // 0..1
  const adr = rows.map(r => num(r[keys.kAdr]));
  const rev = rows.map(r => num(r[keys.kRev]));
  const totOcc = rows.map(r => num(r[keys.kTotOcc]));
  const adl = rows.map(r => num(r[keys.kAdl]));

  const occ = average(occDaily01);                               // 0..1
  const adrAvg = average(adr);
  const roomRev = sum(rev);

  // Doble ocupación = personas / habitaciones ocupadas (Total Occ.)
  const doubleOcc = average(
    rows.map((r, i) => {
      const denom = totOcc[i] || 0;
      return denom > 0 ? (adl[i] || 0) / denom : 0;
    })
  );

  const revpar = adrAvg * occ;

  return {
    occ, adr: adrAvg, roomRev, revpar, doubleOcc,
    days: rows.length,
  };
}

function deltaPct(now: number, base: number) {
  if (!base) return 0;
  return (now - base) / base;
}

/* =========================================
   UI helpers (sin libs)
========================================= */

function Pill({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent?: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        minWidth: 210,
        padding: ".85rem 1rem",
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,.10)",
        background: accent ? accent : "rgba(255,255,255,.04)",
        boxShadow: "0 12px 30px rgba(0,0,0,.25)",
      }}
    >
      <div style={{ fontSize: ".9rem", opacity: 0.88 }}>{label}</div>
      <div style={{ fontSize: "1.55rem", fontWeight: 950, marginTop: ".15rem" }}>{value}</div>
      {sub ? <div style={{ marginTop: ".2rem", fontSize: ".9rem", opacity: 0.85 }}>{sub}</div> : null}
    </div>
  );
}

function SectionTitle({ title, desc }: { title: string; desc?: string }) {
  return (
    <div style={{ display: "grid", gap: ".25rem" }}>
      <div style={{ fontSize: "1.25rem", fontWeight: 950 }}>{title}</div>
      {desc ? <div style={{ ...subtle }}>{desc}</div> : null}
    </div>
  );
}

/* =========================================
   Component
========================================= */

export default function YearComparator({ filePath, year, baseYear, hotelFilter }: Props) {
  const { rows, loading, error } = useCsvClient(filePath);

  // Detecto columnas
  const keys = useMemo(() => {
    const k = Object.keys(rows?.[0] ?? {});
    const kHotel = pickKey(k, ["Empresa", "Hotel"]);
    const kHof = pickKey(k, ["HoF", "Hof"]);
    const kFecha = pickKey(k, ["Fecha"]);
    const kDate = pickKey(k, ["Date"]);
    const kOcc = pickKey(k, ["Occ.%", "Occ %", "Occupancy", "Occupancy %", "Occ"]);
    const kRev = pickKey(k, ["Room Revenue", "Rooms Revenue", "RoomRevenue"]);
    const kAdr = pickKey(k, ["Average Rate", "ADR", "Avg Rate"]);
    const kTotOcc = pickKey(k, ['Total Occ.', "Total Occ", "Total Occ Rooms", "Rooms Occ"]);
    const kAdl = pickKey(k, ['Adl. & Chl.', "Adl & Chl", "Adults", "Adults & Children"]);
    const kArr = pickKey(k, ["Arr. Rooms", "Arr Rooms"]);
    const kDep = pickKey(k, ["Dep. Rooms", "Dep Rooms"]);
    return {
      kHotel, kHof, kFecha, kDate, kOcc, kRev, kAdr, kTotOcc, kAdl, kArr, kDep,
      ok: !!(kHotel && (kFecha || kDate) && kOcc),
    };
  }, [rows]);

  // Normalización + filtro
  const normalized = useMemo(() => {
    if (!rows?.length || !keys.ok) return [];

    const res: Array<Row & { __d: Date; __y: number; __m: number; __q: number; __hotel: string; __hof: string }> = [];

    for (const r of rows) {
      const hotel = String(r[keys.kHotel] ?? "").trim();
      if (!hotel) continue;

      const hof = String(r[keys.kHof] ?? "").trim(); // "History" / "Forecast" (según tu archivo)
      const d = parseDateSmart(r[keys.kFecha] ?? r[keys.kDate]);
      if (!d) continue;

      // filtro por hotel exacto
      if (hotelFilter && hotelFilter.trim() && hotel !== hotelFilter.trim()) continue;

      res.push({
        ...r,
        __hotel: hotel,
        __hof: hof,
        __d: d,
        __y: d.getFullYear(),
        __m: d.getMonth() + 1,
        __q: getQuarter(d),
      });
    }

    return res;
  }, [rows, keys, hotelFilter]);

  // Por año seleccionado: para H&F mezclamos History+Forecast si existe (como en tu CSV)
  const byYear = useMemo(() => normalized.filter(r => r.__y === year), [normalized, year]);
  const byBase = useMemo(() => normalized.filter(r => r.__y === baseYear), [normalized, baseYear]);

  // Estados internos (para H&F)
  const [grain, setGrain] = useState<Grain>("month");

  // Carrousel auto
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 3500);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <div style={card}>
        <b>Cargando H&F…</b>
        <div style={{ ...subtle, marginTop: ".35rem" }}>Leyendo {filePath}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={card}>
        <b>Error leyendo H&F</b>
        <div style={{ marginTop: ".35rem", ...subtle }}>{String(error)}</div>
        <div style={{ marginTop: ".5rem", fontSize: ".9rem", opacity: 0.8 }}>
          Path: <code>{filePath}</code>
        </div>
      </div>
    );
  }

  if (!keys.ok) {
    return (
      <div style={card}>
        <b>Sin datos / columnas no detectadas</b>
        <div style={{ marginTop: ".35rem", ...subtle }}>
          No pude detectar Empresa + Fecha/Date + Occ.%.
        </div>
        <div style={{ marginTop: ".5rem", fontSize: ".9rem", opacity: 0.8 }}>
          Detectado: empresa=<code>{keys.kHotel || "—"}</code> · fecha=<code>{keys.kFecha || keys.kDate || "—"}</code> ·
          occ=<code>{keys.kOcc || "—"}</code>
        </div>
      </div>
    );
  }

  // KPIs year/baseYear
  const kpiNow = useMemo(() => computeKpis(byYear, {
    kOcc: keys.kOcc, kAdr: keys.kAdr, kRev: keys.kRev, kTotOcc: keys.kTotOcc, kAdl: keys.kAdl
  }), [byYear, keys]);

  const kpiBase = useMemo(() => computeKpis(byBase, {
    kOcc: keys.kOcc, kAdr: keys.kAdr, kRev: keys.kRev, kTotOcc: keys.kTotOcc, kAdl: keys.kAdl
  }), [byBase, keys]);

  const hotelLabel = useMemo(() => (hotelFilter?.trim() ? hotelFilter.trim() : "Todos"), [hotelFilter]);

  // KPI cards (degradé suave por grupo, sin hardcode de marca)
  const accentA = "linear-gradient(135deg, rgba(255,255,255,.12), rgba(255,255,255,.04))";
  const accentB = "linear-gradient(135deg, rgba(255,255,255,.10), rgba(255,255,255,.03))";
  const accentC = "linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))";

  const carouselItems = useMemo(() => {
    const occ = fmtPct01(kpiNow.occ);
    const adr = fmtMoneyUSD0(kpiNow.adr);
    const revpar = fmtMoneyUSD0(kpiNow.revpar);
    const dbl = (kpiNow.doubleOcc || 0).toFixed(2);

    const occD = fmtPct01(deltaPct(kpiNow.occ, kpiBase.occ));
    const adrD = (deltaPct(kpiNow.adr, kpiBase.adr) * 100).toFixed(1) + "%";
    const revparD = (deltaPct(kpiNow.revpar, kpiBase.revpar) * 100).toFixed(1) + "%";

    return [
      { label: "Ocupación", value: occ, sub: `vs ${baseYear}: ${occD}`, accent: accentA },
      { label: "ADR", value: adr, sub: `vs ${baseYear}: ${adrD}`, accent: accentB },
      { label: "RevPAR (ADR×Occ)", value: revpar, sub: `vs ${baseYear}: ${revparD}`, accent: accentC },
      { label: "Doble ocupación", value: dbl, sub: "Personas por hab. ocupada", accent: accentB },
      { label: "Room Revenue", value: fmtMoneyUSD0(kpiNow.roomRev), sub: `Días: ${kpiNow.days}`, accent: accentC },
    ];
  }, [kpiNow, kpiBase, baseYear]);

  const carouselIndex = useMemo(() => {
    if (!carouselItems.length) return 0;
    return ((tick % carouselItems.length) + carouselItems.length) % carouselItems.length;
  }, [tick, carouselItems.length]);

  // Comparativa KPIs (tabla)
  const compareRows = useMemo(() => {
    return [
      {
        k: "Ocupación",
        now: kpiNow.occ,
        base: kpiBase.occ,
        fmt: (n: number) => fmtPct01(n),
      },
      {
        k: "ADR",
        now: kpiNow.adr,
        base: kpiBase.adr,
        fmt: (n: number) => fmtMoneyUSD0(n),
      },
      {
        k: "RevPAR",
        now: kpiNow.revpar,
        base: kpiBase.revpar,
        fmt: (n: number) => fmtMoneyUSD0(n),
      },
      {
        k: "Doble ocupación",
        now: kpiNow.doubleOcc,
        base: kpiBase.doubleOcc,
        fmt: (n: number) => (n || 0).toFixed(2),
      },
      {
        k: "Room Revenue",
        now: kpiNow.roomRev,
        base: kpiBase.roomRev,
        fmt: (n: number) => fmtMoneyUSD0(n),
      },
    ];
  }, [kpiNow, kpiBase]);

  // Series H&F por grain (Año/Trim/Mes)
  const series = useMemo(() => {
    const src = byYear;
    if (!src.length) return { labels: [] as string[], occ: [] as number[], adr: [] as number[], revpar: [] as number[] };

    const keyFn = (r: any) => {
      if (grain === "year") return String(r.__y);
      if (grain === "quarter") return `${r.__y}-Q${r.__q}`;
      return `${r.__y}-${String(r.__m).padStart(2, "0")}`;
    };

    const g = groupBy(src, keyFn);
    const labels = Array.from(g.keys()).sort((a, b) => a.localeCompare(b));

    const occ: number[] = [];
    const adr: number[] = [];
    const revpar: number[] = [];

    for (const lab of labels) {
      const bucket = g.get(lab) ?? [];
      const k = computeKpis(bucket, {
        kOcc: keys.kOcc, kAdr: keys.kAdr, kRev: keys.kRev, kTotOcc: keys.kTotOcc, kAdl: keys.kAdl
      });
      occ.push(k.occ);
      adr.push(k.adr);
      revpar.push(k.revpar);
    }

    return { labels, occ, adr, revpar };
  }, [byYear, grain, keys]);

  // Ranking de meses por OCUPACIÓN (promedio Occ.%)
  const monthRanking = useMemo(() => {
    const src = byYear;
    const g = groupBy(src, (r: any) => monthKey(r.__d));
    const rowsOut: Array<{ key: string; label: string; occ: number; days: number }> = [];

    for (const [k, bucket] of g.entries()) {
      const occAvg = average(bucket.map((r: any) => pct(num(r[keys.kOcc]))));
      const [yy, mm] = k.split("-").map(Number);
      rowsOut.push({
        key: k,
        label: monthLabelES(k),
        occ: occAvg,
        days: bucket.length,
      });
    }

    rowsOut.sort((a, b) => b.occ - a.occ);
    return rowsOut;
  }, [byYear, keys]);

  // Ranking de días de semana por OCUPACIÓN
  const weekdayRanking = useMemo(() => {
    const src = byYear;
    const g = groupBy(src, (r: any) => String(r.__d.getDay())); // 0..6
    const out: Array<{ day: number; label: string; occ: number; days: number }> = [];

    for (const [k, bucket] of g.entries()) {
      const day = Number(k);
      const occAvg = average(bucket.map((r: any) => pct(num(r[keys.kOcc]))));
      out.push({
        day,
        label: weekdayLabelES(bucket[0].__d),
        occ: occAvg,
        days: bucket.length,
      });
    }

    out.sort((a, b) => b.occ - a.occ);
    return out;
  }, [byYear, keys]);

  // Mini chart (barra simple) sin libs
  function BarRow({ label, value01, sub }: { label: string; value01: number; sub?: string }) {
    const w = clamp(value01, 0, 1) * 100;
    return (
      <div style={{ display: "grid", gap: ".35rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem" }}>
          <div style={{ fontWeight: 800 }}>{label}</div>
          <div style={{ opacity: 0.9 }}>{fmtPct01(value01)}</div>
        </div>
        <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
          <div style={{ width: `${w}%`, height: "100%", background: "rgba(255,255,255,.35)" }} />
        </div>
        {sub ? <div style={{ fontSize: ".9rem", opacity: 0.8 }}>{sub}</div> : null}
      </div>
    );
  }

  return (
    <section style={{ display: "grid", gap: "1rem" }}>
      {/* Encabezado */}
      <div style={card}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: ".75rem", alignItems: "baseline", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "1.35rem", fontWeight: 950 }}>
              History & Forecast — {hotelLabel}
            </div>
            <div style={{ marginTop: ".25rem", ...subtle }}>
              Año {year} · Comparación vs {baseYear} · Fuente: <code>{filePath}</code>
            </div>
          </div>

          {/* selector granularidad */}
          <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
            {(["month","quarter","year"] as Grain[]).map((g) => {
              const active = g === grain;
              return (
                <button
                  key={g}
                  onClick={() => setGrain(g)}
                  style={{
                    cursor: "pointer",
                    padding: ".45rem .7rem",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,.16)",
                    background: active ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.06)",
                    color: "white",
                    fontWeight: 850,
                  }}
                >
                  {g === "month" ? "Mes" : g === "quarter" ? "Trimestre" : "Año"}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Carrousel KPIs */}
      <div style={card}>
        <SectionTitle
          title="KPIs destacados"
          desc="Se actualiza solo. KPIs calculados desde H&F (Ocupación/ADR/RevPAR/Doble ocupación/Revenue)."
        />

        <div style={{ marginTop: ".85rem", display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
          {/* el “main” */}
          <Pill
            label={carouselItems[carouselIndex]?.label ?? "—"}
            value={carouselItems[carouselIndex]?.value ?? "—"}
            sub={carouselItems[carouselIndex]?.sub ?? ""}
            accent={carouselItems[carouselIndex]?.accent ?? undefined}
          />
          {/* extras */}
          {carouselItems
            .filter((_, i) => i !== carouselIndex)
            .slice(0, 3)
            .map((it, idx) => (
              <div key={idx} style={{ opacity: 0.85 }}>
                <Pill label={it.label} value={it.value} sub={it.sub} accent={"rgba(255,255,255,.04)"} />
              </div>
            ))}
        </div>
      </div>

      {/* Comparativa */}
      <div style={card}>
        <SectionTitle title="Comparativa de indicadores" desc={`Comparación acumulada ${year} vs ${baseYear}.`} />

        <div style={{ marginTop: ".85rem", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: ".6rem .5rem", borderBottom: "1px solid rgba(255,255,255,.10)" }}>Indicador</th>
                <th style={{ textAlign: "right", padding: ".6rem .5rem", borderBottom: "1px solid rgba(255,255,255,.10)" }}>{year}</th>
                <th style={{ textAlign: "right", padding: ".6rem .5rem", borderBottom: "1px solid rgba(255,255,255,.10)" }}>{baseYear}</th>
                <th style={{ textAlign: "right", padding: ".6rem .5rem", borderBottom: "1px solid rgba(255,255,255,.10)" }}>Δ</th>
              </tr>
            </thead>
            <tbody>
              {compareRows.map((r) => {
                const d = deltaPct(r.now, r.base);
                const pos = d >= 0;
                return (
                  <tr key={r.k}>
                    <td style={{ padding: ".6rem .5rem", borderBottom: "1px solid rgba(255,255,255,.06)", fontWeight: 850 }}>
                      {r.k}
                    </td>
                    <td style={{ padding: ".6rem .5rem", textAlign: "right", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                      {r.fmt(r.now)}
                    </td>
                    <td style={{ padding: ".6rem .5rem", textAlign: "right", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                      {r.fmt(r.base)}
                    </td>
                    <td
                      style={{
                        padding: ".6rem .5rem",
                        textAlign: "right",
                        borderBottom: "1px solid rgba(255,255,255,.06)",
                        fontWeight: 900,
                        color: pos ? "rgba(255,255,255,.92)" : "rgba(255,255,255,.92)",
                      }}
                    >
                      {(d * 100).toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Series por granularidad (listado + bar) */}
      <div style={card}>
        <SectionTitle title="H&F por período" desc="Ocupación promedio por período (según selector). ADR y RevPAR quedan listados abajo." />

        <div style={{ marginTop: ".85rem", display: "grid", gap: ".8rem" }}>
          {series.labels.length ? (
            series.labels.map((lab, i) => {
              const label =
                grain === "month"
                  ? monthLabelES(lab)
                  : grain === "quarter"
                  ? lab.replace("-", " ")
                  : lab;

              return (
                <div key={lab} style={{ padding: ".75rem", borderRadius: 14, border: "1px solid rgba(255,255,255,.08)" }}>
                  <BarRow
                    label={label}
                    value01={series.occ[i] ?? 0}
                    sub={`ADR ${fmtMoneyUSD0(series.adr[i] ?? 0)} · RevPAR ${fmtMoneyUSD0(series.revpar[i] ?? 0)}`}
                  />
                </div>
              );
            })
          ) : (
            <div style={{ ...subtle }}>
              Sin datos para {year}. (Filtro: {hotelLabel})
            </div>
          )}
        </div>
      </div>

      {/* Ranking meses por ocupación */}
      <div style={card}>
        <SectionTitle
          title="Ranking de meses (por ocupación)"
          desc="Ranking por % de ocupación (promedio diario), evitando sesgos por ajustes contables."
        />

        <div style={{ marginTop: ".85rem", display: "grid", gap: ".6rem" }}>
          {monthRanking.length ? (
            monthRanking.slice(0, 12).map((m, idx) => (
              <div
                key={m.key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "42px 1fr 110px 90px",
                  gap: ".65rem",
                  alignItems: "center",
                  padding: ".55rem .65rem",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,.08)",
                  background: "rgba(255,255,255,.02)",
                }}
              >
                <div style={{ fontWeight: 950, opacity: 0.9 }}>#{idx + 1}</div>
                <div style={{ fontWeight: 850 }}>{m.label}</div>
                <div style={{ textAlign: "right", fontWeight: 950 }}>{fmtPct01(m.occ)}</div>
                <div style={{ textAlign: "right", opacity: 0.85 }}>{m.days} días</div>
              </div>
            ))
          ) : (
            <div style={{ ...subtle }}>Sin datos para ranking de meses.</div>
          )}
        </div>
      </div>

      {/* Ranking días de semana */}
      <div style={card}>
        <SectionTitle
          title="Ranking de días de la semana (por ocupación)"
          desc="Promedio de ocupación por día (Domingo a Sábado) para detectar oportunidades."
        />

        <div style={{ marginTop: ".85rem", display: "grid", gap: ".6rem" }}>
          {weekdayRanking.length ? (
            weekdayRanking.map((d, idx) => (
              <div
                key={d.day}
                style={{
                  display: "grid",
                  gridTemplateColumns: "42px 1fr 110px 90px",
                  gap: ".65rem",
                  alignItems: "center",
                  padding: ".55rem .65rem",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,.08)",
                  background: "rgba(255,255,255,.02)",
                }}
              >
                <div style={{ fontWeight: 950, opacity: 0.9 }}>#{idx + 1}</div>
                <div style={{ fontWeight: 850 }}>{d.label}</div>
                <div style={{ textAlign: "right", fontWeight: 950 }}>{fmtPct01(d.occ)}</div>
                <div style={{ textAlign: "right", opacity: 0.85 }}>{d.days} días</div>
              </div>
            ))
          ) : (
            <div style={{ ...subtle }}>Sin datos para ranking de días.</div>
          )}
        </div>
      </div>
    </section>
  );
}

/* Small pill component (local) */
function Pill({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent?: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        minWidth: 220,
        padding: ".9rem 1rem",
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,.10)",
        background: accent ?? "rgba(255,255,255,.04)",
        boxShadow: "0 12px 30px rgba(0,0,0,.25)",
      }}
    >
      <div style={{ fontSize: ".92rem", opacity: 0.88 }}>{label}</div>
      <div style={{ fontSize: "1.6rem", fontWeight: 950, marginTop: ".12rem" }}>{value}</div>
      {sub ? <div style={{ marginTop: ".25rem", fontSize: ".92rem", opacity: 0.85 }}>{sub}</div> : null}
    </div>
  );
}

function SectionTitle({ title, desc }: { title: string; desc?: string }) {
  return (
    <div style={{ display: "grid", gap: ".25rem" }}>
      <div style={{ fontSize: "1.25rem", fontWeight: 950 }}>{title}</div>
      {desc ? <div style={{ opacity: 0.82 }}>{desc}</div> : null}
    </div>
  );
}
