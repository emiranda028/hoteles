"use client";

import React, { useMemo, useState } from "react";
import SectionTitle from "./ui/SectionTitle";
import Pill from "./ui/Pill";
import KpiCarousel from "./KpiCarousel";
import { useCsvClient, num, pct01, CsvRow } from "./useCsvClient";

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

  // match exact
  for (const c of candidates) {
    const cn = normKey(c);
    const hit = K.find((x) => x.n === cn);
    if (hit) return hit.raw;
  }
  // match contains
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

  // dd/mm/yyyy (preferido, por "Fecha")
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    const yy = Number(m1[3]);
    const d = new Date(yy, mm - 1, dd);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // dd-mm-yy (a veces aparece en Date "01-06-22 Wed")
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
  // 0 Domingo, 1 Lunes...
  return ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][d] ?? String(d);
}

function formatMoneyUsd(n: number): string {
  return n.toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatPct01(n01: number): string {
  return (n01 * 100).toFixed(1) + "%";
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function medalForRank(i: number) {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return "";
}

function toneForHotel(hotelFilter: string): "red" | "blue" | "neutral" {
  return String(hotelFilter ?? "").toUpperCase() === "MAITEI" ? "blue" : "red";
}

function gradForTone(tone: "red" | "blue" | "neutral") {
  if (tone === "red") return "linear-gradient(135deg, rgba(220,38,38,.95), rgba(168,85,247,.70))"; // rojo->violeta
  if (tone === "blue") return "linear-gradient(135deg, rgba(56,189,248,.95), rgba(37,99,235,.70))"; // celeste->azul
  return "linear-gradient(135deg, rgba(255,255,255,.18), rgba(255,255,255,.06))";
}

function rankChipBg(tone: "red" | "blue" | "neutral", i: number) {
  if (tone === "red") {
    return i < 3
      ? "linear-gradient(135deg, rgba(220,38,38,.95), rgba(168,85,247,.70))"
      : "linear-gradient(135deg, rgba(244,63,94,.75), rgba(124,58,237,.45))";
  }
  if (tone === "blue") {
    return i < 3
      ? "linear-gradient(135deg, rgba(56,189,248,.95), rgba(37,99,235,.70))"
      : "linear-gradient(135deg, rgba(14,165,233,.75), rgba(29,78,216,.45))";
  }
  return "linear-gradient(135deg, rgba(255,255,255,.18), rgba(255,255,255,.06))";
}

/* =========================================================
   Modelado de filas H&F
========================================================= */

type HfRow = {
  empresa: string;
  hof: string; // History / Forecast
  date: Date;
  year: number;
  month: number; // 0-11
  quarter: 1 | 2 | 3 | 4;
  weekday: number; // 0-6

  occRooms: number; // "Total Occ."
  occPct: number; // 0..1
  roomRevenue: number;
  adr: number; // Average Rate
  adultsChl: number; // Adl. & Chl.
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
  const avgOcc = a.countDays ? a.sumOccPct / a.countDays : 0;
  const avgAdr = a.countDays ? a.sumAdr / a.countDays : 0;

  const doubleOcc = a.sumOccRooms > 0 ? a.sumAdults / a.sumOccRooms : 0;
  const revpar = avgAdr * avgOcc; // estable

  return {
    ...a,
    avgOcc,
    avgAdr,
    doubleOcc,
    revpar,
  };
}

function deltaPct(cur: number, base: number): number {
  if (!base) return 0;
  return (cur - base) / base;
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

function BarRow({
  label,
  valueText,
  pctWidth,
  tone,
}: {
  label: string;
  valueText: string;
  pctWidth: number;
  tone: "red" | "blue" | "neutral";
}) {
  const fill =
    tone === "red"
      ? "linear-gradient(90deg, rgba(220,38,38,.95), rgba(168,85,247,.70))"
      : tone === "blue"
      ? "linear-gradient(90deg, rgba(56,189,248,.95), rgba(37,99,235,.70))"
      : "linear-gradient(90deg, rgba(255,255,255,.30), rgba(255,255,255,.12))";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 90px", gap: ".75rem", alignItems: "center" }}>
      <div style={{ fontWeight: 850, opacity: 0.95 }}>{label}</div>
      <div style={{ height: 12, borderRadius: 999, background: "rgba(255,255,255,.10)", overflow: "hidden" }}>
        <div style={{ width: `${Math.max(0, Math.min(100, pctWidth))}%`, height: "100%", background: fill }} />
      </div>
      <div style={{ textAlign: "right", fontWeight: 900 }}>{valueText}</div>
    </div>
  );
}

/* =========================================================
   Main
========================================================= */

export default function YearComparator({ filePath, year, baseYear, hotelFilter }: Props) {
  const tone = toneForHotel(hotelFilter);

  const { rows, loading, error } = useCsvClient(filePath);

  // filtros locales
  const [hofMode, setHofMode] = useState<"ALL" | "HISTORY" | "FORECAST">("ALL");
  const [quarter, setQuarter] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [month, setMonth] = useState<number>(-1); // -1 => todos

  const keys = useMemo(() => Object.keys(rows?.[0] ?? {}), [rows]);

  // keys del CSV (robusto)
  const kEmpresa = useMemo(() => pickKey(keys, ["Empresa", "Hotel", "Property"]), [keys]);
  const kFecha = useMemo(() => pickKey(keys, ["Fecha", "Date"]), [keys]);
  const kHoF = useMemo(() => pickKey(keys, ["HoF", "Hof", "HOF", "History", "Forecast"]), [keys]);

  const kOccPct = useMemo(() => pickKey(keys, ["Occ.%", "Occ %", "Occ%", "Occupancy", "OCC"]), [keys]);
  const kOccRooms = useMemo(() => pickKey(keys, ['Total Occ.', "Total Occ", "Total Occu", "Rooms Occupied"]), [keys]);
  const kRev = useMemo(() => pickKey(keys, ["Room Revenue", "RoomRevenue", "Revenue"]), [keys]);
  const kAdr = useMemo(() => pickKey(keys, ["Average Rate", "ADR", "Avg Rate", "AverageRate"]), [keys]);
  const kAdults = useMemo(() => pickKey(keys, ["Adl. & Chl.", "Adl & Chl", "Adults", "Persons"]), [keys]);

  const normalized: HfRow[] = useMemo(() => {
    if (!rows?.length) return [];

    const hfFilter = String(hotelFilter ?? "").trim();
    const target = hfFilter ? hfFilter.toUpperCase() : "";

    const out: HfRow[] = [];

    for (const r of rows as CsvRow[]) {
      const empresa = String(r[kEmpresa] ?? "").trim();
      if (!empresa) continue;

      // filtro exacto por Empresa
      if (target && empresa.toUpperCase() !== target) continue;

      const d = parseDateSmart(r[kFecha]);
      if (!d) continue;

      const hof = String(r[kHoF] ?? "").trim() || "History";

      const yy = d.getFullYear();
      const mm = d.getMonth();
      const qq = quarterOfMonth(mm);
      const wd = d.getDay();

      const occPct01 = pct01(r[kOccPct]); // soporta "59,40%"
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
        occPct: occPct01,
        roomRevenue,
        adr,
        adultsChl,
      });
    }

    out.sort((a, b) => a.date.getTime() - b.date.getTime());
    return out;
  }, [rows, kEmpresa, kFecha, kHoF, kOccPct, kOccRooms, kRev, kAdr, kAdults, hotelFilter]);

  const filtered = useMemo(() => {
    let list = normalized.filter((r) => r.year === year);

    if (hofMode !== "ALL") {
      const want = hofMode === "HISTORY" ? "history" : "forecast";
      list = list.filter((r) => String(r.hof).toLowerCase().includes(want));
    }

    if (quarter !== 0) list = list.filter((r) => r.quarter === quarter);
    if (month !== -1) list = list.filter((r) => r.month === month);

    return list;
  }, [normalized, year, hofMode, quarter, month]);

  const baseFiltered = useMemo(() => {
    let list = normalized.filter((r) => r.year === baseYear);

    if (hofMode !== "ALL") {
      const want = hofMode === "HISTORY" ? "history" : "forecast";
      list = list.filter((r) => String(r.hof).toLowerCase().includes(want));
    }

    if (quarter !== 0) list = list.filter((r) => r.quarter === quarter);
    if (month !== -1) list = list.filter((r) => r.month === month);

    return list;
  }, [normalized, baseYear, hofMode, quarter, month]);

  const kpis = useMemo(() => {
    const a = emptyAgg("cur");
    for (const r of filtered) addAgg(a, r);
    const cur = finalizeAgg(a);

    const b = emptyAgg("base");
    for (const r of baseFiltered) addAgg(b, r);
    const base = finalizeAgg(b);

    const occDelta = deltaPct(cur.avgOcc, base.avgOcc);
    const adrDelta = deltaPct(cur.avgAdr, base.avgAdr);
    const revparDelta = deltaPct(cur.revpar, base.revpar);
    const dblDelta = deltaPct(cur.doubleOcc, base.doubleOcc);

    return { cur, base, occDelta, adrDelta, revparDelta, dblDelta };
  }, [filtered, baseFiltered]);

  const aggByYear = useMemo(() => {
    const map = new Map<string, Agg>();
    for (const r of normalized) {
      const key = String(r.year);
      const a = map.get(key) ?? emptyAgg(key);
      addAgg(a, r);
      map.set(key, a);
    }
    return Array.from(map.values())
      .map(finalizeAgg)
      .sort((a, b) => Number(a.key) - Number(b.key));
  }, [normalized]);

  const aggByQuarter = useMemo(() => {
    const map = new Map<string, Agg>();
    for (const r of filtered) {
      const key = `Q${r.quarter}`;
      const a = map.get(key) ?? emptyAgg(key);
      addAgg(a, r);
      map.set(key, a);
    }
    return Array.from(map.values())
      .map(finalizeAgg)
      .sort((a, b) => a.key.localeCompare(b.key));
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

  // Ranking de meses por % ocupación (promedio) — SOLO OCUPACIÓN
  const monthRankingSimple = useMemo(() => {
    const list = aggByMonth.map((a: any) => ({
      monthIdx: a.monthIdx as number,
      monthNum: String((a.monthIdx as number) + 1).padStart(2, "0"),
      occ: a.avgOcc as number,
      days: a.countDays as number,
    }));
    return [...list].sort((a, b) => b.occ - a.occ);
  }, [aggByMonth]);

  // Ranking por día de semana — SOLO OCUPACIÓN
  const weekdayRanking = useMemo(() => {
    const map = new Map<number, Agg>();
    for (const r of filtered) {
      const a = map.get(r.weekday) ?? emptyAgg(String(r.weekday));
      addAgg(a, r);
      map.set(r.weekday, a);
    }
    const list = Array.from(map.entries()).map(([wd, a]) => {
      const f = finalizeAgg(a);
      return { wd, label: weekdayName(wd), occ: f.avgOcc, days: f.countDays };
    });
    return list.sort((a, b) => b.occ - a.occ);
  }, [filtered]);

  // meses disponibles según data del año (para pills)
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

  return (
    <section className="section" style={{ display: "grid", gap: "1.25rem" }}>
      <SectionTitle
        title={`History & Forecast — ${hotelFilter ? hotelFilter : "Todos"} · ${year} vs ${baseYear}`}
        desc="KPIs destacados + comparativa + series por Año/Trimestre/Mes + rankings por % ocupación."
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

      {/* Filtros locales */}
      <Card style={{ padding: ".85rem" }}>
        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontWeight: 900, opacity: 0.85, marginRight: ".35rem" }}>Filtros:</div>

          <Pill tone={tone} active={quarter === 0} onClick={() => setQuarter(0)} title="Todos los trimestres">
            Trimestre · Todos
          </Pill>
          {[1, 2, 3, 4].map((q) => (
            <Pill key={q} tone={tone} active={quarter === q} onClick={() => setQuarter(q as any)}>
              Q{q}
            </Pill>
          ))}

          <div style={{ width: 12 }} />

          <Pill tone={tone} active={month === -1} onClick={() => setMonth(-1)} title="Todos los meses">
            Mes · Todos
          </Pill>
          {monthsInYear.map((m) => (
            <Pill key={m} tone={tone} active={month === m} onClick={() => setMonth(m)}>
              {monthName(m)}
            </Pill>
          ))}
        </div>
      </Card>

      {/* Carousel KPIs (degradé por grupo, variación en verde/rojo dentro del carousel) */}
      <KpiCarousel
        tone={tone}
        intervalMs={3400}
        showDots={true}
        items={[
          {
            label: "Ocupación promedio",
            value: formatPct01(kpis.cur.avgOcc),
            deltaText: `Δ ${(kpis.occDelta * 100).toFixed(1)}%`,
            deltaValue: kpis.occDelta,
            sub: `${formatPct01(kpis.base.avgOcc)} en ${baseYear}`,
          },
          {
            label: "ADR promedio",
            value: formatMoneyUsd(kpis.cur.avgAdr),
            deltaText: `Δ ${(kpis.adrDelta * 100).toFixed(1)}%`,
            deltaValue: kpis.adrDelta,
            sub: `${formatMoneyUsd(kpis.base.avgAdr)} en ${baseYear}`,
          },
          {
            label: "REVPAR (aprox.)",
            value: formatMoneyUsd(kpis.cur.revpar),
            deltaText: `Δ ${(kpis.revparDelta * 100).toFixed(1)}%`,
            deltaValue: kpis.revparDelta,
            sub: `${formatMoneyUsd(kpis.base.revpar)} en ${baseYear}`,
          },
          {
            label: "Tasa doble ocupación",
            value: kpis.cur.doubleOcc.toFixed(2),
            deltaText: `Δ ${(kpis.dblDelta * 100).toFixed(1)}%`,
            deltaValue: kpis.dblDelta,
            sub: `${kpis.base.doubleOcc.toFixed(2)} en ${baseYear}`,
          },
        ]}
      />

      {/* Comparativa principal (queda simple, el “wow” está en el carousel) */}
      <Card>
        <SectionTitle
          title="Comparativa principales indicadores"
          desc="Promedios del período filtrado. Base = mismo filtro aplicado en el año base."
        />
        <div
          style={{
            marginTop: ".85rem",
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: ".85rem",
          }}
        >
          {[
            {
              k: "Ocupación",
              v: formatPct01(kpis.cur.avgOcc),
              b: `${formatPct01(kpis.base.avgOcc)} · Δ ${(kpis.occDelta * 100).toFixed(1)}%`,
            },
            {
              k: "ADR",
              v: formatMoneyUsd(kpis.cur.avgAdr),
              b: `${formatMoneyUsd(kpis.base.avgAdr)} · Δ ${(kpis.adrDelta * 100).toFixed(1)}%`,
            },
            {
              k: "REVPAR (aprox.)",
              v: formatMoneyUsd(kpis.cur.revpar),
              b: `${formatMoneyUsd(kpis.base.revpar)} · Δ ${(kpis.revparDelta * 100).toFixed(1)}%`,
            },
          ].map((it) => (
            <div
              key={it.k}
              style={{
                padding: ".85rem",
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,.12)",
                background: "rgba(255,255,255,.04)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div style={{ position: "absolute", inset: 0, background: gradForTone(tone), opacity: 0.08 }} />
              <div style={{ position: "relative" }}>
                <div style={{ fontWeight: 900, opacity: 0.85 }}>{it.k}</div>
                <div style={{ fontSize: "1.45rem", fontWeight: 950, marginTop: ".25rem" }}>{it.v}</div>
                <div style={{ opacity: 0.75, marginTop: ".25rem" }}>{it.b}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Serie por Año */}
      <Card>
        <SectionTitle title="Serie por Año (contexto del dataset)" desc="Promedio de ocupación por año (filtrado por hotel)." />
        <div style={{ marginTop: ".85rem", display: "grid", gap: ".55rem" }}>
          {(() => {
            const maxOcc = Math.max(...aggByYear.map((a) => a.avgOcc), 0.00001);
            return aggByYear.map((a) => (
              <BarRow key={a.key} label={a.key} valueText={formatPct01(a.avgOcc)} pctWidth={(a.avgOcc / maxOcc) * 100} tone={tone} />
            ));
          })()}
        </div>
      </Card>

      {/* Por Trimestre */}
      <Card>
        <SectionTitle title="History & Forecast por Trimestre" desc="Promedio de ocupación por trimestre (respetando filtros)." />
        <div style={{ marginTop: ".85rem", display: "grid", gap: ".55rem" }}>
          {aggByQuarter.length ? (
            (() => {
              const maxOcc = Math.max(...aggByQuarter.map((a) => a.avgOcc), 0.00001);
              return aggByQuarter.map((a) => (
                <BarRow key={a.key} label={a.key} valueText={formatPct01(a.avgOcc)} pctWidth={(a.avgOcc / maxOcc) * 100} tone={tone} />
              ));
            })()
          ) : (
            <div style={{ opacity: 0.8 }}>Sin datos con el filtro actual.</div>
          )}
        </div>
      </Card>

      {/* Por Mes (ordenado) */}
      <Card>
        <SectionTitle title="History & Forecast por Mes" desc="Meses en orden cronológico (respetando filtros)." />
        <div style={{ marginTop: ".85rem", display: "grid", gap: ".55rem" }}>
          {aggByMonth.length ? (
            (() => {
              const maxOcc = Math.max(...aggByMonth.map((a: any) => a.avgOcc), 0.00001);
              return aggByMonth.map((a: any) => (
                <BarRow
                  key={a.key}
                  label={monthName(a.monthIdx)}
                  valueText={formatPct01(a.avgOcc)}
                  pctWidth={(a.avgOcc / maxOcc) * 100}
                  tone={tone}
                />
              ));
            })()
          ) : (
            <div style={{ opacity: 0.8 }}>Sin datos con el filtro actual.</div>
          )}
        </div>
      </Card>

      {/* Ranking Meses — LISTADO vertical — SOLO OCUPACIÓN */}
      <Card>
        <SectionTitle title="Ranking de Meses (por % ocupación)" desc="Ordenado por ocupación promedio (no por revenue)." />
        <div style={{ marginTop: ".85rem", display: "grid", gap: ".65rem" }}>
          {monthRankingSimple.length ? (
            (() => {
              const maxOcc = Math.max(...monthRankingSimple.map((m) => m.occ), 0.00001);
              return monthRankingSimple.map((x, i) => {
                const medal = medalForRank(i);
                const occW = clamp01(x.occ / maxOcc);

                return (
                  <div
                    key={`rk-m-${x.monthNum}`}
                    style={{
                      borderRadius: 18,
                      padding: ".95rem",
                      border: "1px solid rgba(255,255,255,.12)",
                      background: "rgba(255,255,255,.04)",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ position: "absolute", inset: 0, background: rankChipBg(tone, i), opacity: 0.12 }} />

                    <div style={{ position: "relative", display: "grid", gap: ".55rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
                          <div
                            style={{
                              minWidth: 46,
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

                          <div>
                            <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>
                              {monthName(x.monthIdx)} <span style={{ opacity: 0.7 }}>({x.monthNum})</span>
                            </div>
                            <div style={{ opacity: 0.78, fontWeight: 850, fontSize: ".92rem" }}>
                              {x.days} días
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <div style={{ opacity: 0.72, fontSize: ".85rem", fontWeight: 850 }}>Ocupación</div>
                          <div style={{ fontWeight: 950, fontSize: "1.15rem" }}>{formatPct01(x.occ)}</div>
                        </div>
                      </div>

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
                  </div>
                );
              });
            })()
          ) : (
            <div style={{ opacity: 0.8 }}>Sin datos con el filtro actual.</div>
          )}
        </div>
      </Card>

      {/* Ranking Días — LISTADO vertical — SOLO OCUPACIÓN */}
      <Card>
        <SectionTitle title="Ranking por Día de la Semana (por % ocupación)" desc="Para detectar qué día conviene empujar." />
        <div style={{ marginTop: ".85rem", display: "grid", gap: ".65rem" }}>
          {weekdayRanking.length ? (
            (() => {
              const maxOcc = Math.max(...weekdayRanking.map((w) => w.occ), 0.00001);
              return weekdayRanking.map((x, i) => {
                const medal = medalForRank(i);
                const occW = clamp01(x.occ / maxOcc);

                return (
                  <div
                    key={`rk-w-${x.label}`}
                    style={{
                      borderRadius: 18,
                      padding: ".95rem",
                      border: "1px solid rgba(255,255,255,.12)",
                      background: "rgba(255,255,255,.04)",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ position: "absolute", inset: 0, background: rankChipBg(tone, i), opacity: 0.12 }} />

                    <div style={{ position: "relative", display: "grid", gap: ".55rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
                          <div
                            style={{
                              minWidth: 46,
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

                          <div>
                            <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>{x.label}</div>
                            <div style={{ opacity: 0.78, fontWeight: 850, fontSize: ".92rem" }}>
                              {x.days} días
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <div style={{ opacity: 0.72, fontSize: ".85rem", fontWeight: 850 }}>Ocupación</div>
                          <div style={{ fontWeight: 950, fontSize: "1.15rem" }}>{formatPct01(x.occ)}</div>
                        </div>
                      </div>

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
                  </div>
                );
              });
            })()
          ) : (
            <div style={{ opacity: 0.8 }}>Sin datos con el filtro actual.</div>
          )}
        </div>
      </Card>

      {/* Diagnóstico */}
      <Card style={{ padding: ".85rem" }}>
        <div style={{ fontWeight: 900 }}>Diagnóstico</div>
        <div style={{ opacity: 0.78, marginTop: ".35rem", fontSize: ".92rem" }}>
          Filas CSV: <b>{rows.length}</b> · Filas normalizadas: <b>{normalized.length}</b> · Filas filtradas ({year}):{" "}
          <b>{filtered.length}</b>
        </div>
        <div style={{ opacity: 0.65, marginTop: ".35rem", fontSize: ".9rem" }}>
          Keys detectadas: Empresa=<b>{kEmpresa || "—"}</b> · Fecha=<b>{kFecha || "—"}</b> · HoF=<b>{kHoF || "—"}</b> ·
          Occ%=<b>{kOccPct || "—"}</b> · TotalOcc=<b>{kOccRooms || "—"}</b> · RoomRevenue=<b>{kRev || "—"}</b> · ADR=<b>{kAdr || "—"}</b>
        </div>
      </Card>
    </section>
  );
}

