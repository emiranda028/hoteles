"use client";

import React, { useEffect, useMemo, useState } from "react";

/**
 * ============================
 * CONFIG
 * ============================
 * En Next.js, todo lo que está en /public se sirve desde "/"
 * Vos tenés: /public/data/hf_diario.csv
 * Entonces el path real es:
 */
const HOF_PATH = "/data/hf_diario.csv";

// Valores reales (Empresa) según tu CSV:
type HotelKey = "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";
type HofTab = "History" | "Forecast" | "All";

const JCR_HOTELS: HotelKey[] = ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];
const MAITEI_HOTELS: HotelKey[] = ["MAITEI"];

/**
 * ============================
 * CSV parsing (sin papaparse)
 * ============================
 */
function splitCsvLine(line: string): string[] {
  // Parser simple pero robusto para comillas
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // Dobles comillas dentro de quoted field: "" -> "
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c] ?? `col_${c}`;
      const raw = cols[c] ?? "";
      obj[key] = raw.replace(/^"|"$/g, "").trim();
    }
    rows.push(obj);
  }

  return rows;
}

/**
 * ============================
 * Helpers numéricos y fechas
 * ============================
 */
function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim();
  if (!s) return 0;

  // Limpiar moneda / espacios
  const cleaned = s
    .replace(/\s+/g, "")
    // miles con punto (AR) y decimal con coma:
    .replace(/\./g, "")
    .replace(",", ".")
    .replace("%", "");

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function toPercent01Smart(v: any): number {
  // Convierte "59,40%" -> 0.594
  // Convierte "0,594" -> 0.594
  // Convierte 59.4 -> 0.594 si viene como 59.4
  const n = toNumberSmart(v);
  if (n > 1.5) return n / 100;
  if (n < 0) return 0;
  return n;
}

function formatInt(n: number): string {
  const x = Number.isFinite(n) ? n : 0;
  return Math.round(x).toLocaleString("es-AR");
}

function formatMoneyUSD0(n: number): string {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatPct01(n: number): string {
  const x = Number.isFinite(n) ? n : 0;
  return (x * 100).toFixed(1).replace(".", ",") + "%";
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function parseDateSmart(v: any): Date | null {
  if (!v) return null;

  // Caso "1/6/2022" (d/m/yyyy)
  const s = String(v).trim();

  // dd-mm-yy Wed (col Date)
  // 01-06-22 Wed
  const m1 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    let yy = Number(m1[3]);
    if (yy < 100) yy = 2000 + yy;
    const d = new Date(yy, mm - 1, dd);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m2) {
    const dd = Number(m2[1]);
    const mm = Number(m2[2]);
    let yy = Number(m2[3]);
    if (yy < 100) yy = 2000 + yy;
    const d = new Date(yy, mm - 1, dd);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * ============================
 * Data mapping (encabezados reales)
 * ============================
 * Tus encabezados (ejemplo):
 * Date, Total Occ., Arr. Rooms, Comp. Rooms, House Use, Deduct Indiv., Deduct Group,
 * Occ.%, Room Revenue, Average Rate, Dep. Rooms, Day Use Rooms, No Show Rooms, OOO Rooms, Adl. & Chl.,
 * Fecha, D??, HoF, Empresa
 */
type RawRow = Record<string, string>;

type HfRow = {
  empresa: HotelKey | string;
  hof: string;
  date: Date | null;
  year: number;
  month: number;

  totalOcc: number; // "Total Occ."
  occPct: number; // "Occ.%"
  roomRevenue: number; // "Room Revenue"
  averageRate: number; // "Average Rate"
  adlChl: number; // "Adl. & Chl."
  arrRooms: number; // Arr. Rooms
  compRooms: number; // Comp. Rooms
  houseUse: number; // House Use
  deductIndiv: number; // Deduct Indiv.
  deductGroup: number; // Deduct Group
};

function pickFirst(obj: RawRow, keys: string[]): string {
  for (const k of keys) {
    if (k in obj) return obj[k];
  }
  // fallback: case-insensitive
  const lowerMap = new Map<string, string>();
  for (const kk of Object.keys(obj)) lowerMap.set(kk.toLowerCase(), kk);

  for (const k of keys) {
    const found = lowerMap.get(k.toLowerCase());
    if (found) return obj[found];
  }
  return "";
}

function normalizeRow(r: RawRow): HfRow {
  const empresa = pickFirst(r, ["Empresa", "empresa", "Hotel", "hotel"]).trim();
  const hof = pickFirst(r, ["HoF", "hof", "HOF"]).trim();

  const fechaStr = pickFirst(r, ["Fecha", "fecha", "Date", "date"]);
  const date = parseDateSmart(fechaStr);

  const year = date ? date.getFullYear() : 0;
  const month = date ? date.getMonth() + 1 : 0;

  const totalOcc = toNumberSmart(pickFirst(r, ["Total Occ.", "Total", "Total Occ", "Total Rooms Occ", "TotalOcc"]));
  const occPct = clamp01(toPercent01Smart(pickFirst(r, ["Occ.%", "Occ%", "Occ", "OCC.%", "OCC%"])));

  const roomRevenue = toNumberSmart(pickFirst(r, ["Room Revenue", "Room Reven", "RoomReven", "Revenue", "RoomRevenue"]));
  const averageRate = toNumberSmart(pickFirst(r, ["Average Rate", "ADR", "AverageRate"]));
  const adlChl = toNumberSmart(pickFirst(r, ["Adl. & Chl.", "Adl & Chl", "Adl.&Chl.", "Persons", "Pax"]));

  const arrRooms = toNumberSmart(pickFirst(r, ["Arr. Rooms", "Arr.", "Arr Rooms"]));
  const compRooms = toNumberSmart(pickFirst(r, ["Comp. Rooms", "Comp.", "Comp Rooms"]));
  const houseUse = toNumberSmart(pickFirst(r, ["House Use", "House"]));
  const deductIndiv = toNumberSmart(pickFirst(r, ["Deduct Indiv.", "Deduct", "Deduct Indiv"]));
  const deductGroup = toNumberSmart(pickFirst(r, ["Deduct Group", "Deduct2", "Deduct Group"]));

  return {
    empresa,
    hof,
    date,
    year,
    month,
    totalOcc,
    occPct,
    roomRevenue,
    averageRate,
    adlChl,
    arrRooms,
    compRooms,
    houseUse,
    deductIndiv,
    deductGroup,
  };
}

/**
 * ============================
 * KPIs
 * ============================
 */
type Kpis = {
  days: number;
  avgOcc: number; // promedio simple de Occ.% (válido <=100)
  totalRevenue: number;
  totalRoomsSold: number;
  approxADR: number; // revenue / rooms sold
  avgRate: number; // promedio de "Average Rate"
  doubleOcc: number; // pax / rooms sold (aprox)
};

function computeKpis(rows: HfRow[]): Kpis {
  const days = rows.length;

  const avgOcc = days ? rows.reduce((a, r) => a + clamp01(r.occPct), 0) / days : 0;

  const totalRevenue = rows.reduce((a, r) => a + (Number.isFinite(r.roomRevenue) ? r.roomRevenue : 0), 0);
  const totalRoomsSold = rows.reduce((a, r) => a + (Number.isFinite(r.totalOcc) ? r.totalOcc : 0), 0);

  const avgRate = days ? rows.reduce((a, r) => a + (Number.isFinite(r.averageRate) ? r.averageRate : 0), 0) / days : 0;
  const approxADR = totalRoomsSold > 0 ? totalRevenue / totalRoomsSold : avgRate;

  const totalPax = rows.reduce((a, r) => a + (Number.isFinite(r.adlChl) ? r.adlChl : 0), 0);
  const doubleOcc = totalRoomsSold > 0 ? totalPax / totalRoomsSold : 0;

  return { days, avgOcc, totalRevenue, totalRoomsSold, approxADR, avgRate, doubleOcc };
}

type MonthAgg = {
  month: number;
  kpis: Kpis;
};

function groupByMonth(rows: HfRow[]): MonthAgg[] {
  const map = new Map<number, HfRow[]>();
  for (const r of rows) {
    const m = r.month || 0;
    if (!m) continue;
    if (!map.has(m)) map.set(m, []);
    map.get(m)!.push(r);
  }

  const out: MonthAgg[] = [];
  for (const [m, rs] of map.entries()) {
    out.push({ month: m, kpis: computeKpis(rs) });
  }

  out.sort((a, b) => a.month - b.month);
  return out;
}

/**
 * ============================
 * UI bits
 * ============================
 */
function Pill({
  active,
  children,
  onClick,
  bgActive,
  bgInactive,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  bgActive: string;
  bgInactive: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "1px solid rgba(255,255,255,.24)",
        background: active ? bgActive : bgInactive,
        color: "white",
        padding: ".42rem .75rem",
        borderRadius: 999,
        fontWeight: 900,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Card({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      className="card"
      style={{
        borderRadius: 18,
        padding: ".9rem 1rem",
        border: "1px solid rgba(0,0,0,.10)",
        background: "white",
      }}
    >
      <div style={{ fontWeight: 900, opacity: 0.75, fontSize: ".95rem" }}>{title}</div>
      <div style={{ fontWeight: 950, fontSize: "1.25rem", marginTop: ".2rem" }}>{value}</div>
      {sub ? <div style={{ marginTop: ".2rem", opacity: 0.75, fontWeight: 700 }}>{sub}</div> : null}
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  right,
}: {
  label: string;
  value: number;
  max: number;
  right: string;
}) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 140px", gap: ".6rem", alignItems: "center" }}>
      <div style={{ fontWeight: 900 }}>{label}</div>
      <div style={{ height: 10, borderRadius: 999, background: "rgba(0,0,0,.08)", overflow: "hidden" }}>
        <div style={{ width: `${pct * 100}%`, height: 10, borderRadius: 999, background: "rgba(170,0,0,.75)" }} />
      </div>
      <div style={{ textAlign: "right", fontWeight: 900 }}>{right}</div>
    </div>
  );
}

/**
 * ============================
 * MAIN
 * ============================
 */
export default function YearComparator() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<HfRow[]>([]);

  useEffect(() => {
    let alive = true;

    setLoading(true);
    setErr("");

    fetch(HOF_PATH, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`No se pudo leer CSV: ${HOF_PATH} (${res.status})`);
        }
        const text = await res.text();
        const raw = parseCsv(text);
        const norm = raw.map(normalizeRow).filter((r) => r.year > 0 && r.month > 0);
        if (!alive) return;
        setRows(norm);
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
  }, []);

  // ===== Detectar años por hotel =====
  const yearsByHotel = useMemo(() => {
    const map = new Map<string, number[]>();
    const tmp = new Map<string, Set<number>>();

    for (const r of rows) {
      const h = String(r.empresa || "").trim();
      if (!h) continue;
      if (!tmp.has(h)) tmp.set(h, new Set<number>());
      tmp.get(h)!.add(r.year);
    }

    for (const [h, set] of tmp.entries()) {
      map.set(h, Array.from(set).sort((a, b) => b - a));
    }
    return map;
  }, [rows]);

  // Defaults: intenta agarrar el último año disponible para Marriott si existe
  const defaultYear = useMemo(() => {
    const ys = yearsByHotel.get("MARRIOTT");
    return ys?.[0] ?? new Date().getFullYear();
  }, [yearsByHotel]);

  // ============================
  // BLOQUE JCR
  // ============================
  const [jcrHotel, setJcrHotel] = useState<HotelKey>("MARRIOTT");
  const [jcrYear, setJcrYear] = useState<number>(defaultYear);
  const [jcrBaseYear, setJcrBaseYear] = useState<number>(defaultYear - 1);
  const [jcrHof, setJcrHof] = useState<HofTab>("History");
  const [jcrMonth, setJcrMonth] = useState<number>(0);

  // Ajuste cuando llegan años detectados
  useEffect(() => {
    const ys = yearsByHotel.get(jcrHotel);
    if (!ys || ys.length === 0) return;

    // si el seleccionado no existe, lo movemos al más reciente
    if (!ys.includes(jcrYear)) setJcrYear(ys[0]);
    if (!ys.includes(jcrBaseYear)) setJcrBaseYear(ys[Math.min(1, ys.length - 1)] ?? ys[0] - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearsByHotel, jcrHotel]);

  const jcrYears = useMemo(() => yearsByHotel.get(jcrHotel) ?? [], [yearsByHotel, jcrHotel]);

  const jcrFiltered = useMemo(() => {
    const hotelRows = rows.filter((r) => String(r.empresa).trim() === jcrHotel);

    const applyHof = (rs: HfRow[]) => {
      if (jcrHof === "All") return rs;
      return rs.filter((r) => String(r.hof || "").toLowerCase() === jcrHof.toLowerCase());
    };

    const applyMonth = (rs: HfRow[]) => {
      if (!jcrMonth) return rs;
      return rs.filter((r) => r.month === jcrMonth);
    };

    const current = applyMonth(applyHof(hotelRows.filter((r) => r.year === jcrYear)));
    const base = applyMonth(applyHof(hotelRows.filter((r) => r.year === jcrBaseYear)));

    return { current, base };
  }, [rows, jcrHotel, jcrYear, jcrBaseYear, jcrHof, jcrMonth]);

  const jcrKpis = useMemo(() => computeKpis(jcrFiltered.current), [jcrFiltered.current]);
  const jcrBaseKpis = useMemo(() => computeKpis(jcrFiltered.base), [jcrFiltered.base]);
  const jcrMonthsAgg = useMemo(() => groupByMonth(jcrFiltered.current), [jcrFiltered.current]);
  const jcrMaxMonthRevenue = useMemo(
    () => Math.max(0, ...jcrMonthsAgg.map((m) => m.kpis.totalRevenue)),
    [jcrMonthsAgg]
  );

  // ============================
  // BLOQUE MAITEI (separado)
  // ============================
  const [maiHotel, setMaiHotel] = useState<HotelKey>("MAITEI");
  const [maiYear, setMaiYear] = useState<number>(defaultYear);
  const [maiBaseYear, setMaiBaseYear] = useState<number>(defaultYear - 1);
  const [maiHof, setMaiHof] = useState<HofTab>("History");
  const [maiMonth, setMaiMonth] = useState<number>(0);

  useEffect(() => {
    const ys = yearsByHotel.get(maiHotel);
    if (!ys || ys.length === 0) return;
    if (!ys.includes(maiYear)) setMaiYear(ys[0]);
    if (!ys.includes(maiBaseYear)) setMaiBaseYear(ys[Math.min(1, ys.length - 1)] ?? ys[0] - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearsByHotel, maiHotel]);

  const maiYears = useMemo(() => yearsByHotel.get(maiHotel) ?? [], [yearsByHotel, maiHotel]);

  const maiFiltered = useMemo(() => {
    const hotelRows = rows.filter((r) => String(r.empresa).trim() === maiHotel);

    const applyHof = (rs: HfRow[]) => {
      if (maiHof === "All") return rs;
      return rs.filter((r) => String(r.hof || "").toLowerCase() === maiHof.toLowerCase());
    };

    const applyMonth = (rs: HfRow[]) => {
      if (!maiMonth) return rs;
      return rs.filter((r) => r.month === maiMonth);
    };

    const current = applyMonth(applyHof(hotelRows.filter((r) => r.year === maiYear)));
    const base = applyMonth(applyHof(hotelRows.filter((r) => r.year === maiBaseYear)));

    return { current, base };
  }, [rows, maiHotel, maiYear, maiBaseYear, maiHof, maiMonth]);

  const maiKpis = useMemo(() => computeKpis(maiFiltered.current), [maiFiltered.current]);
  const maiBaseKpis = useMemo(() => computeKpis(maiFiltered.base), [maiFiltered.base]);
  const maiMonthsAgg = useMemo(() => groupByMonth(maiFiltered.current), [maiFiltered.current]);
  const maiMaxMonthRevenue = useMemo(
    () => Math.max(0, ...maiMonthsAgg.map((m) => m.kpis.totalRevenue)),
    [maiMonthsAgg]
  );

  // ============================
  // Render
  // ============================
  if (loading) {
    return (
      <section className="section" style={{ padding: "1.25rem" }}>
        <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
          Cargando H&F…
        </div>
      </section>
    );
  }

  if (err) {
    return (
      <section className="section" style={{ padding: "1.25rem" }}>
        <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
          Error leyendo H&F: {err}
          <div style={{ marginTop: ".5rem", opacity: 0.8 }}>
            Verificá que exista: <b>/public{HOF_PATH}</b> (ej: <b>/public/data/hf_diario.csv</b>)
          </div>
        </div>
      </section>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1.35rem" }}>
      {/* =====================================================
          HEADER GENERAL
      ====================================================== */}
      <section className="section" style={{ padding: "1.25rem" }}>
        <div
          className="card"
          style={{
            borderRadius: 24,
            padding: "1.1rem 1.2rem",
            background: "linear-gradient(135deg, rgba(25,25,25,.98), rgba(40,40,40,.95))",
            color: "white",
            border: "1px solid rgba(255,255,255,.10)",
          }}
        >
          <div style={{ fontSize: "1.45rem", fontWeight: 950, letterSpacing: ".2px" }}>Year Comparator</div>
          <div style={{ marginTop: ".35rem", opacity: 0.85, fontWeight: 700 }}>
            H&F · Comparativa anual · Ranking mensual · Detalle diario
          </div>
          <div style={{ marginTop: ".55rem", opacity: 0.75, fontWeight: 700, fontSize: ".95rem" }}>
            Fuente: <b>{HOF_PATH}</b> · Filas cargadas: <b>{rows.length}</b>
          </div>
        </div>
      </section>

      {/* =====================================================
          BLOQUE JCR (Sticky rojo)
          Se mantiene “pegado” hasta terminar este bloque
      ====================================================== */}
      <section className="section" style={{ padding: "1.25rem" }} id="jcr">
        <div style={{ position: "relative" }}>
          <div
            className="card"
            style={{
              borderRadius: 22,
              padding: "1rem 1rem 1.1rem",
              background: "linear-gradient(135deg, rgba(170,0,0,.90), rgba(120,0,0,.78))",
              color: "white",
              border: "1px solid rgba(255,255,255,.18)",
              position: "sticky",
              top: 10,
              zIndex: 50,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "1.25rem", fontWeight: 950 }}>Grupo JCR</div>
                <div style={{ opacity: 0.9, fontWeight: 800, marginTop: ".1rem" }}>
                  {jcrHotel} · {jcrYear} vs {jcrBaseYear} · {jcrHof}
                  {jcrMonth ? ` · Mes ${jcrMonth}` : " · Año completo"}
                </div>
              </div>

              <div style={{ opacity: 0.9, fontWeight: 800, textAlign: "right" }}>
                Filas actuales: <b>{jcrFiltered.current.length}</b> · base: <b>{jcrFiltered.base.length}</b>
              </div>
            </div>

            <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginTop: ".85rem", alignItems: "center" }}>
              {/* Hotel */}
              <div style={{ display: "flex", gap: ".45rem", alignItems: "center" }}>
                <span style={{ opacity: 0.95, fontWeight: 900 }}>Hotel</span>
                <select
                  value={jcrHotel}
                  onChange={(e) => setJcrHotel(e.target.value as HotelKey)}
                  style={{
                    padding: ".38rem .55rem",
                    borderRadius: 12,
                    fontWeight: 900,
                    border: "1px solid rgba(255,255,255,.35)",
                    background: "rgba(255,255,255,.10)",
                    color: "white",
                    outline: "none",
                  }}
                >
                  {JCR_HOTELS.map((h) => (
                    <option key={h} value={h} style={{ color: "#111" }}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Año */}
              <div style={{ display: "flex", gap: ".45rem", alignItems: "center" }}>
                <span style={{ opacity: 0.95, fontWeight: 900 }}>Año</span>
                <select
                  value={jcrYear}
                  onChange={(e) => setJcrYear(Number(e.target.value))}
                  style={{
                    padding: ".38rem .55rem",
                    borderRadius: 12,
                    fontWeight: 900,
                    border: "1px solid rgba(255,255,255,.35)",
                    background: "rgba(255,255,255,.10)",
                    color: "white",
                    outline: "none",
                  }}
                >
                  {(jcrYears.length ? jcrYears : [jcrYear]).map((y) => (
                    <option key={y} value={y} style={{ color: "#111" }}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              {/* Base */}
              <div style={{ display: "flex", gap: ".45rem", alignItems: "center" }}>
                <span style={{ opacity: 0.95, fontWeight: 900 }}>Vs</span>
                <select
                  value={jcrBaseYear}
                  onChange={(e) => setJcrBaseYear(Number(e.target.value))}
                  style={{
                    padding: ".38rem .55rem",
                    borderRadius: 12,
                    fontWeight: 900,
                    border: "1px solid rgba(255,255,255,.35)",
                    background: "rgba(255,255,255,.10)",
                    color: "white",
                    outline: "none",
                  }}
                >
                  {(jcrYears.length ? jcrYears : [jcrBaseYear]).map((y) => (
                    <option key={y} value={y} style={{ color: "#111" }}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              {/* HoF */}
              <div style={{ display: "flex", gap: ".45rem", alignItems: "center" }}>
                <span style={{ opacity: 0.95, fontWeight: 900 }}>HoF</span>
                <Pill active={jcrHof === "History"} onClick={() => setJcrHof("History")} bgActive="rgba(255,255,255,.22)" bgInactive="rgba(0,0,0,.12)">
                  History
                </Pill>
                <Pill active={jcrHof === "Forecast"} onClick={() => setJcrHof("Forecast")} bgActive="rgba(255,255,255,.22)" bgInactive="rgba(0,0,0,.12)">
                  Forecast
                </Pill>
                <Pill active={jcrHof === "All"} onClick={() => setJcrHof("All")} bgActive="rgba(255,255,255,.22)" bgInactive="rgba(0,0,0,.12)">
                  Todo
                </Pill>
              </div>

              {/* Mes */}
              <div style={{ display: "flex", gap: ".45rem", alignItems: "center" }}>
                <span style={{ opacity: 0.95, fontWeight: 900 }}>Mes</span>
                <select
                  value={jcrMonth}
                  onChange={(e) => setJcrMonth(Number(e.target.value))}
                  style={{
                    padding: ".38rem .55rem",
                    borderRadius: 12,
                    fontWeight: 900,
                    border: "1px solid rgba(255,255,255,.35)",
                    background: "rgba(255,255,255,.10)",
                    color: "white",
                    outline: "none",
                  }}
                >
                  <option value={0} style={{ color: "#111" }}>
                    Año completo
                  </option>
                  {Array.from({ length: 12 }).map((_, i) => {
                    const m = i + 1;
                    return (
                      <option key={m} value={m} style={{ color: "#111" }}>
                        {m}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>

          {/* Contenido JCR */}
          <div style={{ marginTop: "1rem" }}>
            {jcrFiltered.current.length === 0 ? (
              <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
                <b>Sin datos</b> para <b>{jcrHotel}</b> en <b>{jcrYear}</b> con filtros actuales.
                <div style={{ marginTop: ".45rem", opacity: 0.8 }}>
                  Años detectados para {jcrHotel}: <b>{(jcrYears.length ? jcrYears : ["(ninguno)"]).join(", ")}</b>
                </div>
              </div>
            ) : (
              <>
                {/* KPIs (carrousel simple) */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: ".75rem" }}>
                  <Card title="Ocupación (promedio)" value={formatPct01(jcrKpis.avgOcc)} sub={`${jcrYear} · vs ${formatPct01(jcrBaseKpis.avgOcc)}`} />
                  <Card title="Room Revenue" value={formatMoneyUSD0(jcrKpis.totalRevenue)} sub={`${jcrYear} · vs ${formatMoneyUSD0(jcrBaseKpis.totalRevenue)}`} />
                  <Card title="ADR (aprox.)" value={formatMoneyUSD0(jcrKpis.approxADR)} sub={`${jcrYear} · vs ${formatMoneyUSD0(jcrBaseKpis.approxADR)}`} />
                  <Card title="Rooms Sold" value={formatInt(jcrKpis.totalRoomsSold)} sub={`${jcrYear} · vs ${formatInt(jcrBaseKpis.totalRoomsSold)}`} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: ".75rem", marginTop: ".75rem" }}>
                  <Card title="Pax / Room (aprox.)" value={jcrKpis.doubleOcc.toFixed(2).replace(".", ",")} sub={`${jcrYear} · vs ${jcrBaseKpis.doubleOcc.toFixed(2).replace(".", ",")}`} />
                  <Card title="Average Rate (promedio)" value={formatMoneyUSD0(jcrKpis.avgRate)} sub={`${jcrYear} · vs ${formatMoneyUSD0(jcrBaseKpis.avgRate)}`} />
                </div>

                {/* Ranking mensual + barras */}
                <div style={{ marginTop: "1.1rem" }}>
                  <div style={{ fontSize: "1.15rem", fontWeight: 950, marginBottom: ".5rem" }}>Ranking mensual (Revenue) — {jcrYear}</div>

                  <div className="card" style={{ borderRadius: 18, padding: "1rem" }}>
                    {jcrMonthsAgg.length === 0 ? (
                      <div style={{ opacity: 0.85 }}>Sin filas para ranking mensual con los filtros actuales.</div>
                    ) : (
                      <div style={{ display: "grid", gap: ".55rem" }}>
                        {jcrMonthsAgg
                          .slice()
                          .sort((a, b) => b.kpis.totalRevenue - a.kpis.totalRevenue)
                          .map((m) => (
                            <BarRow
                              key={m.month}
                              label={`Mes ${m.month}`}
                              value={m.kpis.totalRevenue}
                              max={jcrMaxMonthRevenue}
                              right={formatMoneyUSD0(m.kpis.totalRevenue)}
                            />
                          ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Tabla mensual detallada */}
                <div style={{ marginTop: "1rem" }}>
                  <div style={{ fontSize: "1.15rem", fontWeight: 950, marginBottom: ".5rem" }}>
                    Resumen mensual (Ocupación / ADR / Revenue) — {jcrYear}
                  </div>

                  <div className="card" style={{ borderRadius: 18, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "rgba(0,0,0,.06)" }}>
                          <th style={{ textAlign: "left", padding: ".6rem .75rem" }}>Mes</th>
                          <th style={{ textAlign: "right", padding: ".6rem .75rem" }}>Días</th>
                          <th style={{ textAlign: "right", padding: ".6rem .75rem" }}>Ocup. prom</th>
                          <th style={{ textAlign: "right", padding: ".6rem .75rem" }}>Revenue</th>
                          <th style={{ textAlign: "right", padding: ".6rem .75rem" }}>ADR aprox</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jcrMonthsAgg
                          .slice()
                          .sort((a, b) => a.month - b.month)
                          .map((m) => (
                            <tr key={m.month} style={{ borderTop: "1px solid rgba(0,0,0,.08)" }}>
                              <td style={{ padding: ".55rem .75rem", fontWeight: 900 }}>{m.month}</td>
                              <td style={{ padding: ".55rem .75rem", textAlign: "right" }}>{formatInt(m.kpis.days)}</td>
                              <td style={{ padding: ".55rem .75rem", textAlign: "right" }}>{formatPct01(m.kpis.avgOcc)}</td>
                              <td style={{ padding: ".55rem .75rem", textAlign: "right" }}>{formatMoneyUSD0(m.kpis.totalRevenue)}</td>
                              <td style={{ padding: ".55rem .75rem", textAlign: "right" }}>{formatMoneyUSD0(m.kpis.approxADR)}</td>
                            </tr>
                          ))}
                        {jcrMonthsAgg.length === 0 && (
                          <tr>
                            <td colSpan={5} style={{ padding: ".75rem", opacity: 0.85 }}>
                              Sin filas para armar resumen mensual con los filtros actuales.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ marginTop: ".75rem", opacity: 0.8, fontSize: ".95rem", fontWeight: 700 }}>
                    Nota: Ocupación = <b>promedio diario de Occ.%</b> (por eso nunca supera 100%).
                  </div>
                </div>

                {/* Detalle diario (muestra hasta 60 filas para no matar UI) */}
                <div style={{ marginTop: "1rem" }}>
                  <div style={{ fontSize: "1.15rem", fontWeight: 950, marginBottom: ".5rem" }}>
                    Detalle diario — {jcrHotel} · {jcrYear} {jcrMonth ? `(mes ${jcrMonth})` : ""}
                  </div>

                  <div className="card" style={{ borderRadius: 18, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "rgba(0,0,0,.06)" }}>
                          <th style={{ textAlign: "left", padding: ".6rem .75rem" }}>Fecha</th>
                          <th style={{ textAlign: "right", padding: ".6rem .75rem" }}>Occ.%</th>
                          <th style={{ textAlign: "right", padding: ".6rem .75rem" }}>Revenue</th>
                          <th style={{ textAlign: "right", padding: ".6rem .75rem" }}>ADR</th>
                          <th style={{ textAlign: "right", padding: ".6rem .75rem" }}>Rooms</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jcrFiltered.current
                          .slice()
                          .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0))
                          .slice(0, 60)
                          .map((r, idx) => (
                            <tr key={idx} style={{ borderTop: "1px solid rgba(0,0,0,.08)" }}>
                              <td style={{ padding: ".55rem .75rem", fontWeight: 900 }}>
                                {r.date ? r.date.toLocaleDateString("es-AR") : "-"}
                              </td>
                              <td style={{ padding: ".55rem .75rem", textAlign: "right" }}>{formatPct01(r.occPct)}</td>
                              <td style={{ padding: ".55rem .75rem", textAlign: "right" }}>{formatMoneyUSD0(r.roomRevenue)}</td>
                              <td style={{ padding: ".55rem .75rem", textAlign: "right" }}>
                                {formatMoneyUSD0(r.totalOcc > 0 ? r.roomRevenue / r.totalOcc : r.averageRate)}
                              </td>
                              <td style={{ padding: ".55rem .75rem", textAlign: "right" }}>{formatInt(r.totalOcc)}</td>
                            </tr>
                          ))}
                        {jcrFiltered.current.length === 0 && (
                          <tr>
                            <td colSpan={5} style={{ padding: ".75rem", opacity: 0.85 }}>
                              Sin filas con los filtros actuales.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {jcrFiltered.current.length > 60 ? (
                    <div style={{ marginTop: ".5rem", opacity: 0.75, fontWeight: 700 }}>
                      Mostrando 60 de {formatInt(jcrFiltered.current.length)} filas (para performance).
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* =====================================================
          BLOQUE MAITEI (Management Gotel) — separado
      ====================================================== */}
      <section className="section" style={{ padding: "1.25rem" }} id="maitei">
        <div style={{ position: "relative" }}>
          <div
            className="card"
            style={{
              borderRadius: 22,
              padding: "1rem 1rem 1.1rem",
              background: "linear-gradient(135deg, rgba(30,140,220,.92), rgba(20,95,175,.82))",
              color: "white",
              border: "1px solid rgba(255,255,255,.18)",
              position: "sticky",
              top: 10,
              zIndex: 40,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "1.25rem", fontWeight: 950 }}>MAITEI · Management Gotel</div>
                <div style={{ opacity: 0.9, fontWeight: 800, marginTop: ".1rem" }}>
                  {maiHotel} · {maiYear} vs {maiBaseYear} · {maiHof}
                  {maiMonth ? ` · Mes ${maiMonth}` : " · Año completo"}
                </div>
              </div>

              <div style={{ opacity: 0.9, fontWeight: 800, textAlign: "right" }}>
                Filas actuales: <b>{maiFiltered.current.length}</b> · base: <b>{maiFiltered.base.length}</b>
              </div>
            </div>

            <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginTop: ".85rem", alignItems: "center" }}>
              {/* Hotel (solo MAITEI, pero queda preparado) */}
              <div style={{ display: "flex", gap: ".45rem", alignItems: "center" }}>
                <span style={{ opacity: 0.95, fontWeight: 900 }}>Hotel</span>
                <select
                  value={maiHotel}
                  onChange={(e) => setMaiHotel(e.target.value as HotelKey)}
                  style={{
                    padding: ".38rem .55rem",
                    borderRadius: 12,
                    fontWeight: 900,
                    border: "1px solid rgba(255,255,255,.35)",
                    background: "rgba(255,255,255,.10)",
                    color: "white",
                    outline: "none",
                  }}
                >
                  {MAITEI_HOTELS.map((h) => (
                    <option key={h} value={h} style={{ color: "#111" }}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Año */}
              <div style={{ display: "flex", gap: ".45rem", alignItems: "center" }}>
                <span style={{ opacity: 0.95, fontWeight: 900 }}>Año</span>
                <select
                  value={maiYear}
                  onChange={(e) => setMaiYear(Number(e.target.value))}
                  style={{
                    padding: ".38rem .55rem",
                    borderRadius: 12,
                    fontWeight: 900,
                    border: "1px solid rgba(255,255,255,.35)",
                    background: "rgba(255,255,255,.10)",
                    color: "white",
                    outline: "none",
                  }}
                >
                  {(maiYears.length ? maiYears : [maiYear]).map((y) => (
                    <option key={y} value={y} style={{ color: "#111" }}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              {/* Base */}
              <div style={{ display: "flex", gap: ".45rem", alignItems: "center" }}>
                <span style={{ opacity: 0.95, fontWeight: 900 }}>Vs</span>
                <select
                  value={maiBaseYear}
                  onChange={(e) => setMaiBaseYear(Number(e.target.value))}
                  style={{
                    padding: ".38rem .55rem",
                    borderRadius: 12,
                    fontWeight: 900,
                    border: "1px solid rgba(255,255,255,.35)",
                    background: "rgba(255,255,255,.10)",
                    color: "white",
                    outline: "none",
                  }}
                >
                  {(maiYears.length ? maiYears : [maiBaseYear]).map((y) => (
                    <option key={y} value={y} style={{ color: "#111" }}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              {/* HoF */}
              <div style={{ display: "flex", gap: ".45rem", alignItems: "center" }}>
                <span style={{ opacity: 0.95, fontWeight: 900 }}>HoF</span>
                <Pill active={maiHof === "History"} onClick={() => setMaiHof("History")} bgActive="rgba(255,255,255,.22)" bgInactive="rgba(0,0,0,.12)">
                  History
                </Pill>
                <Pill active={maiHof === "Forecast"} onClick={() => setMaiHof("Forecast")} bgActive="rgba(255,255,255,.22)" bgInactive="rgba(0,0,0,.12)">
                  Forecast
                </Pill>
                <Pill active={maiHof === "All"} onClick={() => setMaiHof("All")} bgActive="rgba(255,255,255,.22)" bgInactive="rgba(0,0,0,.12)">
                  Todo
                </Pill>
              </div>

              {/* Mes */}
              <div style={{ display: "flex", gap: ".45rem", alignItems: "center" }}>
                <span style={{ opacity: 0.95, fontWeight: 900 }}>Mes</span>
                <select
                  value={maiMonth}
                  onChange={(e) => setMaiMonth(Number(e.target.value))}
                  style={{
                    padding: ".38rem .55rem",
                    borderRadius: 12,
                    fontWeight: 900,
                    border: "1px solid rgba(255,255,255,.35)",
                    background: "rgba(255,255,255,.10)",
                    color: "white",
                    outline: "none",
                  }}
                >
                  <option value={0} style={{ color: "#111" }}>
                    Año completo
                  </option>
                  {Array.from({ length: 12 }).map((_, i) => {
                    const m = i + 1;
                    return (
                      <option key={m} value={m} style={{ color: "#111" }}>
                        {m}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>

          {/* Contenido MAITEI */}
          <div style={{ marginTop: "1rem" }}>
            {maiFiltered.current.length === 0 ? (
              <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
                <b>Sin datos</b> para <b>{maiHotel}</b> en <b>{maiYear}</b> con filtros actuales.
                <div style={{ marginTop: ".45rem", opacity: 0.8 }}>
                  Años detectados para {maiHotel}: <b>{(maiYears.length ? maiYears : ["(ninguno)"]).join(", ")}</b>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: ".75rem" }}>
                  <Card title="Ocupación (promedio)" value={formatPct01(maiKpis.avgOcc)} sub={`${maiYear} · vs ${formatPct01(maiBaseKpis.avgOcc)}`} />
                  <Card title="Room Revenue" value={formatMoneyUSD0(maiKpis.totalRevenue)} sub={`${maiYear} · vs ${formatMoneyUSD0(maiBaseKpis.totalRevenue)}`} />
                  <Card title="ADR (aprox.)" value={formatMoneyUSD0(maiKpis.approxADR)} sub={`${maiYear} · vs ${formatMoneyUSD0(maiBaseKpis.approxADR)}`} />
                  <Card title="Rooms Sold" value={formatInt(maiKpis.totalRoomsSold)} sub={`${maiYear} · vs ${formatInt(maiBaseKpis.totalRoomsSold)}`} />
                </div>

                <div style={{ marginTop: "1.1rem" }}>
                  <div style={{ fontSize: "1.15rem", fontWeight: 950, marginBottom: ".5rem" }}>Ranking mensual (Revenue) — {maiYear}</div>

                  <div className="card" style={{ borderRadius: 18, padding: "1rem" }}>
                    {maiMonthsAgg.length === 0 ? (
                      <div style={{ opacity: 0.85 }}>Sin filas para ranking mensual con los filtros actuales.</div>
                    ) : (
                      <div style={{ display: "grid", gap: ".55rem" }}>
                        {maiMonthsAgg
                          .slice()
                          .sort((a, b) => b.kpis.totalRevenue - a.kpis.totalRevenue)
                          .map((m) => (
                            <div key={m.month} style={{ display: "grid", gridTemplateColumns: "120px 1fr 140px", gap: ".6rem", alignItems: "center" }}>
                              <div style={{ fontWeight: 900 }}>{`Mes ${m.month}`}</div>
                              <div style={{ height: 10, borderRadius: 999, background: "rgba(0,0,0,.08)", overflow: "hidden" }}>
                                <div style={{ width: `${(maiMaxMonthRevenue ? Math.min(1, m.kpis.totalRevenue / maiMaxMonthRevenue) : 0) * 100}%`, height: 10, borderRadius: 999, background: "rgba(30,140,220,.75)" }} />
                              </div>
                              <div style={{ textAlign: "right", fontWeight: 900 }}>{formatMoneyUSD0(m.kpis.totalRevenue)}</div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
