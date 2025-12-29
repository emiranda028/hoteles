"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  filePath: string; // ej: "/data/hf_diario.csv"
  year: number; // ej: 2025
  baseYear: number; // ej: 2024
  hotelFilter?: string; // "" => todos; o "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI"
};

/* =========================================
   Helpers: CSV parser (sin papaparse)
========================================= */

type CsvRow = Record<string, any>;

function parseCsvText(text: string): CsvRow[] {
  // Parser simple pero robusto: maneja comillas y comas dentro de campos
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    cur.push(field);
    field = "";
  };
  const pushRow = () => {
    // evita filas vacías
    if (cur.some((c) => String(c ?? "").trim() !== "")) rows.push(cur);
    cur = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      // doble comilla escapada dentro de quotes
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (ch === "," || ch === ";")) {
      pushField();
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      // CRLF
      if (ch === "\r" && text[i + 1] === "\n") i++;
      pushField();
      pushRow();
      continue;
    }

    field += ch;
  }

  // último field
  pushField();
  pushRow();

  if (rows.length === 0) return [];

  const header = rows[0].map((h) => String(h ?? "").trim());
  const data = rows.slice(1);

  return data
    .map((r) => {
      const obj: CsvRow = {};
      for (let i = 0; i < header.length; i++) obj[header[i]] = r[i];
      return obj;
    })
    .filter((o) => Object.keys(o).length > 0);
}

/* =========================================
   Helpers numéricos / formatting
========================================= */

function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim();
  if (!s) return 0;

  // % -> número
  const pctRemoved = s.replace("%", "").trim();

  // Caso típico AR: 22.441,71 / 126,79 / 59,40
  const cleaned = pctRemoved.replace(/\./g, "").replace(",", ".");

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function formatMoneyUSD0(n: number): string {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatMoneyUSD2(n: number): string {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function formatPct01(n01: number): string {
  const v = clamp01(n01) * 100;
  return v.toFixed(1) + "%";
}

function formatInt(n: number): string {
  return Math.round(n).toLocaleString("es-AR");
}

/* =========================================
   Helpers: matching de columnas (tolerante)
========================================= */

function normKey(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pickKey(keys: string[], candidates: string[]): string | null {
  const nk = keys.map((k) => ({ k, nk: normKey(k) }));
  const cands = candidates.map(normKey);

  for (const c of cands) {
    const exact = nk.find((x) => x.nk === c);
    if (exact) return exact.k;
  }

  // contains
  for (const c of cands) {
    const contain = nk.find((x) => x.nk.includes(c));
    if (contain) return contain.k;
  }

  return null;
}

/* =========================================
   Date parsing (preferir "Fecha")
========================================= */

function parseFecha(value: any): Date | null {
  const s = String(value ?? "").trim();
  if (!s) return null;

  // Formato común: "1/6/2022" o "01/06/2022"
  if (s.includes("/")) {
    const parts = s.split("/");
    if (parts.length >= 3) {
      const d = Number(parts[0]);
      const m = Number(parts[1]);
      const y = Number(parts[2]);
      if (Number.isFinite(d) && Number.isFinite(m) && Number.isFinite(y)) {
        const dt = new Date(y, m - 1, d);
        return Number.isFinite(dt.getTime()) ? dt : null;
      }
    }
  }

  // Formato: "01-06-22 Wed"
  const dash = s.split(" ")[0];
  if (dash.includes("-")) {
    const p = dash.split("-");
    if (p.length === 3) {
      const d = Number(p[0]);
      const m = Number(p[1]);
      let y = Number(p[2]);
      if (y < 100) y = 2000 + y;
      const dt = new Date(y, m - 1, d);
      return Number.isFinite(dt.getTime()) ? dt : null;
    }
  }

  const dt = new Date(s);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function monthKey(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function monthLabel(d: Date): string {
  const m = d.toLocaleString("es-AR", { month: "long" });
  return `${m[0].toUpperCase()}${m.slice(1)} ${d.getFullYear()}`;
}

function weekdayLabel(d: Date): string {
  const w = d.toLocaleString("es-AR", { weekday: "long" });
  return `${w[0].toUpperCase()}${w.slice(1)}`;
}

/* =========================================
   KPI aggregation
========================================= */

type Agg = {
  days: number;
  occRooms: number; // Total Occ.
  roomRevenue: number;
  occPctWeightedSum: number; // occ% * weight
  adrWeightedSum: number; // ADR * weight
};

function emptyAgg(): Agg {
  return { days: 0, occRooms: 0, roomRevenue: 0, occPctWeightedSum: 0, adrWeightedSum: 0 };
}

function addRowToAgg(
  agg: Agg,
  row: CsvRow,
  kOccRooms: string | null,
  kOccPct: string | null,
  kRevenue: string | null,
  kAdr: string | null
): Agg {
  const occRooms = kOccRooms ? toNumberSmart(row[kOccRooms]) : 0;
  const occPctRaw = kOccPct ? toNumberSmart(row[kOccPct]) : 0; // puede venir 59,40
  const occPct01 = occPctRaw > 1 ? occPctRaw / 100 : occPctRaw; // si viene 0,594 o 59,4
  const revenue = kRevenue ? toNumberSmart(row[kRevenue]) : 0;
  const adr = kAdr ? toNumberSmart(row[kAdr]) : 0;

  const w = occRooms > 0 ? occRooms : 1;

  return {
    days: agg.days + 1,
    occRooms: agg.occRooms + occRooms,
    roomRevenue: agg.roomRevenue + revenue,
    occPctWeightedSum: agg.occPctWeightedSum + occPct01 * w,
    adrWeightedSum: agg.adrWeightedSum + adr * w,
  };
}

function finalizeAgg(agg: Agg) {
  const weight = agg.occRooms > 0 ? agg.occRooms : Math.max(1, agg.days);
  const occPct01 = safeDiv(agg.occPctWeightedSum, weight);
  const adr = safeDiv(agg.adrWeightedSum, weight);
  return {
    days: agg.days,
    occRooms: agg.occRooms,
    roomRevenue: agg.roomRevenue,
    occPct01,
    adr,
    revparLike: adr * occPct01, // aproximación con lo disponible
  };
}

function deltaPct(current: number, base: number): number {
  if (base === 0) return current === 0 ? 0 : 1;
  return (current - base) / base;
}

/* =========================================
   UI helpers
========================================= */

function Card(props: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="card"
      style={{
        padding: "1rem",
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.04)",
        boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
        ...props.style,
      }}
    >
      {props.children}
    </div>
  );
}

function SectionTitle({ title, desc }: { title: string; desc?: string }) {
  return (
    <div>
      <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 950, letterSpacing: -0.2 }}>
        {title}
      </div>
      {desc ? (
        <div className="sectionDesc" style={{ marginTop: ".35rem", opacity: 0.82 }}>
          {desc}
        </div>
      ) : null}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: ".25rem .55rem",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.06)",
        fontSize: 12,
        opacity: 0.95,
      }}
    >
      {children}
    </span>
  );
}

/* =========================================
   Component
========================================= */

export default function YearComparator({ filePath, year, baseYear, hotelFilter = "" }: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<CsvRow[]>([]);

  // UI selectors internos (no globales)
  const [hofMode, setHofMode] = useState<"ALL" | "History" | "Forecast">("ALL");
  const [metricForRanking, setMetricForRanking] = useState<"revenue" | "occ">("revenue");

  // Carousel
  const [slide, setSlide] = useState(0);
  const slideRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    fetch(filePath)
      .then(async (r) => {
        if (!r.ok) throw new Error(`No se pudo leer CSV: ${filePath} (${r.status})`);
        const text = await r.text();
        const parsed = parseCsvText(text);
        return parsed;
      })
      .then((data) => {
        if (!alive) return;
        setRows(data);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e?.message ?? "Error leyendo CSV");
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [filePath]);

  // Keys detect
  const keys = useMemo(() => (rows[0] ? Object.keys(rows[0]) : []), [rows]);

  const kEmpresa = useMemo(() => pickKey(keys, ["Empresa", "Hotel"]), [keys]);
  const kHoF = useMemo(() => pickKey(keys, ["HoF", "Hof", "History Forecast", "History/Forecast"]), [keys]);
  const kFecha = useMemo(() => pickKey(keys, ["Fecha", "Date"]), [keys]);

  const kOccRooms = useMemo(() => pickKey(keys, ['Total Occ.', "Total Occ", "Total Occu", "Rooms Occupied"]), [keys]);
  const kOccPct = useMemo(() => pickKey(keys, ["Occ.%", "Occ %", "Occupancy", "Ocupacion", "Ocupación"]), [keys]);
  const kRevenue = useMemo(() => pickKey(keys, ["Room Revenue", "Rooms Revenue", "Revenue Rooms"]), [keys]);
  const kAdr = useMemo(() => pickKey(keys, ["Average Rate", "ADR", "Avg Rate", "Tarifa Promedio"]), [keys]);

  // Filtered rows
  const filtered = useMemo(() => {
    const hf = rows;

    const out = hf.filter((r) => {
      // Empresa exacta
      if (hotelFilter && kEmpresa) {
        const emp = String(r[kEmpresa] ?? "").trim().toUpperCase();
        if (emp !== String(hotelFilter).trim().toUpperCase()) return false;
      }

      // HoF
      if (hofMode !== "ALL" && kHoF) {
        const v = String(r[kHoF] ?? "").trim().toLowerCase();
        if (hofMode === "History" && v !== "history") return false;
        if (hofMode === "Forecast" && v !== "forecast") return false;
      }

      // Año
      if (!kFecha) return false;
      const dt = parseFecha(r[kFecha]);
      if (!dt) return false;
      return dt.getFullYear() === year || dt.getFullYear() === baseYear;
    });

    return out;
  }, [rows, kEmpresa, kHoF, kFecha, hofMode, hotelFilter, year, baseYear]);

  const currentRows = useMemo(() => {
    if (!kFecha) return [];
    return filtered.filter((r) => {
      const dt = parseFecha(r[kFecha]);
      return dt && dt.getFullYear() === year;
    });
  }, [filtered, kFecha, year]);

  const baseRows = useMemo(() => {
    if (!kFecha) return [];
    return filtered.filter((r) => {
      const dt = parseFecha(r[kFecha]);
      return dt && dt.getFullYear() === baseYear;
    });
  }, [filtered, kFecha, baseYear]);

  // Aggregates total
  const aggTotal = useMemo(() => {
    const aggC = currentRows.reduce((a, r) => addRowToAgg(a, r, kOccRooms, kOccPct, kRevenue, kAdr), emptyAgg());
    const aggB = baseRows.reduce((a, r) => addRowToAgg(a, r, kOccRooms, kOccPct, kRevenue, kAdr), emptyAgg());
    return { current: finalizeAgg(aggC), base: finalizeAgg(aggB) };
  }, [currentRows, baseRows, kOccRooms, kOccPct, kRevenue, kAdr]);

  // Monthly aggregates (for tables & rankings)
  const monthly = useMemo(() => {
    if (!kFecha) return { current: [] as any[], base: [] as any[] };

    const build = (rs: CsvRow[]) => {
      const map = new Map<string, { dt: Date; agg: Agg }>();
      for (const r of rs) {
        const dt = parseFecha(r[kFecha]);
        if (!dt) continue;
        const key = monthKey(dt);
        const prev = map.get(key);
        if (!prev) {
          map.set(key, { dt: new Date(dt.getFullYear(), dt.getMonth(), 1), agg: addRowToAgg(emptyAgg(), r, kOccRooms, kOccPct, kRevenue, kAdr) });
        } else {
          prev.agg = addRowToAgg(prev.agg, r, kOccRooms, kOccPct, kRevenue, kAdr);
        }
      }
      return Array.from(map.entries())
        .map(([, v]) => ({ dt: v.dt, ...finalizeAgg(v.agg) }))
        .sort((a, b) => a.dt.getTime() - b.dt.getTime());
    };

    return { current: build(currentRows), base: build(baseRows) };
  }, [currentRows, baseRows, kFecha, kOccRooms, kOccPct, kRevenue, kAdr]);

  // Weekday ranking (current year)
  const weekdayRank = useMemo(() => {
    if (!kFecha) return [];
    const map = new Map<number, Agg>(); // 0-6
    for (const r of currentRows) {
      const dt = parseFecha(r[kFecha]);
      if (!dt) continue;
      const wd = dt.getDay();
      const prev = map.get(wd) ?? emptyAgg();
      map.set(wd, addRowToAgg(prev, r, kOccRooms, kOccPct, kRevenue, kAdr));
    }
    const arr = Array.from(map.entries()).map(([wd, agg]) => {
      const fin = finalizeAgg(agg);
      return { wd, ...fin };
    });

    // Orden Lunes->Domingo (es-AR suele usar lunes; pero Date.getDay: 0=domingo)
    const order = [1, 2, 3, 4, 5, 6, 0];
    arr.sort((a, b) => order.indexOf(a.wd) - order.indexOf(b.wd));
    return arr;
  }, [currentRows, kFecha, kOccRooms, kOccPct, kRevenue, kAdr]);

  // Rankings de meses
  const monthRanking = useMemo(() => {
    const src = monthly.current;
    const byRevenue = [...src].sort((a, b) => b.roomRevenue - a.roomRevenue);
    const byOcc = [...src].sort((a, b) => b.occPct01 - a.occPct01);
    return { byRevenue, byOcc };
  }, [monthly.current]);

  // Carousel slides (KPIs top)
  const slides = useMemo(() => {
    const c = aggTotal.current;
    const b = aggTotal.base;

    const occDelta = deltaPct(c.occPct01, b.occPct01);
    const revDelta = deltaPct(c.roomRevenue, b.roomRevenue);
    const adrDelta = deltaPct(c.adr, b.adr);
    const revparDelta = deltaPct(c.revparLike, b.revparLike);

    const titleHotel = hotelFilter ? `· ${hotelFilter}` : "· Todos";

    return [
      {
        title: `Ocupación${titleHotel}`,
        value: formatPct01(c.occPct01),
        sub: `vs ${baseYear}: ${formatPct01(b.occPct01)} · Δ ${(occDelta * 100).toFixed(1)}%`,
        big: true,
      },
      {
        title: `Room Revenue${titleHotel}`,
        value: formatMoneyUSD0(c.roomRevenue),
        sub: `vs ${baseYear}: ${formatMoneyUSD0(b.roomRevenue)} · Δ ${(revDelta * 100).toFixed(1)}%`,
      },
      {
        title: `ADR${titleHotel}`,
        value: formatMoneyUSD2(c.adr),
        sub: `vs ${baseYear}: ${formatMoneyUSD2(b.adr)} · Δ ${(adrDelta * 100).toFixed(1)}%`,
      },
      {
        title: `RevPAR (aprox.)${titleHotel}`,
        value: formatMoneyUSD2(c.revparLike),
        sub: `vs ${baseYear}: ${formatMoneyUSD2(b.revparLike)} · Δ ${(revparDelta * 100).toFixed(1)}%`,
      },
    ];
  }, [aggTotal, baseYear, hotelFilter]);

  useEffect(() => {
    // auto-rotate
    if (slideRef.current) window.clearInterval(slideRef.current);
    slideRef.current = window.setInterval(() => setSlide((s) => (s + 1) % Math.max(1, slides.length)), 3500);
    return () => {
      if (slideRef.current) window.clearInterval(slideRef.current);
    };
  }, [slides.length]);

  // Guard no-data
  const hasData = rows.length > 0;

  if (loading) {
    return (
      <Card>
        <div style={{ fontWeight: 900 }}>Cargando History & Forecast…</div>
        <div style={{ marginTop: ".35rem", opacity: 0.75, fontSize: 13 }}>{filePath}</div>
      </Card>
    );
  }

  if (err) {
    return (
      <Card>
        <div style={{ fontWeight: 950 }}>Error leyendo H&F</div>
        <div style={{ marginTop: ".35rem", opacity: 0.85 }}>{err}</div>
        <div style={{ marginTop: ".6rem", fontSize: 13, opacity: 0.75 }}>
          Verificá que exista en <code>/public{filePath}</code> (ej: <code>/public/data/hf_diario.csv</code>)
        </div>
      </Card>
    );
  }

  if (!hasData) {
    return (
      <Card>
        <div style={{ fontWeight: 950 }}>Sin datos</div>
        <div style={{ marginTop: ".35rem", opacity: 0.85 }}>No se detectaron filas en el CSV.</div>
      </Card>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      {/* Header del informe */}
      <Card style={{ padding: "1.1rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: ".6rem", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "grid", gap: ".25rem" }}>
            <div style={{ fontSize: "1.2rem", fontWeight: 950, letterSpacing: -0.3 }}>
              Informe de Gestión — Gestión Hotelera (H&F)
            </div>
            <div style={{ opacity: 0.8 }}>
              LTELC Consultora · Grupo {hotelFilter === "MAITEI" ? "Gotel (Maitei)" : "JCR"} · Año {year} vs {baseYear}
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem", alignItems: "center" }}>
            <Badge>
              <span style={{ opacity: 0.8 }}>HoF</span>
              <select
                value={hofMode}
                onChange={(e) => setHofMode(e.target.value as any)}
                style={{
                  background: "transparent",
                  color: "inherit",
                  border: "none",
                  outline: "none",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                <option value="ALL">History + Forecast</option>
                <option value="History">Solo History</option>
                <option value="Forecast">Solo Forecast</option>
              </select>
            </Badge>

            {hotelFilter ? (
              <Badge>
                <span style={{ opacity: 0.8 }}>Empresa</span>
                <span style={{ fontWeight: 900 }}>{hotelFilter}</span>
              </Badge>
            ) : (
              <Badge>
                <span style={{ opacity: 0.8 }}>Empresa</span>
                <span style={{ fontWeight: 900 }}>Todos</span>
              </Badge>
            )}
          </div>
        </div>

        <div style={{ marginTop: ".85rem", display: "grid", gap: ".35rem", fontSize: 12, opacity: 0.7 }}>
          <div>
            Columnas detectadas:{" "}
            <code>
              {[
                kEmpresa ? `Empresa=${kEmpresa}` : "Empresa=?",
                kFecha ? `Fecha=${kFecha}` : "Fecha=?",
                kHoF ? `HoF=${kHoF}` : "HoF=?",
                kOccRooms ? `TotalOcc=${kOccRooms}` : "TotalOcc=?",
                kOccPct ? `Occ%=${kOccPct}` : "Occ%=?",
                kRevenue ? `Revenue=${kRevenue}` : "Revenue=?",
                kAdr ? `ADR=${kAdr}` : "ADR=?",
              ].join(" · ")}
            </code>
          </div>
        </div>
      </Card>

      {/* Carrousel KPIs */}
      <Card
        style={{
          padding: 0,
          overflow: "hidden",
          background:
            "linear-gradient(135deg, rgba(255,0,80,0.28), rgba(255,255,255,0.04), rgba(0,180,255,0.18))",
        }}
      >
        <div style={{ padding: "1rem 1rem .75rem 1rem", display: "flex", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}>
          <SectionTitle title="KPIs destacados" desc="Carrusel automático (acumulado anual). Comparativa vs año base." />
          <div style={{ display: "flex", gap: ".35rem", alignItems: "center" }}>
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlide(i)}
                aria-label={`slide-${i}`}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.35)",
                  background: i === slide ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.12)",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ padding: "0 1rem 1rem 1rem" }}>
          <div
            style={{
              borderRadius: 16,
              padding: "1rem",
              background: "rgba(0,0,0,0.25)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <div style={{ fontSize: 13, opacity: 0.85, fontWeight: 800 }}>{slides[slide]?.title}</div>
            <div style={{ marginTop: ".35rem", fontSize: slides[slide]?.big ? "2rem" : "1.85rem", fontWeight: 950, letterSpacing: -0.6 }}>
              {slides[slide]?.value}
            </div>
            <div style={{ marginTop: ".25rem", fontSize: 13, opacity: 0.85 }}>{slides[slide]?.sub}</div>
          </div>
        </div>
      </Card>

      {/* Comparativa principales indicadores */}
      <Card>
        <SectionTitle title="Comparativa principales indicadores" desc="Acumulado anual · métricas agregadas correctamente (ponderadas)." />

        <div style={{ marginTop: ".85rem", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.9 }}>
                <th style={{ padding: ".6rem .5rem" }}>Indicador</th>
                <th style={{ padding: ".6rem .5rem" }}>{year}</th>
                <th style={{ padding: ".6rem .5rem" }}>{baseYear}</th>
                <th style={{ padding: ".6rem .5rem" }}>Δ</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  k: "Ocupación",
                  c: aggTotal.current.occPct01,
                  b: aggTotal.base.occPct01,
                  fmt: (n: number) => formatPct01(n),
                },
                {
                  k: "Room Revenue",
                  c: aggTotal.current.roomRevenue,
                  b: aggTotal.base.roomRevenue,
                  fmt: (n: number) => formatMoneyUSD0(n),
                },
                {
                  k: "ADR",
                  c: aggTotal.current.adr,
                  b: aggTotal.base.adr,
                  fmt: (n: number) => formatMoneyUSD2(n),
                },
                {
                  k: "RevPAR (aprox.)",
                  c: aggTotal.current.revparLike,
                  b: aggTotal.base.revparLike,
                  fmt: (n: number) => formatMoneyUSD2(n),
                },
                {
                  k: "Total Occ. (habitaciones)",
                  c: aggTotal.current.occRooms,
                  b: aggTotal.base.occRooms,
                  fmt: (n: number) => formatInt(n),
                },
              ].map((r) => {
                const d = deltaPct(r.c, r.b);
                const sign = d >= 0 ? "+" : "";
                return (
                  <tr key={r.k} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <td style={{ padding: ".6rem .5rem", fontWeight: 900 }}>{r.k}</td>
                    <td style={{ padding: ".6rem .5rem" }}>{r.fmt(r.c)}</td>
                    <td style={{ padding: ".6rem .5rem", opacity: 0.9 }}>{r.fmt(r.b)}</td>
                    <td style={{ padding: ".6rem .5rem", fontWeight: 900, opacity: 0.95 }}>
                      {sign}
                      {(d * 100).toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* History & Forecast por mes */}
      <Card>
        <SectionTitle title="History & Forecast por mes" desc="Serie mensual (acumulado por mes) · orden cronológico." />

        <div style={{ marginTop: ".85rem", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.9 }}>
                <th style={{ padding: ".6rem .5rem" }}>Mes</th>
                <th style={{ padding: ".6rem .5rem" }}>Ocupación</th>
                <th style={{ padding: ".6rem .5rem" }}>Room Revenue</th>
                <th style={{ padding: ".6rem .5rem" }}>ADR</th>
                <th style={{ padding: ".6rem .5rem" }}>Total Occ.</th>
              </tr>
            </thead>
            <tbody>
              {monthly.current.map((m: any) => (
                <tr key={m.dt.toISOString()} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <td style={{ padding: ".6rem .5rem", fontWeight: 900 }}>{monthLabel(m.dt)}</td>
                  <td style={{ padding: ".6rem .5rem" }}>{formatPct01(m.occPct01)}</td>
                  <td style={{ padding: ".6rem .5rem" }}>{formatMoneyUSD0(m.roomRevenue)}</td>
                  <td style={{ padding: ".6rem .5rem" }}>{formatMoneyUSD2(m.adr)}</td>
                  <td style={{ padding: ".6rem .5rem" }}>{formatInt(m.occRooms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Ranking de meses + Ranking días */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: "1.25rem" }}>
        <Card>
          <SectionTitle title="Ranking de meses" desc="Top meses del año seleccionado. Elegí métrica." />

          <div style={{ marginTop: ".65rem", display: "flex", gap: ".5rem", alignItems: "center", flexWrap: "wrap" }}>
            <Badge>
              <span style={{ opacity: 0.8 }}>Métrica</span>
              <select
                value={metricForRanking}
                onChange={(e) => setMetricForRanking(e.target.value as any)}
                style={{ background: "transparent", color: "inherit", border: "none", outline: "none", fontWeight: 900, cursor: "pointer" }}
              >
                <option value="revenue">Room Revenue</option>
                <option value="occ">Ocupación</option>
              </select>
            </Badge>
            <Badge>
              <span style={{ opacity: 0.8 }}>Año</span>
              <span style={{ fontWeight: 900 }}>{year}</span>
            </Badge>
          </div>

          <div style={{ marginTop: ".85rem", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.9 }}>
                  <th style={{ padding: ".6rem .5rem" }}>#</th>
                  <th style={{ padding: ".6rem .5rem" }}>Mes</th>
                  <th style={{ padding: ".6rem .5rem" }}>{metricForRanking === "revenue" ? "Room Revenue" : "Ocupación"}</th>
                </tr>
              </thead>
              <tbody>
                {(metricForRanking === "revenue" ? monthRanking.byRevenue : monthRanking.byOcc).slice(0, 12).map((m: any, i: number) => (
                  <tr key={m.dt.toISOString()} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <td style={{ padding: ".6rem .5rem", fontWeight: 900 }}>{i + 1}</td>
                    <td style={{ padding: ".6rem .5rem", fontWeight: 900 }}>{monthLabel(m.dt)}</td>
                    <td style={{ padding: ".6rem .5rem" }}>
                      {metricForRanking === "revenue" ? formatMoneyUSD0(m.roomRevenue) : formatPct01(m.occPct01)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <SectionTitle title="Ranking por día de la semana" desc="Promedio ponderado del año seleccionado (para detectar dónde mejorar)." />

          <div style={{ marginTop: ".85rem", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.9 }}>
                  <th style={{ padding: ".6rem .5rem" }}>Día</th>
                  <th style={{ padding: ".6rem .5rem" }}>Ocupación</th>
                  <th style={{ padding: ".6rem .5rem" }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {weekdayRank.map((w: any) => {
                  const anyDate = new Date(2024, 0, 1 + ((w.wd + 7) % 7)); // dummy para label
                  return (
                    <tr key={w.wd} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                      <td style={{ padding: ".6rem .5rem", fontWeight: 900 }}>{weekdayLabel(anyDate)}</td>
                      <td style={{ padding: ".6rem .5rem" }}>{formatPct01(w.occPct01)}</td>
                      <td style={{ padding: ".6rem .5rem" }}>{formatMoneyUSD0(w.roomRevenue)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Footer LTELC contact (lo pediste) */}
      <Card>
        <div style={{ display: "grid", gap: ".35rem" }}>
          <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>LTELC Consultora</div>
          <div style={{ opacity: 0.85 }}>Gestión de datos · Tableros · Inteligencia hotelera</div>
          <div style={{ marginTop: ".35rem", display: "flex", flexWrap: "wrap", gap: ".5rem" }}>
            <Badge>Correo: agencialtelc@gmail.com</Badge>
            <Badge>Web: www.lotengoenlacabeza.com.ar</Badge>
          </div>
        </div>
      </Card>
    </div>
  );
}
