"use client";

import React, { useMemo, useState } from "react";
import SectionTitle from "./ui/SectionTitle";
import Pill from "./ui/Pill";
import { useCsvClient, num, pct01, CsvRow, safeDiv } from "./useCsvClient";
import KpiCarousel from "./KpiCarousel";


/* =========================================================
   Props
========================================================= */

type Props = {
  filePath: string;
  year: number;
  baseYear: number;

  /** "" => todos; si viene "MAITEI" => sólo ese */
  hotelFilter: string;
};

/* =========================================================
   Helpers (keys, fechas, normalización)
========================================================= */

function normKey(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/[“”"]/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickKey(keys: string[], candidates: string[]): string {
  const K = keys.map((k) => ({ raw: k, n: normKey(k) }));

  for (const c of candidates) {
    const cn = normKey(c);
    const hit = K.find((x) => x.n === cn);
    if (hit) return hit.raw;
  }
  for (const c of candidates) {
    const cn = normKey(c);
    const hit = K.find((x) => x.n.includes(cn));
    if (hit) return hit.raw;
  }
  return "";
}

function parseDateSmart(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;

  const s = String(v).trim();
  if (!s) return null;

  // dd/mm/yyyy (preferido)
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    const yy = Number(m1[3]);
    const d = new Date(yy, mm - 1, dd);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // dd-mm-yy (Date tipo "01-06-22 Wed")
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (m2) {
    const dd = Number(m2[1]);
    const mm = Number(m2[2]);
    let yy = Number(m2[3]);
    if (yy < 100) yy = 2000 + yy;
    const d = new Date(yy, mm - 1, dd);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t);

  return null;
}

function monthName(m: number): string {
  return ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][m] ?? String(m + 1);
}

function quarterOfMonth(m: number): 1 | 2 | 3 | 4 {
  if (m <= 2) return 1;
  if (m <= 5) return 2;
  if (m <= 8) return 3;
  return 4;
}

function weekdayName(d: number): string {
  return ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][d] ?? String(d);
}

function formatMoneyUsd(n: number): string {
  return (n || 0).toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatPct01(n: number): string {
  return ((n || 0) * 100).toFixed(1) + "%";
}

function deltaPct(cur: number, base: number): number {
  if (!base) return 0;
  return (cur - base) / base;
}

function toneForHotel(hotelFilter: string): "red" | "blue" | "neutral" {
  return String(hotelFilter ?? "").toUpperCase() === "MAITEI" ? "blue" : "red";
}

function medalForRank(i: number): string {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return "";
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function niceMoneyShort(n: number): string {
  const v = Number(n || 0);
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `USD ${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `USD ${(v / 1_000).toFixed(0)}k`;
  return formatMoneyUsd(v);
}

function rankChipBg(tone: "red" | "blue" | "neutral", idx: number): string {
  const base =
    tone === "blue"
      ? ["rgba(59,130,246,.95)", "rgba(14,165,233,.85)", "rgba(56,189,248,.75)"]
      : tone === "red"
      ? ["rgba(220,38,38,.95)", "rgba(244,63,94,.85)", "rgba(251,113,133,.75)"]
      : ["rgba(255,255,255,.30)", "rgba(255,255,255,.18)", "rgba(255,255,255,.10)"];

  const a = base[0];
  const b = base[(idx % 3) as 0 | 1 | 2];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

function qBand(q: 1 | 2 | 3 | 4, tone: "red" | "blue" | "neutral") {
  // banda distinta por trimestre (para que “no se vea todo igual”)
  const mapRed = {
    1: "linear-gradient(90deg, rgba(220,38,38,.95), rgba(251,113,133,.55))",
    2: "linear-gradient(90deg, rgba(249,115,22,.95), rgba(251,113,133,.40))",
    3: "linear-gradient(90deg, rgba(168,85,247,.95), rgba(244,63,94,.40))",
    4: "linear-gradient(90deg, rgba(59,130,246,.95), rgba(244,63,94,.35))",
  } as const;

  const mapBlue = {
    1: "linear-gradient(90deg, rgba(59,130,246,.95), rgba(14,165,233,.55))",
    2: "linear-gradient(90deg, rgba(14,165,233,.95), rgba(56,189,248,.45))",
    3: "linear-gradient(90deg, rgba(16,185,129,.95), rgba(59,130,246,.35))",
    4: "linear-gradient(90deg, rgba(168,85,247,.95), rgba(59,130,246,.35))",
  } as const;

  if (tone === "blue") return mapBlue[q];
  if (tone === "red") return mapRed[q];
  return "linear-gradient(90deg, rgba(255,255,255,.30), rgba(255,255,255,.10))";
}

/* =========================================================
   Modelado de filas H&F
========================================================= */

type HfRow = {
  empresa: string;
  hof: string;
  date: Date;
  year: number;
  month: number; // 0..11
  quarter: 1 | 2 | 3 | 4;
  weekday: number; // 0..6

  occRooms: number;
  occPct: number; // 0..1
  roomRevenue: number;
  adr: number;
  adultsChl: number;
};

type Agg = {
  key: string;
  countDays: number;

  sumOccPct: number;
  sumAdr: number;
  sumRev: number;

  sumOccRooms: number;
  sumAdults: number;
};

function emptyAgg(key: string): Agg {
  return {
    key,
    countDays: 0,
    sumOccPct: 0,
    sumAdr: 0,
    sumRev: 0,
    sumOccRooms: 0,
    sumAdults: 0,
  };
}

function addAgg(a: Agg, r: HfRow) {
  a.countDays += 1;
  a.sumOccPct += r.occPct;
  a.sumAdr += r.adr;
  a.sumRev += r.roomRevenue;
  a.sumOccRooms += r.occRooms;
  a.sumAdults += r.adultsChl;
}

function finalizeAgg(a: Agg) {
  const avgOcc = safeDiv(a.sumOccPct, a.countDays);
  const avgAdr = safeDiv(a.sumAdr, a.countDays);

  const doubleOcc = safeDiv(a.sumAdults, a.sumOccRooms);
  const revpar = avgAdr * avgOcc;

  return {
    ...a,
    avgOcc,
    avgAdr,
    doubleOcc,
    revpar,
  };
}

/* =========================================================
   UI blocks
========================================================= */

function Card({
  children,
  style,
}: React.PropsWithChildren<{ style?: React.CSSProperties }>) {
  return (
    <div
      className="card"
      style={{
        padding: "1rem",
        borderRadius: 18,
        background: "rgba(255,255,255,.06)",
        border: "1px solid rgba(255,255,255,.12)",
        boxShadow: "0 16px 34px rgba(0,0,0,.18)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: "red" | "blue" | "neutral";
}) {
  const grad =
    accent === "red"
      ? "linear-gradient(135deg, rgba(220,38,38,.95), rgba(251,113,133,.75))"
      : accent === "blue"
      ? "linear-gradient(135deg, rgba(59,130,246,.95), rgba(14,165,233,.70))"
      : "linear-gradient(135deg, rgba(255,255,255,.22), rgba(255,255,255,.06))";

  return (
    <div
      style={{
        borderRadius: 18,
        padding: "1rem",
        border: "1px solid rgba(255,255,255,.12)",
        background: "rgba(255,255,255,.05)",
        position: "relative",
        overflow: "hidden",
        minHeight: 92,
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: grad, opacity: 0.18 }} />
      <div style={{ position: "relative" }}>
        <div style={{ fontSize: ".92rem", opacity: 0.85, fontWeight: 800 }}>{label}</div>
        <div style={{ fontSize: "1.55rem", fontWeight: 950, marginTop: ".25rem" }}>{value}</div>
        {sub ? <div style={{ marginTop: ".25rem", opacity: 0.75, fontSize: ".92rem" }}>{sub}</div> : null}
      </div>
    </div>
  );
}

/* =========================================================
   Main
========================================================= */

export default function YearComparator({ filePath, year, baseYear, hotelFilter }: Props) {
  const tone = toneForHotel(hotelFilter);
  const { rows, loading, error } = useCsvClient(filePath);

  // filtros locales (por sección)
  const [hofMode, setHofMode] = useState<"ALL" | "HISTORY" | "FORECAST">("ALL");
  const [quarter, setQuarter] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [month, setMonth] = useState<number>(-1); // -1 => todos

  const keys = useMemo(() => Object.keys(rows?.[0] ?? {}), [rows]);

  // keys del CSV
  const kEmpresa = useMemo(() => pickKey(keys, ["Empresa", "Hotel", "Property"]), [keys]);
  const kFecha = useMemo(() => pickKey(keys, ["Fecha", "Date"]), [keys]);
  const kHoF = useMemo(() => pickKey(keys, ["HoF", "Hof", "HOF", "History", "Forecast"]), [keys]);

  const kOccPct = useMemo(() => pickKey(keys, ["Occ.%", "Occ %", "Occ%", "Occupancy", "OCC"]), [keys]);
  const kOccRooms = useMemo(() => pickKey(keys, ["Total Occ.", "Total Occ", "Rooms Occupied"]), [keys]);
  const kRev = useMemo(() => pickKey(keys, ["Room Revenue", "RoomRevenue", "Revenue"]), [keys]);
  const kAdr = useMemo(() => pickKey(keys, ["Average Rate", "ADR", "Avg Rate", "AverageRate"]), [keys]);
  const kAdults = useMemo(() => pickKey(keys, ["Adl. & Chl.", "Adl & Chl", "Adults", "Persons"]), [keys]);

  const normalized: HfRow[] = useMemo(() => {
    if (!rows?.length) return [];
    if (!kEmpresa || !kFecha) return [];

    const target = String(hotelFilter ?? "").trim().toUpperCase();
    const out: HfRow[] = [];

    for (const r of rows as CsvRow[]) {
      const empresa = String(r[kEmpresa] ?? "").trim();
      if (!empresa) continue;

      if (target && empresa.toUpperCase() !== target) continue;

      const d = parseDateSmart(r[kFecha]);
      if (!d) continue;

      const hof = String(r[kHoF] ?? "").trim() || "History";

      const yy = d.getFullYear();
      const mm = d.getMonth();
      const qq = quarterOfMonth(mm);
      const wd = d.getDay();

      const occPct = pct01(r[kOccPct]); // "59,40%" -> 0.594
      const occRooms = num(r[kOccRooms]);
      const roomRevenue = num(r[kRev]);
      const adr = num(r[kAdr]);
      const adultsChl = num(r[kAdults]);

      out.push({
        empresa,
        hof,
        date: d,
        year: yy,
        month: mm,
        quarter: qq,
        weekday: wd,
        occRooms,
        occPct,
        roomRevenue,
        adr,
        adultsChl,
      });
    }

    out.sort((a, b) => a.date.getTime() - b.date.getTime());
    return out;
  }, [rows, kEmpresa, kFecha, kHoF, kOccPct, kOccRooms, kRev, kAdr, kAdults, hotelFilter]);

  const applyFilters = (list: HfRow[], y: number) => {
    let out = list.filter((r) => r.year === y);

    if (hofMode !== "ALL") {
      const want = hofMode === "HISTORY" ? "history" : "forecast";
      out = out.filter((r) => String(r.hof).toLowerCase().includes(want));
    }
    if (quarter !== 0) out = out.filter((r) => r.quarter === quarter);
    if (month !== -1) out = out.filter((r) => r.month === month);

    return out;
  };

  const filtered = useMemo(() => applyFilters(normalized, year), [normalized, year, hofMode, quarter, month]);
  const baseFiltered = useMemo(() => applyFilters(normalized, baseYear), [normalized, baseYear, hofMode, quarter, month]);

  const kpis = useMemo(() => {
    const a = emptyAgg("cur");
    for (const r of filtered) addAgg(a, r);
    const cur = finalizeAgg(a);

    const b = emptyAgg("base");
    for (const r of baseFiltered) addAgg(b, r);
    const base = finalizeAgg(b);

    return {
      cur,
      base,
      occDelta: deltaPct(cur.avgOcc, base.avgOcc),
      adrDelta: deltaPct(cur.avgAdr, base.avgAdr),
      revparDelta: deltaPct(cur.revpar, base.revpar),
      dblDelta: deltaPct(cur.doubleOcc, base.doubleOcc),
    };
  }, [filtered, baseFiltered]);

  const aggByYear = useMemo(() => {
    const map = new Map<string, Agg>();
    for (const r of normalized) {
      const key = String(r.year);
      const a = map.get(key) ?? emptyAgg(key);
      addAgg(a, r);
      map.set(key, a);
    }
    return Array.from(map.values()).map(finalizeAgg).sort((a, b) => Number(a.key) - Number(b.key));
  }, [normalized]);

  const aggByQuarter = useMemo(() => {
    const map = new Map<string, Agg>();
    for (const r of filtered) {
      const key = `Q${r.quarter}`;
      const a = map.get(key) ?? emptyAgg(key);
      addAgg(a, r);
      map.set(key, a);
    }
    return Array.from(map.values()).map(finalizeAgg).sort((a, b) => a.key.localeCompare(b.key));
  }, [filtered]);

  const aggByMonth = useMemo(() => {
    const map = new Map<string, Agg>();
    for (const r of filtered) {
      const key = `${r.month}`; // 0..11
      const a = map.get(key) ?? emptyAgg(key);
      addAgg(a, r);
      map.set(key, a);
    }
    return Array.from(map.values())
      .map((a) => ({ ...finalizeAgg(a), monthIdx: Number(a.key) }))
      .sort((a, b) => a.monthIdx - b.monthIdx);
  }, [filtered]);

  // Ranking meses (1..12) por ocupación + revenue
  const monthRankingSimple = useMemo(() => {
    const list = (aggByMonth as any[]).map((a) => ({
      monthIdx: Number(a.monthIdx),
      monthNum: Number(a.monthIdx) + 1, // 1..12
      occ: Number(a.avgOcc) || 0,
      revenue: Number(a.sumRev ?? 0),
    }));
    return [...list].sort((x, y) => y.occ - x.occ);
  }, [aggByMonth]);

  // Ranking por día semana (lo dejamos con ocupación, y revenue como referencia)
  const weekdayRanking = useMemo(() => {
    const map = new Map<number, Agg>();
    for (const r of filtered) {
      const a = map.get(r.weekday) ?? emptyAgg(String(r.weekday));
      addAgg(a, r);
      map.set(r.weekday, a);
    }
    return Array.from(map.entries())
      .map(([wd, a]) => {
        const f = finalizeAgg(a);
        return {
          wd,
          label: weekdayName(wd),
          occ: f.avgOcc,
          revenue: f.sumRev,
          days: f.countDays,
        };
      })
      .sort((a, b) => b.occ - a.occ);
  }, [filtered]);

  // meses disponibles del año (para no mostrar meses vacíos)
  const monthsInYear = useMemo(() => {
    const set = new Set<number>();
    for (const r of normalized) if (r.year === year) set.add(r.month);
    return Array.from(set.values()).sort((a, b) => a - b);
  }, [normalized, year]);

  if (loading) {
    return (
      <Card>
        <div style={{ fontWeight: 950 }}>Cargando History & Forecast…</div>
        <div style={{ opacity: 0.75, marginTop: ".35rem" }}>{filePath}</div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <div style={{ fontWeight: 950 }}>Error leyendo H&F</div>
        <div style={{ opacity: 0.85, marginTop: ".35rem" }}>{error}</div>
        <div style={{ opacity: 0.7, marginTop: ".5rem", fontSize: ".9rem" }}>{filePath}</div>
      </Card>
    );
  }

  if (!normalized.length) {
    return (
      <Card>
        <div style={{ fontWeight: 950 }}>Sin datos de H&F</div>
        <div style={{ opacity: 0.8, marginTop: ".35rem" }}>
          No se encontraron filas. Revisá que el CSV tenga columnas <b>Empresa</b> y <b>Fecha</b>.
        </div>
        <div style={{ opacity: 0.7, marginTop: ".5rem", fontSize: ".9rem" }}>
          Detectado: Empresa={kEmpresa || "—"} · Fecha={kFecha || "—"} · HoF={kHoF || "—"}
        </div>
      </Card>
    );
  }

  const occSub = `${formatPct01(kpis.cur.avgOcc)} · Δ ${(kpis.occDelta * 100).toFixed(1)}%`;
  const adrSub = `${formatMoneyUsd(kpis.cur.avgAdr)} · Δ ${(kpis.adrDelta * 100).toFixed(1)}%`;
  const revparSub = `${formatMoneyUsd(kpis.cur.revpar)} · Δ ${(kpis.revparDelta * 100).toFixed(1)}%`;
  const dblSub = `${kpis.cur.doubleOcc.toFixed(2)} · Δ ${(kpis.dblDelta * 100).toFixed(1)}%`;

  return (
    <section className="section" style={{ display: "grid", gap: "1.25rem" }}>
      <SectionTitle
        title={`History & Forecast — ${hotelFilter ? hotelFilter : "Todos"} · ${year} vs ${baseYear}`}
        desc="KPIs + comparativa + series por Año/Trimestre/Mes + rankings por % ocupación."
        right={
          <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
            <Pill tone={tone} active={hofMode === "ALL"} onClick={() => setHofMode("ALL")}>
              Ambos
            </Pill>
            <Pill tone={tone} active={hofMode === "HISTORY"} onClick={() => setHofMode("HISTORY")}>
              History
            </Pill>
            <Pill tone={tone} active={hofMode === "FORECAST"} onClick={() => setHofMode("FORECAST")}>
              Forecast
            </Pill>
          </div>
        }
      />

      {/* filtros locales */}
      <Card style={{ padding: ".85rem" }}>
        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontWeight: 900, opacity: 0.85, marginRight: ".35rem" }}>Filtros:</div>

          <Pill tone={tone} active={quarter === 0} onClick={() => setQuarter(0)}>
            Trimestre · Todos
          </Pill>
          {[1, 2, 3, 4].map((q) => (
            <Pill key={q} tone={tone} active={quarter === q} onClick={() => setQuarter(q as any)}>
              Q{q}
            </Pill>
          ))}

          <div style={{ width: 12 }} />

          <Pill tone={tone} active={month === -1} onClick={() => setMonth(-1)}>
            Mes · Todos
          </Pill>
          {monthsInYear.map((m) => (
            <Pill key={m} tone={tone} active={month === m} onClick={() => setMonth(m)}>
              {monthName(m)}
            </Pill>
          ))}
        </div>
      </Card>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: ".85rem" }}>
        <KpiTile label="Ocupación promedio" value={formatPct01(kpis.cur.avgOcc)} sub={occSub} accent={tone} />
        <KpiTile label="ADR promedio" value={formatMoneyUsd(kpis.cur.avgAdr)} sub={adrSub} accent={tone} />
        <KpiTile label="REVPAR (aprox.)" value={formatMoneyUsd(kpis.cur.revpar)} sub={revparSub} accent={tone} />
        <KpiTile label="Tasa doble ocupación" value={kpis.cur.doubleOcc.toFixed(2)} sub={dblSub} accent={tone} />
      </div>

      {/* Comparativa */}
      <Card>
        <SectionTitle title="Comparativa principales indicadores" desc="Promedios del período filtrado. Base = mismo filtro aplicado en el año base." />
        <div style={{ marginTop: ".85rem", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: ".85rem" }}>
          {[
            { label: "Ocupación", cur: formatPct01(kpis.cur.avgOcc), base: formatPct01(kpis.base.avgOcc), d: kpis.occDelta },
            { label: "ADR", cur: formatMoneyUsd(kpis.cur.avgAdr), base: formatMoneyUsd(kpis.base.avgAdr), d: kpis.adrDelta },
            { label: "REVPAR (aprox.)", cur: formatMoneyUsd(kpis.cur.revpar), base: formatMoneyUsd(kpis.base.revpar), d: kpis.revparDelta },
          ].map((it) => (
            <div key={it.label} style={{ padding: ".85rem", borderRadius: 16, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)" }}>
              <div style={{ fontWeight: 900, opacity: 0.85 }}>{it.label}</div>
              <div style={{ fontSize: "1.45rem", fontWeight: 950, marginTop: ".25rem" }}>{it.cur}</div>
              <div style={{ opacity: 0.75, marginTop: ".25rem" }}>
                Base {baseYear}: {it.base} · Δ {(it.d * 100).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Año */}
      <Card>
        <SectionTitle title="Serie por Año (contexto del dataset)" desc="Promedio de ocupación por año para este hotel (si aplica)." />
        <div style={{ marginTop: ".85rem", display: "grid", gap: ".55rem" }}>
          {(() => {
            const maxOcc = Math.max(...aggByYear.map((a: any) => a.avgOcc), 0.00001);
            return aggByYear.map((a: any, idx: number) => (
              <div key={a.key} style={{ display: "grid", gridTemplateColumns: "120px 1fr 90px", gap: ".75rem", alignItems: "center" }}>
                <div style={{ fontWeight: 850, opacity: 0.95 }}>{a.key}</div>
                <div style={{ height: 12, borderRadius: 999, background: "rgba(255,255,255,.10)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${Math.round(clamp01(a.avgOcc / maxOcc) * 100)}%`,
                      height: "100%",
                      background: rankChipBg(tone, idx),
                    }}
                  />
                </div>
                <div style={{ textAlign: "right", fontWeight: 900 }}>{formatPct01(a.avgOcc)}</div>
              </div>
            ));
          })()}
        </div>
      </Card>

      {/* Trimestre */}
      <Card>
        <SectionTitle title="History & Forecast por Trimestre" desc="Promedio de ocupación por trimestre (respetando filtros actuales)." />
        <div style={{ marginTop: ".85rem", display: "grid", gap: ".55rem" }}>
          {aggByQuarter.length ? (
            (() => {
              const maxOcc = Math.max(...aggByQuarter.map((a: any) => a.avgOcc), 0.00001);
              return aggByQuarter.map((a: any) => {
                const q = Number(String(a.key).replace("Q", "")) as 1 | 2 | 3 | 4;
                return (
                  <div key={a.key} style={{ display: "grid", gridTemplateColumns: "120px 1fr 90px", gap: ".75rem", alignItems: "center" }}>
                    <div style={{ fontWeight: 850, opacity: 0.95 }}>{a.key}</div>
                    <div style={{ height: 12, borderRadius: 999, background: "rgba(255,255,255,.10)", overflow: "hidden" }}>
                      <div style={{ width: `${Math.round(clamp01(a.avgOcc / maxOcc) * 100)}%`, height: "100%", background: qBand(q, tone) }} />
                    </div>
                    <div style={{ textAlign: "right", fontWeight: 900 }}>{formatPct01(a.avgOcc)}</div>
                  </div>
                );
              });
            })()
          ) : (
            <div style={{ opacity: 0.8 }}>Sin datos con el filtro actual.</div>
          )}
        </div>
      </Card>

      {/* Mes (cards por trimestre, con banda distinta) */}
      <Card>
        <SectionTitle title="History & Forecast por Mes" desc="Cards cronológicas por trimestre. Se ve rápido qué mes fue mejor/peor sin que todo parezca igual." />

        {aggByMonth.length ? (
          (() => {
            const byQ: Record<string, any[]> = { Q1: [], Q2: [], Q3: [], Q4: [] };
            for (const a of aggByMonth as any[]) {
              const m = Number(a.monthIdx);
              const q = `Q${quarterOfMonth(m)}`;
              byQ[q].push(a);
            }

            const monthCard = (a: any) => {
              const mIdx = Number(a.monthIdx);
              const q = quarterOfMonth(mIdx);
              return (
                <div
                  key={`m-${mIdx}`}
                  style={{
                    borderRadius: 18,
                    border: "1px solid rgba(255,255,255,.12)",
                    background: "rgba(255,255,255,.04)",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ height: 6, background: qBand(q, tone) }} />
                  <div style={{ padding: ".9rem", display: "grid", gap: ".45rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 950 }}>{monthName(mIdx)} <span style={{ opacity: 0.7 }}>({mIdx + 1})</span></div>
                      <div style={{ opacity: 0.75 }}>{a.countDays} días</div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".55rem" }}>
                      <div>
                        <div style={{ opacity: 0.7 }}>Ocupación</div>
                        <div style={{ fontSize: "1.25rem", fontWeight: 950 }}>{formatPct01(a.avgOcc)}</div>
                      </div>
                      <div>
                        <div style={{ opacity: 0.7 }}>Revenue</div>
                        <div style={{ fontSize: "1.05rem", fontWeight: 950 }}>{niceMoneyShort(a.sumRev)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            };

            return (
              <div style={{ marginTop: ".85rem", display: "grid", gap: "1rem" }}>
                {(["Q1", "Q2", "Q3", "Q4"] as const).map((q) =>
                  byQ[q].length ? (
                    <div key={q}>
                      <div style={{ fontWeight: 950, marginBottom: ".55rem" }}>{q}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: ".75rem" }}>
                        {byQ[q].map(monthCard)}
                      </div>
                    </div>
                  ) : null
                )}
              </div>
            );
          })()
        ) : (
          <div style={{ opacity: 0.8, marginTop: ".85rem" }}>Sin datos con el filtro actual.</div>
        )}
      </Card>

      {/* Ranking meses (1..12 + medallas, solo Ocupación + Revenue) */}
      <Card>
        <SectionTitle
          title="Ranking de Meses (por % ocupación)"
          desc="1..12 con medallas Top 3. Solo Ocupación + Room Revenue (referencia)."
        />

        {monthRankingSimple.length ? (
          (() => {
            const maxOcc = Math.max(...monthRankingSimple.map((x) => x.occ), 0.00001);
            const maxRev = Math.max(...monthRankingSimple.map((x) => x.revenue), 0.00001);

            return (
              <div style={{ marginTop: ".85rem", display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: ".75rem" }}>
                {monthRankingSimple.map((x, i) => {
                  const medal = medalForRank(i);
                  const occW = clamp01(x.occ / maxOcc);
                  const revW = clamp01(x.revenue / maxRev);

                  return (
                    <div
                      key={`rk-m-${x.monthNum}`}
                      style={{
                        borderRadius: 18,
                        padding: ".9rem",
                        border: "1px solid rgba(255,255,255,.12)",
                        background: "rgba(255,255,255,.04)",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      <div style={{ position: "absolute", inset: 0, background: rankChipBg(tone, i), opacity: 0.12 }} />

                      <div style={{ position: "relative", display: "grid", gap: ".55rem" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                            <div
                              style={{
                                minWidth: 42,
                                height: 34,
                                borderRadius: 999,
                                display: "grid",
                                placeItems: "center",
                                fontWeight: 950,
                                border: "1px solid rgba(255,255,255,.14)",
                                background: rankChipBg(tone, i),
                                boxShadow: "0 10px 24px rgba(0,0,0,.18)",
                              }}
                              title={`Puesto ${i + 1}`}
                            >
                              {medal ? medal : i + 1}
                            </div>

                            <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>
                              Mes {x.monthNum}
                            </div>
                          </div>

                          <div style={{ opacity: 0.9, fontWeight: 950 }}>{formatPct01(x.occ)}</div>
                        </div>

                        {/* Ocupación (verde->amarillo) */}
                        <div style={{ display: "grid", gap: ".25rem" }}>
                          <div style={{ opacity: 0.75, fontSize: ".85rem", fontWeight: 800 }}>Ocupación</div>
                          <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,.10)", overflow: "hidden" }}>
                            <div
                              style={{
                                width: `${Math.round(occW * 100)}%`,
                                height: "100%",
                                borderRadius: 999,
                                background: "linear-gradient(90deg, rgba(34,197,94,.92), rgba(253,224,71,.70))",
                              }}
                            />
                          </div>
                        </div>

                        {/* Revenue (violeta->azul) */}
                        <div style={{ display: "grid", gap: ".25rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                            <div style={{ opacity: 0.75, fontSize: ".85rem", fontWeight: 800 }}>Room Revenue</div>
                            <div style={{ fontWeight: 900, opacity: 0.9 }}>{niceMoneyShort(x.revenue)}</div>
                          </div>
                          <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,.10)", overflow: "hidden" }}>
                            <div
                              style={{
                                width: `${Math.round(revW * 100)}%`,
                                height: "100%",
                                borderRadius: 999,
                                background: "linear-gradient(90deg, rgba(168,85,247,.92), rgba(59,130,246,.70))",
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()
        ) : (
          <div style={{ opacity: 0.8, marginTop: ".85rem" }}>Sin datos con el filtro actual.</div>
        )}
      </Card>

      {/* Ranking día semana (simple) */}
      <Card>
        <SectionTitle title="Ranking por Día de la Semana (por % ocupación)" desc="Para decidir qué día conviene empujar. (Ocupación + Revenue referencia)" />

        {weekdayRanking.length ? (
          <div style={{ marginTop: ".85rem", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: ".75rem" }}>
            {weekdayRanking.map((x, i) => (
              <div
                key={x.label}
                style={{
                  borderRadius: 18,
                  padding: ".9rem",
                  border: "1px solid rgba(255,255,255,.12)",
                  background: "rgba(255,255,255,.04)",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div style={{ position: "absolute", inset: 0, background: rankChipBg(tone, i), opacity: 0.10 }} />
                <div style={{ position: "relative", display: "grid", gap: ".4rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div style={{ fontWeight: 950 }}>{x.label}</div>
                    <div style={{ fontWeight: 950 }}>{formatPct01(x.occ)}</div>
                  </div>
                  <div style={{ opacity: 0.82, fontWeight: 850 }}>{niceMoneyShort(x.revenue)}</div>
                  <div style={{ opacity: 0.65, fontSize: ".9rem" }}>{x.days} días</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ opacity: 0.8, marginTop: ".85rem" }}>Sin datos con el filtro actual.</div>
        )}
      </Card>

      {/* Diagnóstico */}
      <Card style={{ padding: ".85rem" }}>
        <div style={{ fontWeight: 900 }}>Diagnóstico</div>
        <div style={{ opacity: 0.78, marginTop: ".35rem", fontSize: ".92rem" }}>
          Filas CSV: <b>{rows.length}</b> · Filas normalizadas: <b>{normalized.length}</b> · Filas filtradas ({year}):{" "}
          <b>{filtered.length}</b>
        </div>
        <div style={{ opacity: 0.65, marginTop: ".35rem", fontSize: ".9rem" }}>
          Keys: Empresa=<b>{kEmpresa || "—"}</b> · Fecha=<b>{kFecha || "—"}</b> · HoF=<b>{kHoF || "—"}</b> ·
          Occ%=<b>{kOccPct || "—"}</b> · TotalOcc=<b>{kOccRooms || "—"}</b> · Revenue=<b>{kRev || "—"}</b> · ADR=<b>{kAdr || "—"}</b>
        </div>
      </Card>
    </section>
  );
}

