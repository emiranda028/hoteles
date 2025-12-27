"use client";

import React, { useEffect, useMemo, useState } from "react";

/* =========================================================
   CONFIG
========================================================= */

type GlobalHotel = "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";

const JCR_HOTELS: GlobalHotel[] = ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];
const GOTEL_HOTELS: GlobalHotel[] = ["MAITEI"];

const HF_PATH = "/data/hf_diario.csv";

// Importante: XLSX en navegador sin librerías rompe, así que lo dejo en CSV
const MEMBERSHIP_CSV_PATH = "/data/jcr_membership.csv";
const NACIONALIDADES_CSV_PATH = "/data/jcr_nacionalidades.csv";

/* =========================================================
   CSV ROBUST PARSER (sin libs)
   - respeta comillas
   - soporta \n dentro de "..."
   - autodetecta delimitador: , ; \t
========================================================= */

function detectDelimiter(sampleLine: string): string {
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    const count = sampleLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

function normalizeHeader(h: string): string {
  return h
    .replace(/^\uFEFF/, "")
    .replace(/^"|"$/g, "")
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCell(v: string): string {
  return String(v ?? "")
    .replace(/^"|"$/g, "")
    .replace(/\r/g, "")
    .trim();
}

function parseCsvRobust(text: string): Record<string, string>[] {
  const src = text.replace(/^\uFEFF/, "");
  if (!src.trim()) return [];

  // primera “línea lógica” (hasta \n fuera de comillas) para detectar delimitador
  let inQuotes = false;
  let firstRecord = "";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"') {
      const next = src[i + 1];
      if (inQuotes && next === '"') {
        firstRecord += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "\n" && !inQuotes) break;
    firstRecord += ch;
  }

  const delimiter = detectDelimiter(firstRecord);

  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (ch === '"') {
      const next = src[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      row.push(cur);
      cur = "";
      continue;
    }

    if (!inQuotes && ch === "\n") {
      row.push(cur);
      cur = "";
      rows.push(row);
      row = [];
      continue;
    }

    cur += ch;
  }

  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows[0].map((h) => normalizeHeader(h));
  const out: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    if (cols.every((c) => !String(c ?? "").trim())) continue;

    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c] || `col_${c}`;
      obj[key] = normalizeCell(cols[c] ?? "");
    }
    out.push(obj);
  }

  return out;
}

async function readCsv(path: string): Promise<Record<string, string>[]> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`No se pudo leer CSV: ${path} (${res.status})`);
  }
  const text = await res.text();
  return parseCsvRobust(text);
}

/* =========================================================
   NUM HELPERS
========================================================= */

function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (!s) return 0;

  // soporta 22.441,71 / 22,441.71 / 59,40% etc
  const cleaned = s
    .replace(/\s/g, "")
    .replace(/\./g, "") // miles
    .replace(",", ".") // decimal
    .replace("%", "");
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

function clamp01(n: number): number {
  if (!isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function formatInt(n: number): string {
  return Math.round(n).toLocaleString("es-AR");
}

function formatMoney(n: number): string {
  // Si tu revenue está en USD, ok. Si es ARS, cambiá currency.
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatPct01(n: number): string {
  return (clamp01(n) * 100).toFixed(1) + "%";
}

function monthName(m: number): string {
  const names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return names[m - 1] ?? `M${m}`;
}

/* =========================================================
   DATE / YEAR / MONTH HELPERS
========================================================= */

function parseDateSmart(row: Record<string, string>): Date | null {
  // busca una columna Fecha o Date
  const raw =
    row["Fecha"] ||
    row["FECHA"] ||
    row["Date"] ||
    row["DATE"] ||
    row["date"] ||
    "";

  const s = String(raw).trim();
  if (!s) return null;

  // Caso Excel serial (si te llega algo como 46004, etc)
  const asNum = Number(s);
  if (Number.isFinite(asNum) && asNum > 30000) {
    // Excel: days since 1899-12-30
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + asNum * 86400000);
    return d;
  }

  // dd-mm-yy or dd/mm/yyyy
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    let yy = Number(m1[3]);
    if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // ISO
  const d2 = new Date(s);
  return isNaN(d2.getTime()) ? null : d2;
}

function getYear(row: Record<string, string>): number | null {
  // algunos archivos de nacionalidades traen "Año"
  const ay = row["Año"] || row["ANO"] || row["Anio"] || row["Year"];
  if (ay) {
    const n = Number(String(ay).trim());
    if (Number.isFinite(n) && n > 1900 && n < 2200) return n;
  }

  const d = parseDateSmart(row);
  return d ? d.getFullYear() : null;
}

function getMonth(row: Record<string, string>): number | null {
  // algunos archivos traen Mes o N° Mes
  const nm = row["N° Mes"] || row["N°Mes"] || row["N Mes"] || row["N Mes."] || row["N Mes "] || row["Month"];
  if (nm) {
    const n = Number(String(nm).trim());
    if (Number.isFinite(n) && n >= 1 && n <= 12) return n;
  }

  const d = parseDateSmart(row);
  return d ? d.getMonth() + 1 : null;
}

function pickKey(keys: string[], candidates: string[]): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const map = new Map(keys.map((k) => [norm(k), k]));
  for (const c of candidates) {
    const found = map.get(norm(c));
    if (found) return found;
  }
  // fallback "includes"
  for (const k of keys) {
    const nk = norm(k);
    for (const c of candidates) {
      if (nk.includes(norm(c))) return k;
    }
  }
  return null;
}

/* =========================================================
   HF METRICS (History & Forecast)
========================================================= */

type HofRow = Record<string, string>;

function isHistoryRow(r: HofRow): boolean {
  const hof = (r["HoF"] || r["HOF"] || "").toLowerCase();
  return hof.includes("history");
}

function rowHotel(r: HofRow): string {
  return (r["Empresa"] || r["Hotel"] || r["EMPRESA"] || "").trim().toUpperCase();
}

function occPct01FromRow(r: HofRow): number {
  const kOccPct = r["Occ.%"] ?? r["Occ%"] ?? r["Occ %"] ?? r["Occ. %"] ?? r["Occ. % "];
  if (kOccPct !== undefined && kOccPct !== null && String(kOccPct).includes("%")) {
    const n = toNumberSmart(kOccPct);
    return clamp01(n / 100);
  }
  // si viene como 0,594
  const n2 = toNumberSmart(kOccPct);
  if (n2 > 0 && n2 <= 1) return clamp01(n2);
  if (n2 > 1 && n2 <= 100) return clamp01(n2 / 100);

  // si no hay Occ.% usamos estimación: Total Occ / (Total Occ + OOO + House Use)
  const totalOcc = toNumberSmart(r['Total Occ.'] ?? r["Total Occ"] ?? r["Total Occ. "] ?? r["Total Occ.\t"]);
  const ooo = toNumberSmart(r['"OOO\nRooms"'] ?? r["OOO Rooms"] ?? r["OOO\nRooms"] ?? r["OOO Rooms "]);
  const house = toNumberSmart(r['"House\nUse"'] ?? r["House Use"] ?? r["House\nUse"]);
  const denom = totalOcc + ooo + house;
  return clamp01(safeDiv(totalOcc, denom));
}

function roomsOcc(r: HofRow): number {
  return toNumberSmart(r['Total Occ.'] ?? r["Total Occ"] ?? r["Total Occ. "]);
}

function roomRevenue(r: HofRow): number {
  return toNumberSmart(r["Room Revenue"] ?? r["RoomRevenue"] ?? r["Room\nRevenue"]);
}

function adr(r: HofRow): number {
  return toNumberSmart(r["Average Rate"] ?? r["ADR"] ?? r["Average\nRate"]);
}

function persons(r: HofRow): number {
  return toNumberSmart(r['"Adl. &\nChl."'] ?? r["Adl. & Chl."] ?? r["Adl. &\nChl."] ?? r["Adl. & Chl."]);
}

type HofAgg = {
  days: number;
  roomsOcc: number;
  roomRevenue: number;
  persons: number;
  occPctSum: number; // para promedio simple si hace falta
  adrWeightedSum: number; // ADR ponderado por roomsOcc
};

function emptyAgg(): HofAgg {
  return { days: 0, roomsOcc: 0, roomRevenue: 0, persons: 0, occPctSum: 0, adrWeightedSum: 0 };
}

function addAgg(a: HofAgg, r: HofRow): HofAgg {
  const ro = roomsOcc(r);
  const rev = roomRevenue(r);
  const p = persons(r);
  const occ = occPct01FromRow(r);
  const rate = adr(r);

  return {
    days: a.days + 1,
    roomsOcc: a.roomsOcc + ro,
    roomRevenue: a.roomRevenue + rev,
    persons: a.persons + p,
    occPctSum: a.occPctSum + occ,
    adrWeightedSum: a.adrWeightedSum + rate * ro,
  };
}

function finalizeAgg(a: HofAgg) {
  const occ = a.days ? a.occPctSum / a.days : 0; // prom simple
  const adrW = a.roomsOcc ? a.adrWeightedSum / a.roomsOcc : 0;
  const dblOcc = a.roomsOcc ? a.persons / a.roomsOcc : 0;
  // RevPAR proxy: ADR * Occ (si no tenemos total rooms)
  const revparProxy = adrW * occ;

  return { occ, adr: adrW, roomRevenue: a.roomRevenue, dblOcc, revpar: revparProxy, roomsOcc: a.roomsOcc, persons: a.persons, days: a.days };
}

function groupByMonth(rows: HofRow[]): Map<number, HofAgg> {
  const m = new Map<number, HofAgg>();
  for (const r of rows) {
    const mm = getMonth(r);
    if (!mm) continue;
    const prev = m.get(mm) ?? emptyAgg();
    m.set(mm, addAgg(prev, r));
  }
  return m;
}

/* =========================================================
   UI: Small components
========================================================= */

function Pill({
  label,
  active,
  onClick,
  color = "#b10f2e",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "1px solid rgba(255,255,255,.25)",
        background: active ? color : "rgba(255,255,255,.12)",
        color: "#fff",
        padding: ".45rem .7rem",
        borderRadius: 14,
        fontWeight: 800,
        cursor: "pointer",
        letterSpacing: ".2px",
      }}
    >
      {label}
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="card"
      style={{
        background: "rgba(255,255,255,.06)",
        border: "1px solid rgba(255,255,255,.10)",
        borderRadius: 18,
        padding: "1rem",
        backdropFilter: "blur(10px)",
      }}
    >
      {children}
    </div>
  );
}

function KpiTile({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        minWidth: 220,
        padding: ".9rem 1rem",
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,.12)",
        background: "rgba(0,0,0,.18)",
      }}
    >
      <div style={{ opacity: 0.85, fontWeight: 800, fontSize: ".95rem" }}>{title}</div>
      <div style={{ fontSize: "1.45rem", fontWeight: 950, marginTop: ".25rem" }}>{value}</div>
      {sub ? <div style={{ marginTop: ".3rem", opacity: 0.75, fontWeight: 700 }}>{sub}</div> : null}
    </div>
  );
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function YearComparator() {
  const [year, setYear] = useState<number>(2024);
  const [baseYear, setBaseYear] = useState<number>(2023);

  // filtros separados
  const [jcrHotel, setJcrHotel] = useState<GlobalHotel>("MARRIOTT");
  const [maiteiHotel, setMaiteiHotel] = useState<GlobalHotel>("MAITEI");

  const [hfRows, setHfRows] = useState<HofRow[]>([]);
  const [hfErr, setHfErr] = useState<string>("");
  const [hfLoading, setHfLoading] = useState<boolean>(false);

  // membership / nacionalidades
  const [memRows, setMemRows] = useState<Record<string, string>[]>([]);
  const [memErr, setMemErr] = useState<string>("");
  const [memLoading, setMemLoading] = useState<boolean>(false);

  const [natRows, setNatRows] = useState<Record<string, string>[]>([]);
  const [natErr, setNatErr] = useState<string>("");
  const [natLoading, setNatLoading] = useState<boolean>(false);

  // carga HF
  useEffect(() => {
    let alive = true;
    setHfLoading(true);
    setHfErr("");
    readCsv(HF_PATH)
      .then((rows) => {
        if (!alive) return;
        setHfRows(rows);
        setHfLoading(false);
        // debug útil
        console.log("[HF] rows:", rows.length);
        console.log("[HF] headers:", rows[0] ? Object.keys(rows[0]) : []);
      })
      .catch((e) => {
        if (!alive) return;
        setHfErr(e?.message ?? "Error leyendo H&F");
        setHfLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // carga membership (CSV)
  useEffect(() => {
    let alive = true;
    setMemLoading(true);
    setMemErr("");
    readCsv(MEMBERSHIP_CSV_PATH)
      .then((rows) => {
        if (!alive) return;
        setMemRows(rows);
        setMemLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        // típico: sigue en xlsx
        setMemErr(e?.message ?? "Error leyendo Membership");
        setMemLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // carga nacionalidades (CSV)
  useEffect(() => {
    let alive = true;
    setNatLoading(true);
    setNatErr("");
    readCsv(NACIONALIDADES_CSV_PATH)
      .then((rows) => {
        if (!alive) return;
        setNatRows(rows);
        setNatLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setNatErr(e?.message ?? "Error leyendo Nacionalidades");
        setNatLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // años disponibles desde HF
  const availableYears = useMemo(() => {
    const set = new Set<number>();
    for (const r of hfRows) {
      const y = getYear(r);
      if (y) set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [hfRows]);

  // si no hay años todavía, deja los defaults
  useEffect(() => {
    if (!availableYears.length) return;
    // si el year actual no existe, tomar el más nuevo
    if (!availableYears.includes(year)) setYear(availableYears[0]);
    // baseYear: el anterior si existe
    const idx = availableYears.indexOf(availableYears[0]);
    const candidate = availableYears[idx + 1] ?? availableYears[0] - 1;
    if (!availableYears.includes(baseYear)) setBaseYear(candidate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableYears]);

  // HF filtrado JCR (History + por hotel)
  const hfJcrYear = useMemo(() => {
    return hfRows.filter((r) => {
      const y = getYear(r);
      if (y !== year) return false;
      if (!isHistoryRow(r)) return false;
      return rowHotel(r) === jcrHotel;
    });
  }, [hfRows, year, jcrHotel]);

  const hfJcrBase = useMemo(() => {
    return hfRows.filter((r) => {
      const y = getYear(r);
      if (y !== baseYear) return false;
      if (!isHistoryRow(r)) return false;
      return rowHotel(r) === jcrHotel;
    });
  }, [hfRows, baseYear, jcrHotel]);

  // HF filtrado MAITEI (History)
  const hfMaiteiYear = useMemo(() => {
    return hfRows.filter((r) => {
      const y = getYear(r);
      if (y !== year) return false;
      if (!isHistoryRow(r)) return false;
      return rowHotel(r) === maiteiHotel;
    });
  }, [hfRows, year, maiteiHotel]);

  const hfMaiteiBase = useMemo(() => {
    return hfRows.filter((r) => {
      const y = getYear(r);
      if (y !== baseYear) return false;
      if (!isHistoryRow(r)) return false;
      return rowHotel(r) === maiteiHotel;
    });
  }, [hfRows, baseYear, maiteiHotel]);

  // agregados
  const jcrAggYear = useMemo(() => {
    let a = emptyAgg();
    for (const r of hfJcrYear) a = addAgg(a, r);
    return finalizeAgg(a);
  }, [hfJcrYear]);

  const jcrAggBase = useMemo(() => {
    let a = emptyAgg();
    for (const r of hfJcrBase) a = addAgg(a, r);
    return finalizeAgg(a);
  }, [hfJcrBase]);

  const maiteiAggYear = useMemo(() => {
    let a = emptyAgg();
    for (const r of hfMaiteiYear) a = addAgg(a, r);
    return finalizeAgg(a);
  }, [hfMaiteiYear]);

  const maiteiAggBase = useMemo(() => {
    let a = emptyAgg();
    for (const r of hfMaiteiBase) a = addAgg(a, r);
    return finalizeAgg(a);
  }, [hfMaiteiBase]);

  // ranking mensual
  const jcrByMonth = useMemo(() => groupByMonth(hfJcrYear), [hfJcrYear]);
  const maiteiByMonth = useMemo(() => groupByMonth(hfMaiteiYear), [hfMaiteiYear]);

  // membership resumen simple (acumulado por año, por hotel)
  const membershipSummary = useMemo(() => {
    if (!memRows.length) return null;

    const keys = memRows[0] ? Object.keys(memRows[0]) : [];
    const kHotel = pickKey(keys, ["Empresa", "Hotel"]);
    const kYear = pickKey(keys, ["Año", "Anio", "Year"]);
    const kQty = pickKey(keys, ["Cantidad", "Qty", "Total"]);

    if (!kHotel || !kYear || !kQty) return null;

    const sum = (yy: number) =>
      memRows
        .filter((r) => String(r[kHotel]).trim().toUpperCase() === jcrHotel && Number(r[kYear]) === yy)
        .reduce((acc, r) => acc + toNumberSmart(r[kQty]), 0);

    const y = sum(year);
    const b = sum(baseYear);
    return { y, b, delta: y - b, pct: b ? (y - b) / b : 0 };
  }, [memRows, jcrHotel, year, baseYear]);

  // nacionalidades: ranking top 10 por país para año, (solo JCR y hotel seleccionado si existe columna Empresa)
  const nationalitiesTop = useMemo(() => {
    if (!natRows.length) return null;

    const keys = natRows[0] ? Object.keys(natRows[0]) : [];
    const kYear = pickKey(keys, ["Año", "Anio", "Year"]);
    const kCountry = pickKey(keys, ["PAÍS", "Pais", "País", "Country", "Pais Origen", "País Origen"]);
    const kAmount = pickKey(keys, ["Importe", "Cantidad", "Total", "Rooms", "Room Nights"]);
    const kHotel = pickKey(keys, ["Empresa", "Hotel"]);

    if (!kYear || !kCountry || !kAmount) return null;

    const filtered = natRows.filter((r) => {
      const yy = Number(r[kYear]);
      if (yy !== year) return false;
      if (kHotel) {
        const h = String(r[kHotel] ?? "").trim().toUpperCase();
        // si el archivo es solo Marriott, no filtramos por hotel
        if (h && JCR_HOTELS.includes(h as GlobalHotel)) {
          return h === jcrHotel;
        }
      }
      return true;
    });

    const map = new Map<string, number>();
    for (const r of filtered) {
      const c = String(r[kCountry]).trim();
      if (!c) continue;
      map.set(c, (map.get(c) ?? 0) + toNumberSmart(r[kAmount]));
    }

    const arr = Array.from(map.entries())
      .map(([country, value]) => ({ country, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
    return { top: arr, total };
  }, [natRows, year, jcrHotel]);

  // estilos sticky
  const stickyBar = (bg: string) => ({
    position: "sticky" as const,
    top: 0,
    zIndex: 20,
    background: bg,
    border: "1px solid rgba(255,255,255,.16)",
    borderRadius: 18,
    padding: ".85rem 1rem",
    backdropFilter: "blur(12px)",
  });

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: "1.25rem", fontWeight: 950, letterSpacing: ".2px" }}>{children}</div>
  );

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      {/* =========================
          BLOQUE JCR
      ========================= */}
      <div id="jcr" style={{ display: "grid", gap: ".9rem" }}>
        <div style={stickyBar("rgba(177, 15, 46, .86)")}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}>
            <div style={{ color: "#fff" }}>
              <div style={{ fontWeight: 950, fontSize: "1.25rem" }}>JCR — Reporte History & Forecast</div>
              <div style={{ opacity: 0.9, fontWeight: 700 }}>
                Hotel: <b>{jcrHotel}</b> · Año: <b>{year}</b> vs <b>{baseYear}</b>
              </div>
            </div>

            <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
                {JCR_HOTELS.map((h) => (
                  <Pill key={h} label={h} active={jcrHotel === h} onClick={() => setJcrHotel(h)} color="#b10f2e" />
                ))}
              </div>

              <div style={{ width: 10 }} />

              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                style={{
                  padding: ".45rem .65rem",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,.22)",
                  background: "rgba(255,255,255,.12)",
                  color: "#fff",
                  fontWeight: 800,
                }}
              >
                {availableYears.length ? (
                  availableYears.map((y) => (
                    <option key={y} value={y} style={{ color: "#000" }}>
                      {y}
                    </option>
                  ))
                ) : (
                  <>
                    <option value={2024} style={{ color: "#000" }}>
                      2024
                    </option>
                    <option value={2023} style={{ color: "#000" }}>
                      2023
                    </option>
                  </>
                )}
              </select>

              <select
                value={baseYear}
                onChange={(e) => setBaseYear(Number(e.target.value))}
                style={{
                  padding: ".45rem .65rem",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,.22)",
                  background: "rgba(255,255,255,.12)",
                  color: "#fff",
                  fontWeight: 800,
                }}
              >
                {availableYears.length ? (
                  availableYears.map((y) => (
                    <option key={y} value={y} style={{ color: "#000" }}>
                      {y}
                    </option>
                  ))
                ) : (
                  <>
                    <option value={2023} style={{ color: "#000" }}>
                      2023
                    </option>
                    <option value={2022} style={{ color: "#000" }}>
                      2022
                    </option>
                  </>
                )}
              </select>
            </div>
          </div>
        </div>

        {/* HF status */}
        {hfLoading ? (
          <Card>Cargando H&F…</Card>
        ) : hfErr ? (
          <Card>
            <b>Error leyendo H&F:</b> {hfErr}
            <div style={{ marginTop: ".5rem", opacity: 0.85 }}>
              Verificá que exista en <code>/public/data</code> el archivo <b>hf_diario.csv</b>
            </div>
          </Card>
        ) : null}

        {/* KPI carousel JCR */}
        <Card>
          <SectionTitle>KPIs (History) — {jcrHotel}</SectionTitle>
          <div style={{ marginTop: ".8rem", display: "flex", gap: ".75rem", overflowX: "auto", paddingBottom: ".25rem" }}>
            <KpiTile title="Ocupación" value={formatPct01(jcrAggYear.occ)} sub={`vs ${baseYear}: ${formatPct01(jcrAggBase.occ)}`} />
            <KpiTile title="ADR" value={formatMoney(jcrAggYear.adr)} sub={`vs ${baseYear}: ${formatMoney(jcrAggBase.adr)}`} />
            <KpiTile title="RevPAR (proxy)" value={formatMoney(jcrAggYear.revpar)} sub={`vs ${baseYear}: ${formatMoney(jcrAggBase.revpar)}`} />
            <KpiTile title="Room Revenue" value={formatMoney(jcrAggYear.roomRevenue)} sub={`vs ${baseYear}: ${formatMoney(jcrAggBase.roomRevenue)}`} />
            <KpiTile title="Doble Ocupación" value={(jcrAggYear.dblOcc || 0).toFixed(2)} sub={`vs ${baseYear}: ${(jcrAggBase.dblOcc || 0).toFixed(2)}`} />
          </div>

          <div style={{ marginTop: ".8rem", opacity: 0.8, fontWeight: 700, fontSize: ".92rem" }}>
            Nota: RevPAR es “proxy” (ADR × Ocupación) porque el archivo no trae “Total Rooms in Hotel”.
          </div>
        </Card>

        {/* Comparativa */}
        <Card>
          <SectionTitle>Comparativa — {year} vs {baseYear}</SectionTitle>

          {(!hfJcrYear.length && !hfJcrBase.length) ? (
            <div style={{ marginTop: ".6rem", opacity: 0.9 }}>
              Sin filas History para el filtro actual. Chequeá valores reales en columna <b>Empresa</b> y <b>HoF</b>.
            </div>
          ) : (
            <div style={{ marginTop: ".8rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: ".75rem" }}>
              <Card>
                <div style={{ fontWeight: 950 }}>Rooms Occ</div>
                <div style={{ fontSize: "1.25rem", fontWeight: 950, marginTop: ".3rem" }}>{formatInt(jcrAggYear.roomsOcc)}</div>
                <div style={{ marginTop: ".2rem", opacity: 0.75 }}>vs {baseYear}: {formatInt(jcrAggBase.roomsOcc)}</div>
              </Card>

              <Card>
                <div style={{ fontWeight: 950 }}>Persons</div>
                <div style={{ fontSize: "1.25rem", fontWeight: 950, marginTop: ".3rem" }}>{formatInt(jcrAggYear.persons)}</div>
                <div style={{ marginTop: ".2rem", opacity: 0.75 }}>vs {baseYear}: {formatInt(jcrAggBase.persons)}</div>
              </Card>

              <Card>
                <div style={{ fontWeight: 950 }}>Room Revenue</div>
                <div style={{ fontSize: "1.25rem", fontWeight: 950, marginTop: ".3rem" }}>{formatMoney(jcrAggYear.roomRevenue)}</div>
                <div style={{ marginTop: ".2rem", opacity: 0.75 }}>
                  Δ: {formatMoney(jcrAggYear.roomRevenue - jcrAggBase.roomRevenue)} ·{" "}
                  {formatPct01(jcrAggBase.roomRevenue ? (jcrAggYear.roomRevenue - jcrAggBase.roomRevenue) / jcrAggBase.roomRevenue : 0)}
                </div>
              </Card>
            </div>
          )}
        </Card>

        {/* Ranking mensual */}
        <Card>
          <SectionTitle>Ranking por mes — {year} (History)</SectionTitle>

          {!hfJcrYear.length ? (
            <div style={{ marginTop: ".6rem", opacity: 0.9 }}>Sin datos para {jcrHotel} en {year}.</div>
          ) : (
            <div style={{ marginTop: ".8rem", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".95rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", opacity: 0.9 }}>
                    <th style={{ padding: ".55rem .5rem" }}>Mes</th>
                    <th style={{ padding: ".55rem .5rem" }}>Occ%</th>
                    <th style={{ padding: ".55rem .5rem" }}>ADR</th>
                    <th style={{ padding: ".55rem .5rem" }}>RevPAR (proxy)</th>
                    <th style={{ padding: ".55rem .5rem" }}>Room Revenue</th>
                    <th style={{ padding: ".55rem .5rem" }}>Rooms Occ</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(jcrByMonth.entries())
                    .sort((a, b) => a[0] - b[0])
                    .map(([m, agg]) => {
                      const f = finalizeAgg(agg);
                      return (
                        <tr key={m} style={{ borderTop: "1px solid rgba(255,255,255,.10)" }}>
                          <td style={{ padding: ".55rem .5rem", fontWeight: 900 }}>{monthName(m)}</td>
                          <td style={{ padding: ".55rem .5rem" }}>{formatPct01(f.occ)}</td>
                          <td style={{ padding: ".55rem .5rem" }}>{formatMoney(f.adr)}</td>
                          <td style={{ padding: ".55rem .5rem" }}>{formatMoney(f.revpar)}</td>
                          <td style={{ padding: ".55rem .5rem" }}>{formatMoney(f.roomRevenue)}</td>
                          <td style={{ padding: ".55rem .5rem" }}>{formatInt(f.roomsOcc)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Membership */}
        <Card>
          <SectionTitle>Membership (JCR) — {year} vs {baseYear}</SectionTitle>

          {memLoading ? (
            <div style={{ marginTop: ".6rem" }}>Cargando membership…</div>
          ) : memErr ? (
            <div style={{ marginTop: ".6rem" }}>
              <b>Error leyendo Membership:</b> {memErr}
              <div style={{ marginTop: ".5rem", opacity: 0.85 }}>
                Solución: convertí <code>jcr_membership.xlsx</code> a <code>jcr_membership.csv</code> y subilo a <code>/public/data</code>
              </div>
            </div>
          ) : membershipSummary ? (
            <div style={{ marginTop: ".8rem", display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
              <KpiTile title={`${year}`} value={formatInt(membershipSummary.y)} />
              <KpiTile title={`${baseYear}`} value={formatInt(membershipSummary.b)} />
              <KpiTile title="Δ" value={formatInt(membershipSummary.delta)} sub={formatPct01(membershipSummary.pct)} />
            </div>
          ) : (
            <div style={{ marginTop: ".6rem", opacity: 0.9 }}>
              Sin datos de membership para el esquema actual (CSV).
            </div>
          )}
        </Card>

        {/* Nacionalidades */}
        <Card id="nacionalidades">
          <SectionTitle>Nacionalidades — Ranking (JCR)</SectionTitle>

          {natLoading ? (
            <div style={{ marginTop: ".6rem" }}>Cargando nacionalidades…</div>
          ) : natErr ? (
            <div style={{ marginTop: ".6rem" }}>
              <b>Error leyendo Nacionalidades:</b> {natErr}
              <div style={{ marginTop: ".5rem", opacity: 0.85 }}>
                Solución: convertí <code>jcr_nacionalidades.xlsx</code> a <code>jcr_nacionalidades.csv</code> y subilo a <code>/public/data</code>
              </div>
            </div>
          ) : nationalitiesTop ? (
            <div style={{ marginTop: ".8rem", overflowX: "auto" }}>
              <div style={{ opacity: 0.85, fontWeight: 800, marginBottom: ".5rem" }}>
                Año {year} · Total: {formatInt(nationalitiesTop.total)}
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".95rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", opacity: 0.9 }}>
                    <th style={{ padding: ".55rem .5rem" }}>País</th>
                    <th style={{ padding: ".55rem .5rem" }}>Valor</th>
                    <th style={{ padding: ".55rem .5rem" }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {nationalitiesTop.top.map((r) => {
                    const pct = nationalitiesTop.total ? r.value / nationalitiesTop.total : 0;
                    return (
                      <tr key={r.country} style={{ borderTop: "1px solid rgba(255,255,255,.10)" }}>
                        <td style={{ padding: ".55rem .5rem", fontWeight: 900 }}>{r.country}</td>
                        <td style={{ padding: ".55rem .5rem" }}>{formatInt(r.value)}</td>
                        <td style={{ padding: ".55rem .5rem" }}>{formatPct01(pct)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div style={{ marginTop: ".8rem", opacity: 0.8, fontWeight: 700 }}>
                (Si querés banderas como antes: lo hacemos con una tabla de mapping País → código ISO y un `<img>` con CDN,
                pero primero dejemos los datos perfectos.)
              </div>
            </div>
          ) : (
            <div style={{ marginTop: ".6rem", opacity: 0.9 }}>Sin datos para {year}.</div>
          )}
        </Card>
      </div>

      {/* =========================
          BLOQUE GOTEL / MAITEI
      ========================= */}
      <div id="gotel" style={{ display: "grid", gap: ".9rem", marginTop: ".5rem" }}>
        <div style={stickyBar("rgba(20, 120, 190, .86)")}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}>
            <div style={{ color: "#fff" }}>
              <div style={{ fontWeight: 950, fontSize: "1.25rem" }}>Gotel (Management) — Maitei</div>
              <div style={{ opacity: 0.9, fontWeight: 700 }}>
                Hotel: <b>{maiteiHotel}</b> · Año: <b>{year}</b> vs <b>{baseYear}</b>
              </div>
            </div>

            <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
              {GOTEL_HOTELS.map((h) => (
                <Pill key={h} label={h} active={maiteiHotel === h} onClick={() => setMaiteiHotel(h)} color="#1478be" />
              ))}
            </div>
          </div>
        </div>

        <Card>
          <SectionTitle>KPIs (History) — {maiteiHotel}</SectionTitle>
          <div style={{ marginTop: ".8rem", display: "flex", gap: ".75rem", overflowX: "auto", paddingBottom: ".25rem" }}>
            <KpiTile title="Ocupación" value={formatPct01(maiteiAggYear.occ)} sub={`vs ${baseYear}: ${formatPct01(maiteiAggBase.occ)}`} />
            <KpiTile title="ADR" value={formatMoney(maiteiAggYear.adr)} sub={`vs ${baseYear}: ${formatMoney(maiteiAggBase.adr)}`} />
            <KpiTile title="RevPAR (proxy)" value={formatMoney(maiteiAggYear.revpar)} sub={`vs ${baseYear}: ${formatMoney(maiteiAggBase.revpar)}`} />
            <KpiTile title="Room Revenue" value={formatMoney(maiteiAggYear.roomRevenue)} sub={`vs ${baseYear}: ${formatMoney(maiteiAggBase.roomRevenue)}`} />
            <KpiTile title="Doble Ocupación" value={(maiteiAggYear.dblOcc || 0).toFixed(2)} sub={`vs ${baseYear}: ${(maiteiAggBase.dblOcc || 0).toFixed(2)}`} />
          </div>
        </Card>

        <Card>
          <SectionTitle>Ranking por mes — {year} (History)</SectionTitle>
          {!hfMaiteiYear.length ? (
            <div style={{ marginTop: ".6rem", opacity: 0.9 }}>Sin datos para {maiteiHotel} en {year}.</div>
          ) : (
            <div style={{ marginTop: ".8rem", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".95rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", opacity: 0.9 }}>
                    <th style={{ padding: ".55rem .5rem" }}>Mes</th>
                    <th style={{ padding: ".55rem .5rem" }}>Occ%</th>
                    <th style={{ padding: ".55rem .5rem" }}>ADR</th>
                    <th style={{ padding: ".55rem .5rem" }}>RevPAR (proxy)</th>
                    <th style={{ padding: ".55rem .5rem" }}>Room Revenue</th>
                    <th style={{ padding: ".55rem .5rem" }}>Rooms Occ</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(maiteiByMonth.entries())
                    .sort((a, b) => a[0] - b[0])
                    .map(([m, agg]) => {
                      const f = finalizeAgg(agg);
                      return (
                        <tr key={m} style={{ borderTop: "1px solid rgba(255,255,255,.10)" }}>
                          <td style={{ padding: ".55rem .5rem", fontWeight: 900 }}>{monthName(m)}</td>
                          <td style={{ padding: ".55rem .5rem" }}>{formatPct01(f.occ)}</td>
                          <td style={{ padding: ".55rem .5rem" }}>{formatMoney(f.adr)}</td>
                          <td style={{ padding: ".55rem .5rem" }}>{formatMoney(f.revpar)}</td>
                          <td style={{ padding: ".55rem .5rem" }}>{formatMoney(f.roomRevenue)}</td>
                          <td style={{ padding: ".55rem .5rem" }}>{formatInt(f.roomsOcc)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
