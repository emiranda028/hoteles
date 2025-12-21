"use client";

import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

/**
 * ============================================================
 * YearComparator.tsx (COMPLETO, autónomo, con datos y responsive)
 * ============================================================
 * - Lee CSV: /public/data/hf_diario.csv
 * - Lee XLSX: /public/data/jcr_membership.xlsx
 * - Lee XLSX: /public/data/jcr_nacionalidades.xlsx
 * - Filtros globales: Año + Hotel (scope)
 * - Nacionalidades: SOLO Marriott (sin filtro de hotel)
 */

type GlobalHotel = "JCR" | "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";

const HF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

const JCR_HOTELS: GlobalHotel[] = ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];

const HOTEL_LABEL: Record<GlobalHotel, string> = {
  JCR: "JCR",
  MARRIOTT: "MARRIOTT",
  "SHERATON BCR": "SHERATON BCR",
  "SHERATON MDQ": "SHERATON MDQ",
  MAITEI: "MAITEI",
};

// -------------------------
// Helpers: parse num/fecha
// -------------------------
function normalizeKey(s: any) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseLocaleNumber(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  const s = String(v).trim();
  if (!s) return 0;

  // Quitar % si viene percent
  const sNoPct = s.replace("%", "").trim();

  // Caso típico ES: 22.441,71  -> 22441.71
  // 1) quitar separador de miles "."
  // 2) reemplazar coma decimal por "."
  const cleaned = sNoPct
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^\d.-]/g, "");

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parsePercent(v: any): number {
  // devuelve 0..1
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") {
    // a veces viene 0.594 o 59.4
    if (v <= 1) return v;
    return v / 100;
  }
  const s = String(v).trim();
  if (!s) return 0;
  const n = parseLocaleNumber(s);
  // si venía "59,40%" -> n=59.40
  if (n > 1) return n / 100;
  return n;
}

// Excel serial date -> JS Date
function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial)) return null;
  // Excel (Windows) base: 1899-12-30
  const utc = Date.UTC(1899, 11, 30);
  const ms = utc + serial * 24 * 60 * 60 * 1000;
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? d : null;
}

function parseAnyDate(v: any): Date | null {
  if (v === null || v === undefined) return null;

  // XLSX con cellDates puede dar Date
  if (v instanceof Date) {
    return Number.isFinite(v.getTime()) ? v : null;
  }

  if (typeof v === "number") {
    // si parece serial Excel (>= 30000)
    if (v >= 20000) return excelSerialToDate(v);
    // si parece epoch ms
    if (v > 10000000000) {
      const d = new Date(v);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    return null;
  }

  const s = String(v).trim();
  if (!s) return null;

  // Algunos CSV tienen "01-06-22 Wed"
  // Nos quedamos con primera parte antes de espacio
  const first = s.split(" ")[0]?.trim() ?? s;

  // dd/mm/yyyy o d/m/yyyy
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(first)) {
    const [dd, mm, yy] = first.split("/").map((x) => Number(x));
    const year = yy < 100 ? 2000 + yy : yy;
    const d = new Date(year, (mm ?? 1) - 1, dd ?? 1);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  // dd-mm-yy o dd-mm-yyyy
  if (/^\d{1,2}-\d{1,2}-\d{2,4}$/.test(first)) {
    const [dd, mm, yy] = first.split("-").map((x) => Number(x));
    const year = yy < 100 ? 2000 + yy : yy;
    const d = new Date(year, (mm ?? 1) - 1, dd ?? 1);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  // ISO
  const d2 = new Date(s);
  return Number.isFinite(d2.getTime()) ? d2 : null;
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function formatInt(n: number) {
  const v = Math.round(n);
  return v.toLocaleString("es-AR");
}

function formatMoney(n: number) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

// -------------------------
// CSV parser (simple)
// -------------------------
function splitCsvLine(line: string): string[] {
  // parser sencillo con comillas
  const out: string[] = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // doble comilla escape
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
      continue;
    }
    if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

function csvToObjects(csvText: string): any[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => String(h).trim());
  const rows: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const obj: any = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = cols[c] ?? "";
    }
    rows.push(obj);
  }
  return rows;
}

// -------------------------
// UI bits
// -------------------------
function Pill({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "1px solid rgba(0,0,0,.12)",
        background: active ? "rgba(0,0,0,.88)" : "white",
        color: active ? "white" : "rgba(0,0,0,.88)",
        padding: ".5rem .75rem",
        borderRadius: 999,
        fontWeight: 800,
        fontSize: ".9rem",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="card"
      style={{
        background: "white",
        border: "1px solid rgba(0,0,0,.08)",
        borderRadius: 22,
        padding: "1rem",
        boxShadow: "0 8px 30px rgba(0,0,0,.06)",
      }}
    >
      {children}
    </div>
  );
}

function MiniKpi({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        border: "1px solid rgba(0,0,0,.08)",
        padding: ".9rem",
        background: "linear-gradient(180deg, rgba(0,0,0,.02), rgba(0,0,0,.0))",
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: ".85rem", color: "rgba(0,0,0,.6)", fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: "1.45rem", fontWeight: 950, marginTop: ".25rem", lineHeight: 1.1 }}>
        {value}
      </div>
      {subtitle ? (
        <div style={{ marginTop: ".25rem", fontSize: ".85rem", color: "rgba(0,0,0,.55)", fontWeight: 700 }}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

// -------------------------
// Membership colors
// -------------------------
const MEMBERSHIP_COLORS: Record<string, string> = {
  MRD: "#F26D6D",
  MEMBER: "#F26D6D",
  GLD: "#F2AD3B",
  GOLD: "#F2AD3B",
  TTM: "#B079FF",
  TITANIUM: "#B079FF",
  PLT: "#98A6BF",
  PLATINUM: "#98A6BF",
  SLR: "#CBD5E1",
  SILVER: "#CBD5E1",
  AMB: "#63C7F8",
  AMBASSADOR: "#63C7F8",
};

function membershipKey(raw: string) {
  const s = String(raw ?? "").toUpperCase().trim();
  if (s.includes("MRD") || s.includes("MEMBER")) return "MRD";
  if (s.includes("GLD") || s.includes("GOLD")) return "GLD";
  if (s.includes("TTM") || s.includes("TITANIUM")) return "TTM";
  if (s.includes("PLT") || s.includes("PLATINUM")) return "PLT";
  if (s.includes("SLR") || s.includes("SILVER")) return "SLR";
  if (s.includes("AMB") || s.includes("AMBASSADOR")) return "AMB";
  // fallback
  return s.slice(0, 8) || "OTRO";
}

function prettyMembershipLabel(k: string) {
  const map: Record<string, string> = {
    MRD: "Member (MRD)",
    GLD: "Gold Elite (GLD)",
    TTM: "Titanium Elite (TTM)",
    PLT: "Platinum Elite (PLT)",
    SLR: "Silver Elite (SLR)",
    AMB: "Ambassador Elite (AMB)",
  };
  return map[k] ?? k;
}

// -------------------------
// Main component
// -------------------------
export default function YearComparator() {
  // Global filters
  const [globalHotel, setGlobalHotel] = useState<GlobalHotel>("MARRIOTT");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [baseYear, setBaseYear] = useState<number>(new Date().getFullYear() - 1);

  // Data states
  const [hfRows, setHfRows] = useState<any[]>([]);
  const [hfLoading, setHfLoading] = useState(true);
  const [hfError, setHfError] = useState<string>("");

  const [membershipRows, setMembershipRows] = useState<any[]>([]);
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [membershipError, setMembershipError] = useState<string>("");

  const [nacRows, setNacRows] = useState<any[]>([]);
  const [nacLoading, setNacLoading] = useState(true);
  const [nacError, setNacError] = useState<string>("");

  // Month filter for membership section
  const [membershipMonth, setMembershipMonth] = useState<number | "YTD">("YTD");

  // -------------------------
  // Load HF CSV
  // -------------------------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setHfLoading(true);
        setHfError("");

        const res = await fetch(HF_PATH, { cache: "no-store" });
        if (!res.ok) throw new Error(`No se pudo cargar ${HF_PATH} (status ${res.status})`);
        const txt = await res.text();
        const rows = csvToObjects(txt);

        // Normalizar algunos campos clave sin romper headers originales
        // Intentamos ubicar campos típicos
        const normalized = rows.map((r) => {
          const obj = { ...r };

          // hotel
          const empresaKey = Object.keys(obj).find((k) => normalizeKey(k) === "empresa");
          if (empresaKey) obj.__hotel = String(obj[empresaKey] ?? "").trim().toUpperCase();

          // HoF (History/Forecast)
          const hofKey = Object.keys(obj).find((k) => normalizeKey(k) === "hof");
          if (hofKey) obj.__hof = String(obj[hofKey] ?? "").trim();

          // Fecha (preferimos columna "Fecha", sino "Date")
          const fechaKey =
            Object.keys(obj).find((k) => normalizeKey(k) === "fecha") ||
            Object.keys(obj).find((k) => normalizeKey(k) === "date");
          const d = fechaKey ? parseAnyDate(obj[fechaKey]) : null;
          obj.__date = d;

          // Métricas
          const occKey = Object.keys(obj).find((k) => normalizeKey(k).includes("occ"));
          if (occKey) obj.__occ = parsePercent(obj[occKey]);

          const adrKey =
            Object.keys(obj).find((k) => normalizeKey(k).includes("average rate")) ||
            Object.keys(obj).find((k) => normalizeKey(k) === "adr");
          if (adrKey) obj.__adr = parseLocaleNumber(obj[adrKey]);

          const roomRevKey =
            Object.keys(obj).find((k) => normalizeKey(k).includes("room reven")) ||
            Object.keys(obj).find((k) => normalizeKey(k).includes("room revenue")) ||
            Object.keys(obj).find((k) => normalizeKey(k) === "room revenue");
          if (roomRevKey) obj.__roomRev = parseLocaleNumber(obj[roomRevKey]);

          // Total/Occ rooms (si existe)
          const totalKey = Object.keys(obj).find((k) => normalizeKey(k) === "total");
          if (totalKey) obj.__totalRooms = parseLocaleNumber(obj[totalKey]);

          // Dep rooms
          const depKey = Object.keys(obj).find((k) => normalizeKey(k).includes("dep"));
          if (depKey) obj.__depRooms = parseLocaleNumber(obj[depKey]);

          // Adults & children (Adl. & Chl.)
          const adlKey =
            Object.keys(obj).find((k) => normalizeKey(k).includes("adl")) ||
            Object.keys(obj).find((k) => normalizeKey(k).includes("chl"));
          if (adlKey) obj.__adl = parseLocaleNumber(obj[adlKey]);

          return obj;
        });

        if (!alive) return;
        setHfRows(normalized);

        // set year defaults based on max year
        const years = Array.from(
          new Set(
            normalized
              .map((r) => (r.__date instanceof Date ? r.__date.getFullYear() : null))
              .filter((x) => typeof x === "number") as number[]
          )
        ).sort((a, b) => a - b);

        if (years.length > 0) {
          const maxY = years[years.length - 1];
          setYear((prev) => (years.includes(prev) ? prev : maxY));
          setBaseYear((prev) => (years.includes(prev) ? prev : maxY - 1));
        }
      } catch (e: any) {
        if (!alive) return;
        setHfError(e?.message ?? "Error cargando HF");
      } finally {
        if (!alive) return;
        setHfLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // -------------------------
  // Load Membership XLSX
  // -------------------------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setMembershipLoading(true);
        setMembershipError("");

        const res = await fetch(MEMBERSHIP_PATH, { cache: "no-store" });
        if (!res.ok) throw new Error(`No se pudo cargar ${MEMBERSHIP_PATH} (status ${res.status})`);
        const buffer = await res.arrayBuffer();

        const wb = XLSX.read(buffer, { type: "array", cellDates: true });
        const sheetNames = wb.SheetNames ?? [];
        if (sheetNames.length === 0) {
          setMembershipRows([]);
          return;
        }

        // Elegimos hoja con headers esperables
        let bestName = sheetNames[0];
        let bestRows: any[] = [];
        let bestScore = -1;

        for (const name of sheetNames) {
          const ws = wb.Sheets[name];
          if (!ws) continue;
          const rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: true }) as any[];
          if (!rows || rows.length === 0) continue;

          const keys = Object.keys(rows[0] ?? {});
          const ks = new Set(keys.map((k) => normalizeKey(k)));

          let s = keys.length;
          if (ks.has("empresa")) s += 50;
          if (ks.has("bonboy")) s += 30;
          if (ks.has("cantidad")) s += 30;
          if (ks.has("fecha")) s += 20;
          s += Math.min(rows.length, 200) / 10;

          if (s > bestScore) {
            bestScore = s;
            bestName = name;
            bestRows = rows;
          }
        }

        // Normalizar
        const norm = bestRows.map((r) => {
          const obj = { ...r };
          const kHotel = Object.keys(obj).find((k) => normalizeKey(k) === "empresa");
          const kM = Object.keys(obj).find((k) => normalizeKey(k) === "bonboy");
          const kQ = Object.keys(obj).find((k) => normalizeKey(k) === "cantidad");
          const kF = Object.keys(obj).find((k) => normalizeKey(k) === "fecha");

          const hotel = kHotel ? String(obj[kHotel] ?? "").trim().toUpperCase() : "";
          const mem = kM ? String(obj[kM] ?? "").trim() : "";
          const qty = kQ ? parseLocaleNumber(obj[kQ]) : 0;
          const d = kF ? parseAnyDate(obj[kF]) : null;

          return {
            __hotel: hotel,
            __membershipRaw: mem,
            __membershipKey: membershipKey(mem),
            __qty: qty,
            __date: d,
            __year: d ? d.getFullYear() : null,
            __month: d ? d.getMonth() + 1 : null,
          };
        });

        if (!alive) return;
        setMembershipRows(norm);
      } catch (e: any) {
        if (!alive) return;
        setMembershipError(e?.message ?? "Error cargando membership");
      } finally {
        if (!alive) return;
        setMembershipLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // -------------------------
  // Load Nacionalidades XLSX
  // -------------------------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setNacLoading(true);
        setNacError("");

        const res = await fetch(NACIONALIDADES_PATH, { cache: "no-store" });
        if (!res.ok) throw new Error(`No se pudo cargar ${NACIONALIDADES_PATH} (status ${res.status})`);
        const buffer = await res.arrayBuffer();

        const wb = XLSX.read(buffer, { type: "array", cellDates: true });
        const sheetNames = wb.SheetNames ?? [];
        if (sheetNames.length === 0) {
          setNacRows([]);
          return;
        }

        // Elegimos hoja con keys: Año / PAÍS / Continente / Importe
        let bestName = sheetNames[0];
        let bestRows: any[] = [];
        let bestScore = -1;

        for (const name of sheetNames) {
          const ws = wb.Sheets[name];
          if (!ws) continue;
          const rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: true }) as any[];
          if (!rows || rows.length === 0) continue;

          const keys = Object.keys(rows[0] ?? {});
          const ks = new Set(keys.map((k) => normalizeKey(k)));

          let s = keys.length;
          if (Array.from(ks).some((k) => k === "año" || k.includes("año"))) s += 40;
          if (Array.from(ks).some((k) => k.includes("país") || k.includes("pais"))) s += 40;
          if (Array.from(ks).some((k) => k.includes("continente"))) s += 25;
          if (Array.from(ks).some((k) => k.includes("importe"))) s += 25;
          s += Math.min(rows.length, 200) / 10;

          if (s > bestScore) {
            bestScore = s;
            bestName = name;
            bestRows = rows;
          }
        }

        const norm = bestRows.map((r) => {
          const obj = { ...r };

          const kYear =
            Object.keys(obj).find((k) => normalizeKey(k) === "año") ||
            Object.keys(obj).find((k) => normalizeKey(k).includes("año"));

          const kCountry =
            Object.keys(obj).find((k) => normalizeKey(k) === "país") ||
            Object.keys(obj).find((k) => normalizeKey(k) === "país ") ||
            Object.keys(obj).find((k) => normalizeKey(k) === "pais") ||
            Object.keys(obj).find((k) => normalizeKey(k).includes("país")) ||
            Object.keys(obj).find((k) => normalizeKey(k).includes("pais"));

          const kCont = Object.keys(obj).find((k) => normalizeKey(k).includes("continente"));

          const kAmount =
            Object.keys(obj).find((k) => normalizeKey(k).includes("importe")) ||
            Object.keys(obj).find((k) => normalizeKey(k).includes("amount")) ||
            Object.keys(obj).find((k) => normalizeKey(k).includes("total"));

          const yearVal = kYear ? obj[kYear] : "";
          const yearNum = typeof yearVal === "number" ? yearVal : parseLocaleNumber(yearVal);

          const country = kCountry ? String(obj[kCountry] ?? "").trim() : "";
          const continent = kCont ? String(obj[kCont] ?? "").trim() : "";
          const amount = kAmount ? parseLocaleNumber(obj[kAmount]) : 0;

          return {
            __year: yearNum ? Math.round(yearNum) : null,
            __country: country,
            __continent: continent,
            __amount: amount,
          };
        });

        if (!alive) return;
        setNacRows(norm);
      } catch (e: any) {
        if (!alive) return;
        setNacError(e?.message ?? "Error cargando nacionalidades");
      } finally {
        if (!alive) return;
        setNacLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // -------------------------
  // Derived: available years
  // -------------------------
  const availableYears = useMemo(() => {
    const set = new Set<number>();

    for (const r of hfRows) {
      if (r.__date instanceof Date) set.add(r.__date.getFullYear());
    }
    for (const r of membershipRows) {
      if (typeof r.__year === "number") set.add(r.__year);
    }
    for (const r of nacRows) {
      if (typeof r.__year === "number") set.add(r.__year);
    }

    return Array.from(set).sort((a, b) => b - a);
  }, [hfRows, membershipRows, nacRows]);

  // Mantener coherencia baseYear
  useEffect(() => {
    if (!availableYears.length) return;
    if (!availableYears.includes(year)) setYear(availableYears[0]);
    if (!availableYears.includes(baseYear)) setBaseYear(Math.max(availableYears[0] - 1, 2000));
  }, [availableYears]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------
  // Scope hotels
  // -------------------------
  const scopeHotels = useMemo(() => {
    if (globalHotel === "JCR") return JCR_HOTELS;
    if (globalHotel === "MAITEI") return ["MAITEI"];
    return [globalHotel];
  }, [globalHotel]);

  // -------------------------
  // HF rows filtered
  // -------------------------
  const hfYearRows = useMemo(() => {
    return hfRows.filter((r) => {
      const d: Date | null = r.__date instanceof Date ? r.__date : null;
      if (!d) return false;
      const y = d.getFullYear();
      if (y !== year) return false;
      const h = String(r.__hotel ?? "").toUpperCase();
      return scopeHotels.includes(h as any);
    });
  }, [hfRows, year, scopeHotels]);

  const hfBaseRows = useMemo(() => {
    return hfRows.filter((r) => {
      const d: Date | null = r.__date instanceof Date ? r.__date : null;
      if (!d) return false;
      const y = d.getFullYear();
      if (y !== baseYear) return false;
      const h = String(r.__hotel ?? "").toUpperCase();
      return scopeHotels.includes(h as any);
    });
  }, [hfRows, baseYear, scopeHotels]);

  // -------------------------
  // HF KPIs
  // -------------------------
  function computeHfKpis(rows: any[]) {
    if (!rows || rows.length === 0) {
      return {
        days: 0,
        avgOcc: 0,
        avgAdr: 0,
        revPar: 0,
        sumRoomRev: 0,
        sumOccRooms: 0,
        sumTotalRooms: 0,
      };
    }

    // ponderación simple: promedio directo de occ/adr y sumas de revenue
    let occSum = 0;
    let adrSum = 0;
    let occCount = 0;
    let adrCount = 0;
    let roomRev = 0;

    let sumOccRooms = 0;
    let sumTotalRooms = 0;

    for (const r of rows) {
      const occ = typeof r.__occ === "number" ? r.__occ : 0;
      const adr = typeof r.__adr === "number" ? r.__adr : 0;
      const rr = typeof r.__roomRev === "number" ? r.__roomRev : 0;

      if (occ > 0) {
        occSum += occ;
        occCount += 1;
      }
      if (adr > 0) {
        adrSum += adr;
        adrCount += 1;
      }
      roomRev += rr;

      // si existen
      const tot = typeof r.__totalRooms === "number" ? r.__totalRooms : 0;
      const dep = typeof r.__depRooms === "number" ? r.__depRooms : 0;
      if (tot > 0) sumTotalRooms += tot;
      if (dep > 0) sumOccRooms += dep; // aproximación: dep rooms ~ ocupadas
    }

    const avgOcc = occCount ? occSum / occCount : 0;
    const avgAdr = adrCount ? adrSum / adrCount : 0;
    const revPar = avgOcc * avgAdr;

    return {
      days: rows.length,
      avgOcc,
      avgAdr,
      revPar,
      sumRoomRev: roomRev,
      sumOccRooms,
      sumTotalRooms,
    };
  }

  const kpiYear = useMemo(() => computeHfKpis(hfYearRows), [hfYearRows]);
  const kpiBase = useMemo(() => computeHfKpis(hfBaseRows), [hfBaseRows]);

  function pctDelta(cur: number, base: number) {
    if (!base || base === 0) return null;
    return (cur - base) / base;
  }

  // -------------------------
  // HF detail table (History/Forecast)
  // -------------------------
  const hfDetail = useMemo(() => {
    const rows = [...hfYearRows]
      .filter((r) => r.__date instanceof Date)
      .sort((a, b) => (a.__date as Date).getTime() - (b.__date as Date).getTime());

    // armamos detalle para UI (compacto)
    return rows.map((r) => {
      const d: Date = r.__date;
      return {
        date: ymd(d),
        hof: String(r.__hof ?? ""),
        occ: typeof r.__occ === "number" ? r.__occ : 0,
        adr: typeof r.__adr === "number" ? r.__adr : 0,
        roomRev: typeof r.__roomRev === "number" ? r.__roomRev : 0,
        hotel: String(r.__hotel ?? ""),
      };
    });
  }, [hfYearRows]);

  // -------------------------
  // Membership aggregates
  // -------------------------
  const membershipYears = useMemo(() => {
    const set = new Set<number>();
    for (const r of membershipRows) {
      if (typeof r.__year === "number") set.add(r.__year);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [membershipRows]);

  // mapping: MAITEI no existe en membership -> lo tratamos como JCR
  const membershipHotelsToUse = useMemo(() => {
    if (globalHotel === "MAITEI") return JCR_HOTELS.map(String);
    if (globalHotel === "JCR") return JCR_HOTELS.map(String);
    return [String(globalHotel)];
  }, [globalHotel]);

  const membershipYearRows = useMemo(() => {
    return membershipRows.filter((r) => {
      if (r.__year !== year) return false;
      const h = String(r.__hotel ?? "").toUpperCase();
      return membershipHotelsToUse.includes(h);
    });
  }, [membershipRows, year, membershipHotelsToUse]);

  const membershipBaseRows = useMemo(() => {
    return membershipRows.filter((r) => {
      if (r.__year !== baseYear) return false;
      const h = String(r.__hotel ?? "").toUpperCase();
      return membershipHotelsToUse.includes(h);
    });
  }, [membershipRows, baseYear, membershipHotelsToUse]);

  const membershipMonthRows = useMemo(() => {
    if (membershipMonth === "YTD") return membershipYearRows;
    return membershipYearRows.filter((r) => r.__month === membershipMonth);
  }, [membershipYearRows, membershipMonth]);

  function sumMembership(rows: any[]) {
    const by = new Map<string, number>();
    let total = 0;
    for (const r of rows) {
      const k = String(r.__membershipKey ?? "OTRO");
      const q = typeof r.__qty === "number" ? r.__qty : 0;
      by.set(k, (by.get(k) ?? 0) + q);
      total += q;
    }
    return { by, total };
  }

  const memCur = useMemo(() => sumMembership(membershipMonthRows), [membershipMonthRows]);
  const memBase = useMemo(() => sumMembership(membershipBaseRows), [membershipBaseRows]);

  const memDelta = useMemo(() => {
    const d = pctDelta(memCur.total, memBase.total);
    return d;
  }, [memCur.total, memBase.total]);

  const memList = useMemo(() => {
    const keys = new Set<string>();
    Array.from(memCur.by.keys()).forEach((k) => keys.add(k));
    Array.from(memBase.by.keys()).forEach((k) => keys.add(k));

    const arr = Array.from(keys).map((k) => {
      const cur = memCur.by.get(k) ?? 0;
      const share = memCur.total ? cur / memCur.total : 0;
      return { k, cur, share };
    });

    // Orden por valor actual desc
    arr.sort((a, b) => b.cur - a.cur);
    return arr;
  }, [memCur.by, memCur.total, memBase.by]);

  // -------------------------
  // Nacionalidades aggregates (solo Marriott)
  // -------------------------
  const nacYearRows = useMemo(() => {
    // solo filtra por año (hotelFilter vacío, porque archivo Marriott)
    return nacRows.filter((r) => r.__year === year);
  }, [nacRows, year]);

  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of nacYearRows) {
      const c = String(r.__country ?? "").trim();
      if (!c) continue;
      const a = typeof r.__amount === "number" ? r.__amount : 0;
      m.set(c, (m.get(c) ?? 0) + a);
    }
    return m;
  }, [nacYearRows]);

  const byContinent = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of nacYearRows) {
      const c = String(r.__continent ?? "").trim();
      if (!c) continue;
      const a = typeof r.__amount === "number" ? r.__amount : 0;
      m.set(c, (m.get(c) ?? 0) + a);
    }
    return m;
  }, [nacYearRows]);

  const nacTotal = useMemo(() => {
    let t = 0;
    for (const v of Array.from(byCountry.values())) t += v;
    if (t === 0) {
      for (const v of Array.from(byContinent.values())) t += v;
    }
    return t;
  }, [byCountry, byContinent]);

  const nacTopCountries = useMemo(() => {
    const arr = Array.from(byCountry.entries())
      .map(([k, v]) => ({ country: k, value: v }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
    return arr;
  }, [byCountry]);

  const nacContinents = useMemo(() => {
    const arr = Array.from(byContinent.entries())
      .map(([k, v]) => ({ cont: k, value: v }))
      .sort((a, b) => b.value - a.value);
    return arr;
  }, [byContinent]);

  // Country code (mínimo viable + fallback)
  const COUNTRY_CODE: Record<string, string> = {
    ARGENTINA: "AR",
    URUGUAY: "UY",
    BRASIL: "BR",
    BRAZIL: "BR",
    CHILE: "CL",
    PERU: "PE",
    PERÚ: "PE",
    COLOMBIA: "CO",
    MEXICO: "MX",
    MÉXICO: "MX",
    "UNITED STATES": "US",
    "ESTADOS UNIDOS": "US",
    USA: "US",
    SPAIN: "ES",
    ESPAÑA: "ES",
    FRANCE: "FR",
    FRANCIA: "FR",
    ITALY: "IT",
    ITALIA: "IT",
    GERMANY: "DE",
    ALEMANIA: "DE",
    "UNITED KINGDOM": "GB",
    "REINO UNIDO": "GB",
    CHINA: "CN",
    JAPAN: "JP",
    JAPÓN: "JP",
  };

  function iso2ToFlag(iso2: string) {
    const s = String(iso2 ?? "").toUpperCase().trim();
    if (s.length !== 2) return "";
    const A = 0x1f1e6;
    const c1 = s.charCodeAt(0) - 65;
    const c2 = s.charCodeAt(1) - 65;
    if (c1 < 0 || c1 > 25 || c2 < 0 || c2 > 25) return "";
    return String.fromCodePoint(A + c1, A + c2);
  }

  function countryFlag(name: string) {
    const n = String(name ?? "").toUpperCase().trim();
    const iso2 = COUNTRY_CODE[n] ?? "";
    return iso2 ? iso2ToFlag(iso2) : "🏳️";
  }

  // -------------------------
  // Responsive layout helpers
  // -------------------------
  const wrapRow: React.CSSProperties = {
    display: "flex",
    gap: ".6rem",
    flexWrap: "wrap",
    alignItems: "center",
  };

  const gridCards: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: ".75rem",
  };

  // -------------------------
  // Render
  // -------------------------
  return (
    <section className="section" id="comparador" style={{ padding: "1.25rem 0" }}>
      {/* Header + filtros globales */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: ".75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ letterSpacing: ".12em", textTransform: "uppercase", fontSize: ".8rem", color: "rgba(0,0,0,.55)", fontWeight: 900 }}>
              Informe
            </div>
            <div style={{ fontSize: "1.65rem", fontWeight: 950, marginTop: ".2rem" }}>Year Comparator</div>
            <div style={{ marginTop: ".25rem", color: "rgba(0,0,0,.6)", fontWeight: 700 }}>
              Filtros globales: <b>Año</b> y <b>Hotel</b> (afecta KPIs, H&amp;F, Comparativa y Membership). Nacionalidades usa solo Marriott.
            </div>
          </div>

          <div style={{ ...wrapRow, justifyContent: "flex-end" }}>
            {/* Año */}
            <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
              <div style={{ fontWeight: 900, color: "rgba(0,0,0,.65)" }}>Año</div>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                style={{
                  padding: ".55rem .6rem",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,.18)",
                  fontWeight: 900,
                }}
              >
                {availableYears.length ? (
                  availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))
                ) : (
                  <option value={year}>{year}</option>
                )}
              </select>
            </div>

            {/* Base */}
            <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
              <div style={{ fontWeight: 900, color: "rgba(0,0,0,.65)" }}>vs</div>
              <select
                value={baseYear}
                onChange={(e) => setBaseYear(Number(e.target.value))}
                style={{
                  padding: ".55rem .6rem",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,.18)",
                  fontWeight: 900,
                }}
              >
                {availableYears.length ? (
                  availableYears
                    .filter((y) => y !== year)
                    .map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))
                ) : (
                  <option value={baseYear}>{baseYear}</option>
                )}
              </select>
            </div>
          </div>
        </div>

        {/* Hotel pills */}
        <div style={{ ...wrapRow }}>
          <Pill active={globalHotel === "JCR"} onClick={() => setGlobalHotel("JCR")}>
            JCR
          </Pill>
          <Pill active={globalHotel === "MARRIOTT"} onClick={() => setGlobalHotel("MARRIOTT")}>
            MARRIOTT
          </Pill>
          <Pill active={globalHotel === "SHERATON BCR"} onClick={() => setGlobalHotel("SHERATON BCR")}>
            SHERATON BCR
          </Pill>
          <Pill active={globalHotel === "SHERATON MDQ"} onClick={() => setGlobalHotel("SHERATON MDQ")}>
            SHERATON MDQ
          </Pill>
          <Pill active={globalHotel === "MAITEI"} onClick={() => setGlobalHotel("MAITEI")}>
            MAITEI
          </Pill>
        </div>
      </div>

      {/* ====== 1) KPIs PRINCIPALES (cards / “carrouseles”) ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 950 }}>
          {HOTEL_LABEL[globalHotel]} — KPIs {year} (vs {baseYear})
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Ocupación promedio, ADR promedio, RevPAR (Occ × ADR) y Room Revenue total. Scope:{" "}
          <b>{scopeHotels.join(" + ")}</b>
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <div style={gridCards}>
            <MiniKpi
              title="Ocupación prom."
              value={`${(kpiYear.avgOcc * 100).toFixed(1).replace(".", ",")}%`}
              subtitle={
                kpiBase.avgOcc
                  ? `vs ${baseYear}: ${(kpiBase.avgOcc * 100).toFixed(1).replace(".", ",")}%`
                  : `vs ${baseYear}: —`
              }
            />
            <MiniKpi
              title="ADR prom."
              value={kpiYear.avgAdr ? `$ ${formatMoney(kpiYear.avgAdr)}` : "$ 0,00"}
              subtitle={kpiBase.avgAdr ? `vs ${baseYear}: $ ${formatMoney(kpiBase.avgAdr)}` : `vs ${baseYear}: —`}
            />
            <MiniKpi
              title="RevPAR"
              value={kpiYear.revPar ? `$ ${formatMoney(kpiYear.revPar)}` : "$ 0,00"}
              subtitle={kpiBase.revPar ? `vs ${baseYear}: $ ${formatMoney(kpiBase.revPar)}` : `vs ${baseYear}: —`}
            />
            <MiniKpi
              title="Room Revenue (Σ)"
              value={kpiYear.sumRoomRev ? `$ ${formatMoney(kpiYear.sumRoomRev)}` : "$ 0,00"}
              subtitle={
                kpiBase.sumRoomRev ? `vs ${baseYear}: $ ${formatMoney(kpiBase.sumRoomRev)}` : `vs ${baseYear}: —`
              }
            />
          </div>

          {/* Delta pill */}
          <div style={{ marginTop: ".75rem", display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
            {pctDelta(kpiYear.sumRoomRev, kpiBase.sumRoomRev) !== null ? (
              <div
                style={{
                  padding: ".5rem .75rem",
                  borderRadius: 999,
                  border: "1px solid rgba(0,0,0,.12)",
                  background: "rgba(16,185,129,.10)",
                  color: "rgba(0,0,0,.75)",
                  fontWeight: 950,
                }}
              >
                Δ Room Rev:{" "}
                {(((kpiYear.sumRoomRev - kpiBase.sumRoomRev) / (kpiBase.sumRoomRev || 1)) * 100)
                  .toFixed(1)
                  .replace(".", ",")}
                %
              </div>
            ) : (
              <div
                style={{
                  padding: ".5rem .75rem",
                  borderRadius: 999,
                  border: "1px solid rgba(0,0,0,.12)",
                  background: "rgba(0,0,0,.03)",
                  fontWeight: 900,
                }}
              >
                Δ Room Rev: sin base {baseYear}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ====== 2) HISTORY & FORECAST (detalle) ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 950 }}>
          History &amp; Forecast
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Detalle diario (según CSV). Usa filtros globales.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <Card>
            {hfLoading ? (
              <div style={{ fontWeight: 800, color: "rgba(0,0,0,.6)" }}>Cargando {HF_PATH}…</div>
            ) : hfError ? (
              <div style={{ fontWeight: 900, color: "#b91c1c" }}>{hfError}</div>
            ) : hfDetail.length === 0 ? (
              <div style={{ fontWeight: 900, color: "rgba(0,0,0,.6)" }}>
                Sin datos para {HOTEL_LABEL[globalHotel]} en {year}. (Archivo: {HF_PATH})
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 950 }}>
                    Filas: {hfDetail.length} · Hotel scope: {scopeHotels.join(" + ")}
                  </div>
                  <div style={{ color: "rgba(0,0,0,.6)", fontWeight: 800 }}>
                    Último día: <b>{hfDetail[hfDetail.length - 1]?.date}</b>
                  </div>
                </div>

                <div style={{ marginTop: ".75rem", overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
                    <thead>
                      <tr style={{ textAlign: "left" }}>
                        {["Fecha", "HoF", "Hotel", "Occ%", "ADR", "Room Rev"].map((h) => (
                          <th
                            key={h}
                            style={{
                              padding: ".55rem .5rem",
                              borderBottom: "1px solid rgba(0,0,0,.10)",
                              fontSize: ".85rem",
                              color: "rgba(0,0,0,.65)",
                              fontWeight: 950,
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {hfDetail.slice(-60).map((r, idx) => (
                        <tr key={`${r.date}-${idx}`}>
                          <td style={{ padding: ".45rem .5rem", borderBottom: "1px solid rgba(0,0,0,.06)", fontWeight: 900 }}>
                            {r.date}
                          </td>
                          <td style={{ padding: ".45rem .5rem", borderBottom: "1px solid rgba(0,0,0,.06)", fontWeight: 800, color: "rgba(0,0,0,.7)" }}>
                            {r.hof}
                          </td>
                          <td style={{ padding: ".45rem .5rem", borderBottom: "1px solid rgba(0,0,0,.06)", fontWeight: 800 }}>
                            {r.hotel}
                          </td>
                          <td style={{ padding: ".45rem .5rem", borderBottom: "1px solid rgba(0,0,0,.06)" }}>
                            {(r.occ * 100).toFixed(1).replace(".", ",")}%
                          </td>
                          <td style={{ padding: ".45rem .5rem", borderBottom: "1px solid rgba(0,0,0,.06)" }}>
                            $ {formatMoney(r.adr)}
                          </td>
                          <td style={{ padding: ".45rem .5rem", borderBottom: "1px solid rgba(0,0,0,.06)" }}>
                            $ {formatMoney(r.roomRev)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: ".6rem", color: "rgba(0,0,0,.55)", fontWeight: 750, fontSize: ".85rem" }}>
                  Nota: se muestran las últimas 60 filas para no romper el responsive en mobile.
                </div>
              </>
            )}
          </Card>
        </div>
      </div>

      {/* ====== 3) COMPARATIVA (año vs base) ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 950 }}>
          Comparativa
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Resumen {year} vs {baseYear}. Usa filtros globales.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <Card>
            {hfLoading ? (
              <div style={{ fontWeight: 800, color: "rgba(0,0,0,.6)" }}>Cargando comparativa…</div>
            ) : hfError ? (
              <div style={{ fontWeight: 900, color: "#b91c1c" }}>{hfError}</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                  <thead>
                    <tr style={{ textAlign: "left" }}>
                      {["Métrica", String(year), String(baseYear), "Δ"].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: ".55rem .5rem",
                            borderBottom: "1px solid rgba(0,0,0,.10)",
                            fontSize: ".85rem",
                            color: "rgba(0,0,0,.65)",
                            fontWeight: 950,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        label: "Ocupación prom.",
                        cur: `${(kpiYear.avgOcc * 100).toFixed(1).replace(".", ",")}%`,
                        base: kpiBase.avgOcc ? `${(kpiBase.avgOcc * 100).toFixed(1).replace(".", ",")}%` : "—",
                        d: pctDelta(kpiYear.avgOcc, kpiBase.avgOcc),
                      },
                      {
                        label: "ADR prom.",
                        cur: `$ ${formatMoney(kpiYear.avgAdr)}`,
                        base: kpiBase.avgAdr ? `$ ${formatMoney(kpiBase.avgAdr)}` : "—",
                        d: pctDelta(kpiYear.avgAdr, kpiBase.avgAdr),
                      },
                      {
                        label: "RevPAR",
                        cur: `$ ${formatMoney(kpiYear.revPar)}`,
                        base: kpiBase.revPar ? `$ ${formatMoney(kpiBase.revPar)}` : "—",
                        d: pctDelta(kpiYear.revPar, kpiBase.revPar),
                      },
                      {
                        label: "Room Revenue (Σ)",
                        cur: `$ ${formatMoney(kpiYear.sumRoomRev)}`,
                        base: kpiBase.sumRoomRev ? `$ ${formatMoney(kpiBase.sumRoomRev)}` : "—",
                        d: pctDelta(kpiYear.sumRoomRev, kpiBase.sumRoomRev),
                      },
                    ].map((r) => (
                      <tr key={r.label}>
                        <td style={{ padding: ".5rem .5rem", borderBottom: "1px solid rgba(0,0,0,.06)", fontWeight: 950 }}>
                          {r.label}
                        </td>
                        <td style={{ padding: ".5rem .5rem", borderBottom: "1px solid rgba(0,0,0,.06)", fontWeight: 900 }}>
                          {r.cur}
                        </td>
                        <td style={{ padding: ".5rem .5rem", borderBottom: "1px solid rgba(0,0,0,.06)", fontWeight: 900, color: "rgba(0,0,0,.7)" }}>
                          {r.base}
                        </td>
                        <td style={{ padding: ".5rem .5rem", borderBottom: "1px solid rgba(0,0,0,.06)", fontWeight: 950 }}>
                          {r.d === null ? (
                            <span style={{ color: "rgba(0,0,0,.45)" }}>sin base</span>
                          ) : (
                            <span style={{ color: r.d >= 0 ? "rgba(16,185,129,.95)" : "rgba(239,68,68,.95)" }}>
                              {(r.d * 100).toFixed(1).replace(".", ",")}%
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ marginTop: ".6rem", color: "rgba(0,0,0,.55)", fontWeight: 750, fontSize: ".85rem" }}>
                  Si alguna métrica aparece “sin base”, es porque {baseYear} no tiene filas para ese scope.
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ====== 4) MEMBERSHIP (JCR) ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 950 }}>
          Membership (JCR)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Cantidades + gráficos. Usa filtro global de año + hotel (JCR/MARRIOTT/SHERATONS). (MAITEI se mapea a JCR)
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <Card>
            {membershipLoading ? (
              <div style={{ fontWeight: 800, color: "rgba(0,0,0,.6)" }}>Cargando {MEMBERSHIP_PATH}…</div>
            ) : membershipError ? (
              <div style={{ fontWeight: 900, color: "#b91c1c" }}>{membershipError}</div>
            ) : membershipRows.length === 0 ? (
              <div style={{ fontWeight: 900, color: "rgba(0,0,0,.6)" }}>
                Sin datos. (Archivo: {MEMBERSHIP_PATH})
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: "1.15rem", fontWeight: 950 }}>
                      Membership ({HOTEL_LABEL[globalHotel] === "MAITEI" ? "JCR" : HOTEL_LABEL[globalHotel]}) —{" "}
                      {membershipMonth === "YTD" ? `Acumulado ${year}` : `Mes ${membershipMonth} / ${year}`} · vs {baseYear}
                    </div>
                    <div style={{ marginTop: ".25rem", color: "rgba(0,0,0,.6)", fontWeight: 700 }}>
                      Años membership disponibles:{" "}
                      {membershipYears.length ? membershipYears.slice(0, 10).join(", ") + (membershipYears.length > 10 ? "…" : "") : "—"}
                    </div>
                  </div>

                  {/* Month tabs */}
                  <div style={{ ...wrapRow, justifyContent: "flex-end" }}>
                    <Pill active={membershipMonth === "YTD"} onClick={() => setMembershipMonth("YTD")}>
                      Año
                    </Pill>
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => (
                      <Pill key={m} active={membershipMonth === m} onClick={() => setMembershipMonth(m)}>
                        {["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][m-1]}
                      </Pill>
                    ))}
                  </div>
                </div>

                <div
                  style={{
                    marginTop: "1rem",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    gap: "1rem",
                    alignItems: "stretch",
                  }}
                >
                  {/* Total card */}
                  <div
                    style={{
                      borderRadius: 22,
                      border: "1px solid rgba(0,0,0,.08)",
                      padding: "1rem",
                      background: "linear-gradient(180deg, rgba(0,0,0,.03), rgba(0,0,0,0))",
                      minHeight: 220,
                    }}
                  >
                    <div style={{ color: "rgba(0,0,0,.55)", fontWeight: 900 }}>Total</div>
                    <div style={{ fontSize: "3rem", fontWeight: 950, marginTop: ".35rem", lineHeight: 1 }}>
                      {formatInt(memCur.total)}
                    </div>

                    <div style={{ marginTop: ".6rem" }}>
                      {memDelta === null ? (
                        <div
                          style={{
                            display: "inline-block",
                            padding: ".45rem .7rem",
                            borderRadius: 999,
                            border: "1px solid rgba(0,0,0,.12)",
                            background: "rgba(0,0,0,.03)",
                            fontWeight: 950,
                          }}
                        >
                          Sin base {baseYear}
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "inline-block",
                            padding: ".45rem .7rem",
                            borderRadius: 999,
                            border: "1px solid rgba(16,185,129,.25)",
                            background: "rgba(16,185,129,.10)",
                            fontWeight: 950,
                            color: "rgba(0,0,0,.8)",
                          }}
                        >
                          {(memDelta * 100).toFixed(1).replace(".", ",")}% vs {baseYear}
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: "1rem", color: "rgba(0,0,0,.55)", fontWeight: 800 }}>
                      Composición
                    </div>
                  </div>

                  {/* Bars card */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "grid", gap: ".7rem" }}>
                      {memList.map((it) => {
                        const col = MEMBERSHIP_COLORS[it.k] ?? "#CBD5E1";
                        const pct = memCur.total ? it.cur / memCur.total : 0;
                        const w = clamp(pct * 100, 0, 100);

                        return (
                          <div key={it.k} style={{ display: "grid", gridTemplateColumns: "180px 1fr 84px", gap: ".8rem", alignItems: "center" }}>
                            <div style={{ fontWeight: 950, color: "rgba(0,0,0,.85)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {prettyMembershipLabel(it.k)}
                              <div style={{ fontSize: ".85rem", fontWeight: 800, color: "rgba(0,0,0,.55)", marginTop: ".15rem" }}>
                                {(pct * 100).toFixed(1).replace(".", ",")}% del total
                              </div>
                            </div>

                            {/* bar */}
                            <div
                              style={{
                                height: 12,
                                background: "rgba(0,0,0,.08)",
                                borderRadius: 999,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: `${w}%`,
                                  height: "100%",
                                  background: col,
                                  borderRadius: 999,
                                }}
                              />
                            </div>

                            <div style={{ textAlign: "right", fontWeight: 950, color: "rgba(0,0,0,.8)" }}>
                              {formatInt(it.cur)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: ".75rem", color: "rgba(0,0,0,.55)", fontWeight: 750, fontSize: ".85rem" }}>
                  Si te aparece un año raro tipo <b>46004</b> es porque Excel estaba viniendo como serial y ahora lo convertimos a fecha real.
                </div>
              </>
            )}
          </Card>
        </div>
      </div>

      {/* ====== 5) NACIONALIDADES ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 950 }}>
          Nacionalidades
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Ranking por país + distribución por continente. (Archivo Marriott). Usa filtro global de año.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <Card>
            {nacLoading ? (
              <div style={{ fontWeight: 800, color: "rgba(0,0,0,.6)" }}>Cargando {NACIONALIDADES_PATH}…</div>
            ) : nacError ? (
              <div style={{ fontWeight: 900, color: "#b91c1c" }}>{nacError}</div>
            ) : nacYearRows.length === 0 ? (
              <div style={{ fontWeight: 900, color: "rgba(0,0,0,.6)" }}>
                Sin datos para {year}. (Archivo: {NACIONALIDADES_PATH})
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: "1rem",
                }}
              >
                {/* Ranking países */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "1.05rem", fontWeight: 950, marginBottom: ".5rem" }}>Ranking por país</div>
                  <div style={{ display: "grid", gap: ".45rem" }}>
                    {nacTopCountries.map((c) => {
                      const pct = nacTotal ? c.value / nacTotal : 0;
                      const w = clamp(pct * 100, 0, 100);
                      return (
                        <div
                          key={c.country}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "28px 1fr 70px",
                            gap: ".6rem",
                            alignItems: "center",
                            padding: ".45rem .55rem",
                            border: "1px solid rgba(0,0,0,.08)",
                            borderRadius: 14,
                            background: "rgba(0,0,0,.015)",
                          }}
                        >
                          <div style={{ fontSize: "1.15rem" }}>{countryFlag(c.country)}</div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 950, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {c.country}
                            </div>
                            <div
                              style={{
                                height: 10,
                                background: "rgba(0,0,0,.08)",
                                borderRadius: 999,
                                overflow: "hidden",
                                marginTop: ".35rem",
                              }}
                            >
                              <div
                                style={{
                                  width: `${w}%`,
                                  height: "100%",
                                  background: "rgba(0,0,0,.75)",
                                }}
                              />
                            </div>
                          </div>
                          <div style={{ textAlign: "right", fontWeight: 950, color: "rgba(0,0,0,.75)" }}>
                            {(pct * 100).toFixed(1).replace(".", ",")}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Continentes (más chico visualmente) */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "1.05rem", fontWeight: 950, marginBottom: ".5rem" }}>Distribución por continente</div>
                  <div style={{ display: "grid", gap: ".55rem" }}>
                    {nacContinents.map((c) => {
                      const pct = nacTotal ? c.value / nacTotal : 0;
                      const w = clamp(pct * 100, 0, 100);
                      return (
                        <div key={c.cont} style={{ display: "grid", gridTemplateColumns: "140px 1fr 70px", gap: ".7rem", alignItems: "center" }}>
                          <div style={{ fontWeight: 950, color: "rgba(0,0,0,.8)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {c.cont}
                          </div>
                          <div style={{ height: 10, background: "rgba(0,0,0,.08)", borderRadius: 999, overflow: "hidden" }}>
                            <div style={{ width: `${w}%`, height: "100%", background: "rgba(0,0,0,.55)" }} />
                          </div>
                          <div style={{ textAlign: "right", fontWeight: 950, color: "rgba(0,0,0,.75)" }}>
                            {(pct * 100).toFixed(1).replace(".", ",")}%
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ marginTop: ".85rem", color: "rgba(0,0,0,.55)", fontWeight: 750, fontSize: ".85rem" }}>
                    Si faltan banderas, agregamos más mapeos país→ISO2 en <code>COUNTRY_CODE</code>.
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Footer debug (opcional) */}
      <div style={{ marginTop: "1.25rem", color: "rgba(0,0,0,.45)", fontSize: ".8rem", fontWeight: 800 }}>
        Debug: HF filas {hfRows.length} · Membership filas {membershipRows.length} · Nacionalidades filas {nacRows.length}
      </div>
    </section>
  );
}
