"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useCsvClient, num, pct01, safeDiv, formatMoney } from "./useCsvClient";

/* =========================================================
   YearComparator (MEGA COMPLETO)
   - Filtros locales (H/F + trimestre + mes) con estética
   - 1 carrusel GRANDE (auto-rotación 4-5s)
   - KPIs: Ocupación promedio, Revenue total, Habitaciones ocupadas
   - Comparativa vs baseYear con deltas verde/rojo (bien distinguible)
   - Series: por Año, Trimestre, Mes (ordenado y no “todo igual”)
   - Rankings: meses (1..12 con medallas) y días de semana (vertical)
   - Diagnóstico final (para debug cuando “sin datos”)
========================================================= */

type Props = {
  filePath: string;
  year: number;
  baseYear: number;
  /** "" => todos; "MAITEI" => sólo Maitei */
  hotelFilter: string;
};

/* =========================
   UI primitives (self-contained)
========================= */

function Card({
  children,
  style,
  className,
}: React.PropsWithChildren<{ style?: React.CSSProperties; className?: string }>) {
  return (
    <div
      className={className ?? "card"}
      style={{
        padding: "1rem",
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,.12)",
        background: "rgba(255,255,255,.05)",
        boxShadow: "0 18px 38px rgba(0,0,0,.20)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionHeader({
  title,
  desc,
  right,
}: {
  title: string;
  desc?: string;
  right?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", gap: ".75rem", alignItems: "flex-start", justifyContent: "space-between" }}>
      <div>
        <div style={{ fontSize: "1.2rem", fontWeight: 950 }}>{title}</div>
        {desc ? <div style={{ opacity: 0.8, marginTop: ".25rem" }}>{desc}</div> : null}
      </div>
      {right ? <div>{right}</div> : null}
    </div>
  );
}

type Tone = "jcr" | "gotel" | "neutral";
function toneFromHotel(h: string): Tone {
  return String(h ?? "").toUpperCase() === "MAITEI" ? "gotel" : h ? "jcr" : "neutral";
}

function toneGradient(t: Tone) {
  if (t === "gotel") return "linear-gradient(135deg, rgba(56,189,248,.95), rgba(37,99,235,.85))"; // celeste->azul
  if (t === "jcr") return "linear-gradient(135deg, rgba(220,38,38,.95), rgba(124,58,237,.85))"; // rojo->violeta
  return "linear-gradient(135deg, rgba(255,255,255,.20), rgba(255,255,255,.06))";
}

function toneBorder(t: Tone) {
  if (t === "gotel") return "rgba(56,189,248,.45)";
  if (t === "jcr") return "rgba(220,38,38,.45)";
  return "rgba(255,255,255,.18)";
}

function toneSoftBg(t: Tone) {
  if (t === "gotel") return "rgba(56,189,248,.10)";
  if (t === "jcr") return "rgba(220,38,38,.10)";
  return "rgba(255,255,255,.06)";
}

function Pill({
  children,
  active,
  onClick,
  tone,
  title,
}: React.PropsWithChildren<{
  active?: boolean;
  onClick?: () => void;
  tone: Tone;
  title?: string;
}>) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        cursor: "pointer",
        borderRadius: 999,
        padding: ".45rem .75rem",
        border: `1px solid ${active ? toneBorder(tone) : "rgba(255,255,255,.14)"}`,
        background: active ? toneGradient(tone) : "rgba(255,255,255,.05)",
        color: "white",
        fontWeight: 900,
        fontSize: ".9rem",
        opacity: active ? 1 : 0.88,
        boxShadow: active ? "0 14px 30px rgba(0,0,0,.25)" : "none",
        transition: "all .15s ease",
      }}
    >
      {children}
    </button>
  );
}

function BadgeDelta({ v }: { v: number }) {
  const up = v >= 0;
  // verde bien “visible”
  const good = "#22c55e"; // green-500
  const bad = "#ef4444"; // red-500
  return (
    <span style={{ fontWeight: 950, color: up ? good : bad }}>
      {(v * 100).toFixed(1)}%
    </span>
  );
}

function Bar({
  pct,
  tone,
}: {
  pct: number; // 0..100
  tone: Tone;
}) {
  const fill =
    tone === "gotel"
      ? "linear-gradient(90deg, rgba(56,189,248,.95), rgba(37,99,235,.65))"
      : tone === "jcr"
      ? "linear-gradient(90deg, rgba(220,38,38,.95), rgba(124,58,237,.65))"
      : "linear-gradient(90deg, rgba(255,255,255,.35), rgba(255,255,255,.12))";

  return (
    <div style={{ height: 12, borderRadius: 999, background: "rgba(255,255,255,.10)", overflow: "hidden" }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", background: fill }} />
    </div>
  );
}

/* =========================
   Helpers de fechas / labels
========================= */

const MONTHS_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MONTHS_LONG = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const WEEKDAYS = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

function monthName(m: number, long = false) {
  return (long ? MONTHS_LONG : MONTHS_SHORT)[m] ?? String(m + 1);
}
function quarterOfMonth(m: number): 1 | 2 | 3 | 4 {
  if (m <= 2) return 1;
  if (m <= 5) return 2;
  if (m <= 8) return 3;
  return 4;
}
function weekdayName(d: number) {
  return WEEKDAYS[d] ?? String(d);
}

function medal(i: number) {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return `${i + 1}.`;
}

function parseDateSmart(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;

  const s = String(v).trim();
  if (!s) return null;

  // dd/mm/yyyy
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    const yy = Number(m1[3]);
    const d = new Date(yy, mm - 1, dd);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // dd-mm-yy ...
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

/* =========================
   Key picking (robusto)
========================= */

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

/* =========================
   Modelo de datos
========================= */

type HfRow = {
  empresa: string;
  hof: string; // History/Forecast
  date: Date;
  year: number;
  month: number; // 0-11
  quarter: 1 | 2 | 3 | 4;
  weekday: number; // 0-6

  occPct: number; // 0..1
  occRooms: number; // Total Occ.
  revenue: number; // Room Revenue
};

type Agg = {
  key: string;
  countDays: number;

  sumOccPct: number;
  sumOccRooms: number;
  sumRevenue: number;
};

function emptyAgg(key: string): Agg {
  return { key, countDays: 0, sumOccPct: 0, sumOccRooms: 0, sumRevenue: 0 };
}

function addAgg(a: Agg, r: HfRow) {
  a.countDays += 1;
  a.sumOccPct += r.occPct;
  a.sumOccRooms += r.occRooms;
  a.sumRevenue += r.revenue;
}

function finalizeAgg(a: Agg) {
  const avgOcc = safeDiv(a.sumOccPct, a.countDays);
  return {
    ...a,
    avgOcc,
    totalRoomsOcc: a.sumOccRooms,
    totalRevenue: a.sumRevenue,
  };
}

function deltaPct(cur: number, base: number) {
  return base === 0 ? 0 : (cur - base) / base;
}

/* =========================
   Ranking row (cards)
========================= */

function RankRow({
  idx,
  label,
  occ,
  revenue,
  maxOcc,
  tone,
}: {
  idx: number;
  label: string;
  occ: number;
  revenue: number;
  maxOcc: number;
  tone: Tone;
}) {
  const occPct = occ * 100;
  const w = maxOcc > 0 ? (occ / maxOcc) * 100 : 0;

  // pequeños acentos por posición
  const accent =
    idx === 0 ? "rgba(34,197,94,.18)" :
    idx === 1 ? "rgba(56,189,248,.18)" :
    idx === 2 ? "rgba(245,158,11,.18)" :
    "rgba(255,255,255,.06)";

  return (
    <div
      style={{
        padding: ".8rem",
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,.12)",
        background: accent,
        display: "grid",
        gap: ".5rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", alignItems: "center" }}>
        <div style={{ fontWeight: 950 }}>
          <span style={{ marginRight: ".45rem" }}>{medal(idx)}</span>
          {label}
        </div>
        <div style={{ fontWeight: 950, opacity: 0.95 }}>{occPct.toFixed(1)}%</div>
      </div>

      <Bar pct={w} tone={tone} />

      <div style={{ display: "flex", justifyContent: "space-between", opacity: 0.9 }}>
        <div style={{ fontWeight: 850 }}>Revenue</div>
        <div style={{ fontWeight: 950 }}>{formatMoney(revenue)}</div>
      </div>
    </div>
  );
}

/* =========================
   Carrusel grande (1 visible)
========================= */

type Slide = {
  title: string;
  value: string;
  delta: number; // ratio
  sub: string;
};

function BigCarousel({
  tone,
  slides,
  intervalMs = 5000,
}: {
  tone: Tone;
  slides: Slide[];
  intervalMs?: number;
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!slides.length) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), intervalMs);
    return () => clearInterval(t);
  }, [slides.length, intervalMs]);

  const s = slides[idx] ?? slides[0];

  const deltaColor = s.delta >= 0 ? "#22c55e" : "#ef4444";

  return (
    <div
      style={{
        borderRadius: 22,
        padding: "1.35rem",
        color: "white",
        position: "relative",
        overflow: "hidden",
        border: `1px solid ${toneBorder(tone)}`,
        boxShadow: "0 22px 45px rgba(0,0,0,.28)",
        background: toneGradient(tone),
      }}
    >
      <div style={{ position: "absolute", inset: 0, opacity: 0.18, background: "radial-gradient(circle at 30% 20%, rgba(255,255,255,.35), transparent 60%)" }} />
      <div style={{ position: "relative" }}>
        <div style={{ opacity: 0.9, fontWeight: 900, letterSpacing: ".2px" }}>{s.title}</div>
        <div style={{ marginTop: ".35rem", fontSize: "2.35rem", fontWeight: 950, lineHeight: 1.05 }}>{s.value}</div>

        <div style={{ marginTop: ".35rem", display: "flex", gap: ".75rem", alignItems: "baseline" }}>
          <div style={{ fontWeight: 950, color: deltaColor, textShadow: "0 2px 12px rgba(0,0,0,.35)" }}>
            {(s.delta * 100).toFixed(1)}%
          </div>
          <div style={{ opacity: 0.9 }}>{s.sub}</div>
        </div>

        {/* dots */}
        <div style={{ marginTop: "1rem", display: "flex", gap: ".5rem" }}>
          {slides.map((_, i) => (
            <div
              key={i}
              onClick={() => setIdx(i)}
              style={{
                cursor: "pointer",
                width: i === idx ? 22 : 10,
                height: 10,
                borderRadius: 999,
                background: i === idx ? "rgba(255,255,255,.92)" : "rgba(255,255,255,.35)",
                transition: "all .15s ease",
              }}
              title={`Slide ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Main
========================================================= */

export default function YearComparator({ filePath, year, baseYear, hotelFilter }: Props) {
  const tone = toneFromHotel(hotelFilter);

  const { rows, loading, error } = useCsvClient(filePath);

  // filtros locales
  const [hofMode, setHofMode] = useState<"ALL" | "HISTORY" | "FORECAST">("ALL");
  const [quarter, setQuarter] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [month, setMonth] = useState<number>(-1); // -1 todos

  const keys = useMemo(() => Object.keys(rows?.[0] ?? {}), [rows]);

  // keys detectadas
  const kEmpresa = useMemo(() => pickKey(keys, ["Empresa", "Hotel", "Property"]), [keys]);
  const kFecha = useMemo(() => pickKey(keys, ["Fecha", "Date"]), [keys]);
  const kHoF = useMemo(() => pickKey(keys, ["HoF", "Hof", "HOF", "History", "Forecast"]), [keys]);

  const kOccPct = useMemo(() => pickKey(keys, ["Occ.%", "Occ %", "Occ%", "Occupancy", "OCC"]), [keys]);
  const kOccRooms = useMemo(() => pickKey(keys, ['Total Occ.', "Total Occ", "Rooms Occupied"]), [keys]);
  const kRev = useMemo(() => pickKey(keys, ["Room Revenue", "RoomRevenue", "Revenue"]), [keys]);

  const normalized: HfRow[] = useMemo(() => {
    if (!rows?.length) return [];

    const target = String(hotelFilter ?? "").trim().toUpperCase();
    const out: HfRow[] = [];

    for (const r of rows as any[]) {
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

      const occ = pct01(r[kOccPct]);
      const occRooms = num(r[kOccRooms]);
      const revenue = num(r[kRev]);

      out.push({
        empresa,
        hof,
        date: d,
        year: yy,
        month: mm,
        quarter: qq,
        weekday: wd,
        occPct: occ,
        occRooms,
        revenue,
      });
    }

    out.sort((a, b) => a.date.getTime() - b.date.getTime());
    return out;
  }, [rows, kEmpresa, kFecha, kHoF, kOccPct, kOccRooms, kRev, hotelFilter]);

  // filtros aplicados a un año específico
  function applyFilters(list: HfRow[], y: number) {
    let out = list.filter((r) => r.year === y);

    if (hofMode !== "ALL") {
      const want = hofMode === "HISTORY" ? "history" : "forecast";
      out = out.filter((r) => String(r.hof).toLowerCase().includes(want));
    }

    if (quarter !== 0) out = out.filter((r) => r.quarter === quarter);
    if (month !== -1) out = out.filter((r) => r.month === month);

    return out;
  }

  const cur = useMemo(() => applyFilters(normalized, year), [normalized, year, hofMode, quarter, month]);
  const base = useMemo(() => applyFilters(normalized, baseYear), [normalized, baseYear, hofMode, quarter, month]);

  // meses disponibles para el año seleccionado (para pills)
  const monthsInYear = useMemo(() => {
    const set = new Set<number>();
    for (const r of normalized) if (r.year === year) set.add(r.month);
    return Array.from(set.values()).sort((a, b) => a - b);
  }, [normalized, year]);

  // KPI agregados
  const kpis = useMemo(() => {
    const a = emptyAgg("cur");
    cur.forEach((r) => addAgg(a, r));
    const curAgg = finalizeAgg(a);

    const b = emptyAgg("base");
    base.forEach((r) => addAgg(b, r));
    const baseAgg = finalizeAgg(b);

    const occDelta = deltaPct(curAgg.avgOcc, baseAgg.avgOcc);
    const revDelta = deltaPct(curAgg.totalRevenue, baseAgg.totalRevenue);
    const roomsDelta = deltaPct(curAgg.totalRoomsOcc, baseAgg.totalRoomsOcc);

    return { curAgg, baseAgg, occDelta, revDelta, roomsDelta };
  }, [cur, base]);

  // series por año (contexto general del dataset ya filtrado por hotel)
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

  // serie por trimestre (respetando filtros de H/F, mes no; usamos “cur” del año actual pero sin month filter para que no quede todo igual)
  const aggByQuarter = useMemo(() => {
    const list = applyFilters(normalized, year).filter((r) => month === -1 ? true : true); // mantenemos, pero no dependemos de month
    const map = new Map<string, Agg>();
    for (const r of list) {
      const key = `Q${r.quarter}`;
      const a = map.get(key) ?? emptyAgg(key);
      addAgg(a, r);
      map.set(key, a);
    }
    return Array.from(map.values()).map(finalizeAgg).sort((a, b) => a.key.localeCompare(b.key));
  }, [normalized, year, hofMode, quarter, month]);

  // serie por mes (orden cronológico, respetando filtros; si estás filtrando por trimestre, queda por mes dentro del trimestre)
  const aggByMonth = useMemo(() => {
    const list = applyFilters(normalized, year);
    const map = new Map<number, Agg>();
    for (const r of list) {
      const key = r.month;
      const a = map.get(key) ?? emptyAgg(String(key));
      addAgg(a, r);
      map.set(key, a);
    }
    return Array.from(map.entries())
      .map(([m, a]) => ({ m, ...finalizeAgg(a) }))
      .sort((a, b) => a.m - b.m);
  }, [normalized, year, hofMode, quarter, month]);

  // ranking de meses por ocupación (siempre 1..12 cuando hay data)
  const monthRanking = useMemo(() => {
    const list = applyFilters(normalized, year);
    const map = new Map<number, Agg>();
    for (const r of list) {
      const a = map.get(r.month) ?? emptyAgg(String(r.month));
      addAgg(a, r);
      map.set(r.month, a);
    }
    const items = Array.from(map.entries()).map(([m, a]) => {
      const f = finalizeAgg(a);
      return { m, label: `${m + 1}. ${monthName(m, true)}`, occ: f.avgOcc, revenue: f.totalRevenue };
    });
    return items.sort((a, b) => b.occ - a.occ);
  }, [normalized, year, hofMode, quarter, month]);

  // ranking por día de semana por ocupación
  const weekdayRanking = useMemo(() => {
    const list = applyFilters(normalized, year);
    const map = new Map<number, Agg>();
    for (const r of list) {
      const a = map.get(r.weekday) ?? emptyAgg(String(r.weekday));
      addAgg(a, r);
      map.set(r.weekday, a);
    }
    const items = Array.from(map.entries()).map(([wd, a]) => {
      const f = finalizeAgg(a);
      return { wd, label: weekdayName(wd), occ: f.avgOcc, revenue: f.totalRevenue };
    });
    return items.sort((a, b) => b.occ - a.occ);
  }, [normalized, year, hofMode, quarter, month]);

  // slides del carrusel grande (solo 3)
  const slides: Slide[] = useMemo(() => {
    return [
      {
        title: "Ocupación promedio",
        value: (kpis.curAgg.avgOcc * 100).toFixed(1) + "%",
        delta: kpis.occDelta,
        sub: `vs ${baseYear}: ${(kpis.baseAgg.avgOcc * 100).toFixed(1)}%`,
      },
      {
        title: "Revenue total",
        value: formatMoney(kpis.curAgg.totalRevenue),
        delta: kpis.revDelta,
        sub: `vs ${baseYear}: ${formatMoney(kpis.baseAgg.totalRevenue)}`,
      },
      {
        title: "Habitaciones ocupadas",
        value: Math.round(kpis.curAgg.totalRoomsOcc).toLocaleString("es-AR"),
        delta: kpis.roomsDelta,
        sub: `vs ${baseYear}: ${Math.round(kpis.baseAgg.totalRoomsOcc).toLocaleString("es-AR")}`,
      },
    ];
  }, [kpis, baseYear]);

  /* =========================
     Estados de carga/errores
  ========================= */

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
          No se encontraron filas. Revisá columnas <b>Empresa</b> y <b>Fecha</b>.
        </div>
        <div style={{ opacity: 0.7, marginTop: ".5rem", fontSize: ".9rem" }}>
          Detectado: Empresa=<b>{kEmpresa || "—"}</b> · Fecha=<b>{kFecha || "—"}</b> · HoF=<b>{kHoF || "—"}</b> · Occ%=<b>{kOccPct || "—"}</b> · TotalOcc=<b>{kOccRooms || "—"}</b> · Revenue=<b>{kRev || "—"}</b>
        </div>
      </Card>
    );
  }

  /* =========================
     Render
  ========================= */

  const headerTitle = `History & Forecast — ${hotelFilter ? hotelFilter : "Todos"} · ${year} vs ${baseYear}`;
  const headerDesc = "KPIs + comparativa + series por Año/Trimestre/Mes + rankings por % ocupación (y revenue).";

  // para barras: máximos
  const maxYearOcc = Math.max(...aggByYear.map((a) => a.avgOcc), 0.00001);
  const maxQOcc = Math.max(...aggByQuarter.map((a) => a.avgOcc), 0.00001);
  const maxMOcc = Math.max(...aggByMonth.map((a) => a.avgOcc), 0.00001);
  const maxRankMOcc = Math.max(...monthRanking.map((x) => x.occ), 0.00001);
  const maxRankWOcc = Math.max(...weekdayRanking.map((x) => x.occ), 0.00001);

  return (
    <section className="section" style={{ display: "grid", gap: "1.25rem" }}>
      {/* Header + H/F selector */}
      <Card style={{ padding: "1rem", borderRadius: 18, background: toneSoftBg(tone) }}>
        <SectionHeader
          title={headerTitle}
          desc={headerDesc}
          right={
            <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
              <Pill tone={tone} active={hofMode === "ALL"} onClick={() => setHofMode("ALL")}>
                H&F · Ambos
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
      </Card>

      {/* Filtros locales (trimestre + mes) */}
      <Card style={{ padding: ".85rem" }}>
        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontWeight: 950, opacity: 0.85, marginRight: ".25rem" }}>Filtros:</div>

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

          <div style={{ marginLeft: "auto", opacity: 0.85, fontWeight: 850 }}>
            {hofMode === "ALL" ? "H&F: Ambos" : hofMode === "HISTORY" ? "H&F: History" : "H&F: Forecast"} ·{" "}
            {quarter === 0 ? "Trimestre: Todos" : `Trimestre: Q${quarter}`} ·{" "}
            {month === -1 ? "Mes: Todos" : `Mes: ${monthName(month, true)}`}
          </div>
        </div>
      </Card>

      {/* Carrusel grande (1 slide visible) */}
      <BigCarousel tone={tone} slides={slides} intervalMs={5000} />

      {/* Comparativa principal (solo 3 KPIs) */}
      <Card>
        <SectionHeader
          title="Comparativa principales indicadores"
          desc="Se calcula sobre el período filtrado del año seleccionado, comparado contra el mismo filtro aplicado al año base."
        />

        <div style={{ marginTop: ".85rem", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: ".85rem" }}>
          <div style={{ borderRadius: 16, padding: ".9rem", border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)" }}>
            <div style={{ fontWeight: 900, opacity: 0.85 }}>Ocupación promedio</div>
            <div style={{ fontSize: "1.45rem", fontWeight: 950, marginTop: ".25rem" }}>
              {(kpis.curAgg.avgOcc * 100).toFixed(1)}%
            </div>
            <div style={{ opacity: 0.78, marginTop: ".25rem" }}>
              Base {baseYear}: {(kpis.baseAgg.avgOcc * 100).toFixed(1)}% · Δ <BadgeDelta v={kpis.occDelta} />
            </div>
          </div>

          <div style={{ borderRadius: 16, padding: ".9rem", border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)" }}>
            <div style={{ fontWeight: 900, opacity: 0.85 }}>Revenue total</div>
            <div style={{ fontSize: "1.45rem", fontWeight: 950, marginTop: ".25rem" }}>
              {formatMoney(kpis.curAgg.totalRevenue)}
            </div>
            <div style={{ opacity: 0.78, marginTop: ".25rem" }}>
              Base {baseYear}: {formatMoney(kpis.baseAgg.totalRevenue)} · Δ <BadgeDelta v={kpis.revDelta} />
            </div>
          </div>

          <div style={{ borderRadius: 16, padding: ".9rem", border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)" }}>
            <div style={{ fontWeight: 900, opacity: 0.85 }}>Habitaciones ocupadas</div>
            <div style={{ fontSize: "1.45rem", fontWeight: 950, marginTop: ".25rem" }}>
              {Math.round(kpis.curAgg.totalRoomsOcc).toLocaleString("es-AR")}
            </div>
            <div style={{ opacity: 0.78, marginTop: ".25rem" }}>
              Base {baseYear}: {Math.round(kpis.baseAgg.totalRoomsOcc).toLocaleString("es-AR")} · Δ{" "}
              <BadgeDelta v={kpis.roomsDelta} />
            </div>
          </div>
        </div>
      </Card>

      {/* Serie por Año */}
      <Card>
        <SectionHeader
          title="Serie por Año (contexto del dataset)"
          desc="Promedio de ocupación por año (filtrado por hotel si corresponde)."
        />
        <div style={{ marginTop: ".85rem", display: "grid", gap: ".6rem" }}>
          {aggByYear.map((a) => (
            <div key={a.key} style={{ display: "grid", gridTemplateColumns: "90px 1fr 120px", gap: ".75rem", alignItems: "center" }}>
              <div style={{ fontWeight: 950 }}>{a.key}</div>
              <Bar pct={(a.avgOcc / maxYearOcc) * 100} tone={tone} />
              <div style={{ textAlign: "right", fontWeight: 950 }}>{(a.avgOcc * 100).toFixed(1)}%</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Serie por Trimestre */}
      <Card>
        <SectionHeader
          title="History & Forecast por Trimestre"
          desc="Ocupación promedio por trimestre (respetando H/F y filtros aplicados)."
        />
        <div style={{ marginTop: ".85rem", display: "grid", gap: ".6rem" }}>
          {aggByQuarter.length ? (
            aggByQuarter.map((a) => (
              <div key={a.key} style={{ display: "grid", gridTemplateColumns: "90px 1fr 120px", gap: ".75rem", alignItems: "center" }}>
                <div style={{ fontWeight: 950 }}>{a.key}</div>
                <Bar pct={(a.avgOcc / maxQOcc) * 100} tone={tone} />
                <div style={{ textAlign: "right", fontWeight: 950 }}>{(a.avgOcc * 100).toFixed(1)}%</div>
              </div>
            ))
          ) : (
            <div style={{ opacity: 0.8 }}>Sin datos con el filtro actual.</div>
          )}
        </div>
      </Card>

      {/* Serie por Mes (orden cronológico) */}
      <Card>
        <SectionHeader
          title="History & Forecast por Mes"
          desc="Meses en orden cronológico (no ranking)."
        />
        <div style={{ marginTop: ".85rem", display: "grid", gap: ".6rem" }}>
          {aggByMonth.length ? (
            aggByMonth.map((a) => (
              <div key={a.m} style={{ display: "grid", gridTemplateColumns: "140px 1fr 120px", gap: ".75rem", alignItems: "center" }}>
                <div style={{ fontWeight: 950 }}>{monthName(a.m, true)}</div>
                <Bar pct={(a.avgOcc / maxMOcc) * 100} tone={tone} />
                <div style={{ textAlign: "right", fontWeight: 950 }}>{(a.avgOcc * 100).toFixed(1)}%</div>
              </div>
            ))
          ) : (
            <div style={{ opacity: 0.8 }}>Sin datos con el filtro actual.</div>
          )}
        </div>
      </Card>

      {/* Ranking de meses (vertical, cards, 1..12, medallas) */}
      <Card>
        <SectionHeader
          title="Ranking de Meses (por % ocupación)"
          desc="Ordena meses por ocupación promedio. Incluye revenue total como referencia."
        />
        <div style={{ marginTop: ".85rem", display: "grid", gap: ".65rem" }}>
          {monthRanking.length ? (
            monthRanking.map((x, i) => (
              <RankRow
                key={x.m}
                idx={i}
                label={x.label}
                occ={x.occ}
                revenue={x.revenue}
                maxOcc={maxRankMOcc}
                tone={tone}
              />
            ))
          ) : (
            <div style={{ opacity: 0.8 }}>Sin datos con el filtro actual.</div>
          )}
        </div>
      </Card>

      {/* Ranking por día de semana (vertical) */}
      <Card>
        <SectionHeader
          title="Ranking por Día de la Semana (por % ocupación)"
          desc="Para ver en qué día conviene mejorar (solo ocupación + revenue)."
        />
        <div style={{ marginTop: ".85rem", display: "grid", gap: ".65rem" }}>
          {weekdayRanking.length ? (
            weekdayRanking.map((x, i) => (
              <RankRow
                key={x.wd}
                idx={i}
                label={x.label}
                occ={x.occ}
                revenue={x.revenue}
                maxOcc={maxRankWOcc}
                tone={tone}
              />
            ))
          ) : (
            <div style={{ opacity: 0.8 }}>Sin datos con el filtro actual.</div>
          )}
        </div>
      </Card>

      {/* Diagnóstico */}
      <Card style={{ padding: ".9rem" }}>
        <div style={{ fontWeight: 950 }}>Diagnóstico</div>
        <div style={{ opacity: 0.85, marginTop: ".35rem" }}>
          Filas CSV: <b>{rows.length}</b> · Filas normalizadas: <b>{normalized.length}</b> · Filas filtradas ({year}):{" "}
          <b>{cur.length}</b> · Base ({baseYear}): <b>{base.length}</b>
        </div>
        <div style={{ opacity: 0.7, marginTop: ".35rem", fontSize: ".92rem" }}>
          Keys detectadas: Empresa=<b>{kEmpresa || "—"}</b> · Fecha=<b>{kFecha || "—"}</b> · HoF=<b>{kHoF || "—"}</b> ·
          Occ%=<b>{kOccPct || "—"}</b> · TotalOcc=<b>{kOccRooms || "—"}</b> · Revenue=<b>{kRev || "—"}</b>
        </div>
      </Card>
    </section>
  );
}
