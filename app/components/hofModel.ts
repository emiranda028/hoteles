// app/components/hofModel.ts

import { CsvRow, toNumberSmart, safeDiv, clamp01 } from "./useCsvClient";

/* ======================
   Tipos
====================== */

export type HofFlag = "History" | "Forecast";

export type GlobalHotel = "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";

export type HofRow = {
  empresa: string; // hotel
  hof: HofFlag; // History | Forecast
  fecha: Date;
  year: number;
  month: number; // 1-12
  quarter: number; // 1-4
  dow: number; // 0-6 (0=Domingo)
  dowName: string;

  // métricas base (numéricas)
  totalOcc: number; // Total Occ.
  arrRooms: number; // Arr. Rooms
  compRooms: number; // Comp. Rooms
  houseUse: number; // House Use
  deductIndiv: number; // Deduct Indiv.
  deductGroup: number; // Deduct Group

  roomRevenue: number; // Room Revenue
  averageRate: number; // Average Rate (ADR)

  depRooms: number; // Dep. Rooms
  dayUseRooms: number; // Day Use Rooms
  noShowRooms: number; // No Show Rooms
  oooRooms: number; // OOO Rooms
  adlChl: number; // Adl. & Chl.
};

export type HofAgg = {
  roomsAvailable: number;
  roomsSold: number;
  roomsOccMinusHU: number;

  occupancy: number; // 0-1
  adr: number; // Average Rate
  revpar: number; // roomRevenue / roomsAvailable

  roomRevenue: number;
  persons: number;
  doubleOcc: number; // persons / roomsOccMinusHU (0..)
};

export type HofSliceKey =
  | "year"
  | "quarter"
  | "month"
  | "monthName"
  | "dowName"
  | "hof";

/* ======================
   Normalización de headers
====================== */

function normalizeHeaderKey(k: string): string {
  return (k ?? "")
    .toString()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^"+|"+$/g, "");
}

function get(row: CsvRow, key: string): any {
  // busca exacto y luego por normalizado
  if (row[key] !== undefined) return row[key];
  const target = normalizeHeaderKey(key).toLowerCase();
  const found = Object.keys(row).find((kk) => normalizeHeaderKey(kk).toLowerCase() === target);
  return found ? row[found] : undefined;
}

/* ======================
   Parse fecha robusto
====================== */

function parseDateSmart(v: any): Date | null {
  if (!v) return null;

  // si ya es Date
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  const s = String(v).trim();
  if (!s) return null;

  // intentos:
  // 1) dd/mm/yyyy
  // 2) d/m/yyyy
  // 3) yyyy-mm-dd
  // 4) Excel serial number (ej: 46004)

  // yyyy-mm-dd
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    const dt = new Date(y, m - 1, d);
    if (!isNaN(dt.getTime())) return dt;
  }

  // dd/mm/yyyy o d/m/yyyy
  const dmY = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dmY) {
    const d = Number(dmY[1]);
    const m = Number(dmY[2]);
    let y = Number(dmY[3]);
    if (y < 100) y += 2000;
    const dt = new Date(y, m - 1, d);
    if (!isNaN(dt.getTime())) return dt;
  }

  // Excel serial (días desde 1899-12-30 aprox)
  // Tus “Años disponibles: 46004...” eran seriales.
  if (/^\d{5,6}$/.test(s)) {
    const serial = Number(s);
    if (serial > 30000 && serial < 80000) {
      const base = new Date(1899, 11, 30);
      const dt = new Date(base.getTime() + serial * 86400000);
      if (!isNaN(dt.getTime())) return dt;
    }
  }

  // fallback Date.parse
  const t = Date.parse(s);
  if (!isNaN(t)) return new Date(t);

  return null;
}

/* ======================
   DOW
====================== */

const DOW_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/* ======================
   Month names
====================== */

export const MONTH_NAMES = [
  "",
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/* ======================
   Detectores de columnas
====================== */

function pickEmpresa(row: CsvRow): string {
  const v = get(row, "Empresa") ?? get(row, "Hotel") ?? get(row, "empresa");
  return String(v ?? "").trim().toUpperCase();
}

function pickHoF(row: CsvRow): HofFlag | null {
  const v = get(row, "HoF") ?? get(row, "Hof") ?? get(row, "H&F") ?? get(row, "History/Forecast");
  const s = String(v ?? "").trim().toLowerCase();
  if (s.includes("hist")) return "History";
  if (s.includes("fore")) return "Forecast";
  // algunos archivos pueden traer H/F
  if (s === "h") return "History";
  if (s === "f") return "Forecast";
  return null;
}

function pickFecha(row: CsvRow): Date | null {
  // preferir “Fecha”
  const vFecha = get(row, "Fecha");
  const vDate = get(row, "Date");

  const dt = parseDateSmart(vFecha) ?? parseDateSmart(vDate);
  return dt;
}

// mapper columnas típicas (con variantes)
function n(row: CsvRow, ...keys: string[]): number {
  for (const k of keys) {
    const v = get(row, k);
    if (v !== undefined && v !== null && String(v).trim() !== "") return toNumberSmart(v);
  }
  return 0;
}

/* ======================
   Normalización principal
====================== */

export function normalizeHofRows(raw: CsvRow[]): HofRow[] {
  const out: HofRow[] = [];

  for (const r of raw) {
    const empresa = pickEmpresa(r);
    const hof = pickHoF(r);
    const fecha = pickFecha(r);

    if (!empresa || !hof || !fecha) continue;

    const y = fecha.getFullYear();
    const m = fecha.getMonth() + 1;
    const q = Math.floor((m - 1) / 3) + 1;
    const dow = fecha.getDay();
    const dowName = DOW_NAMES[dow] ?? String(dow);

    const row: HofRow = {
      empresa,
      hof,
      fecha,
      year: y,
      month: m,
      quarter: q,
      dow,
      dowName,

      totalOcc: n(r, 'Total Occ.', 'Total\nOcc.', "Total Occ", "TotalOcc", "Total"),
      arrRooms: n(r, "Arr. Rooms", 'Arr.\nRooms', "Arr Rooms", "ArrRooms"),
      compRooms: n(r, "Comp. Rooms", 'Comp.\nRooms', "Comp Rooms", "CompRooms"),
      houseUse: n(r, "House Use", 'House\nUse', "HouseUse"),
      deductIndiv: n(r, "Deduct Indiv.", 'Deduct\nIndiv.', "Deduct Indiv", "DeductIndiv"),
      deductGroup: n(r, "Deduct Group", 'Deduct\nGroup', "Deduct Group", "DeductGroup"),

      roomRevenue: n(r, "Room Revenue", "RoomRevenue", "Rooms Revenue"),
      averageRate: n(r, "Average Rate", "AverageRate", "ADR"),

      depRooms: n(r, "Dep. Rooms", 'Dep.\nRooms', "Dep Rooms", "DepRooms"),
      dayUseRooms: n(r, "Day Use Rooms", 'Day Use\nRooms', "DayUse Rooms", "DayUseRooms"),
      noShowRooms: n(r, "No Show Rooms", 'No Show\nRooms', "NoShow Rooms", "NoShowRooms"),
      oooRooms: n(r, "OOO Rooms", 'OOO\nRooms', "OOORooms", "OOO Rooms"),
      adlChl: n(r, "Adl. & Chl.", 'Adl. &\nChl.', "Adl & Chl", "AdlChl"),
    };

    out.push(row);
  }

  return out;
}

/* ======================
   Filtros
====================== */

export function filterByHotel(rows: HofRow[], hotel: string): HofRow[] {
  const h = String(hotel ?? "").trim().toUpperCase();
  if (!h) return rows;
  return rows.filter((r) => (r.empresa ?? "").toUpperCase() === h);
}

export function filterByYear(rows: HofRow[], year: number): HofRow[] {
  if (!year) return rows;
  return rows.filter((r) => r.year === year);
}

export function filterByHoF(rows: HofRow[], hof: HofFlag | "All"): HofRow[] {
  if (!hof || hof === "All") return rows;
  return rows.filter((r) => r.hof === hof);
}

/* ======================
   Agregación correcta (sin sumar %)
====================== */

export function aggregateHof(rows: HofRow[]): HofAgg {
  // roomsAvailable: aproximación robusta para REVPAR
  // Lo más consistente (en tu dataset) es usar Total Occ. como “inventario total”
  // y RoomsSold usar (Arr + Comp - Deducts) o (TotalOcc - HouseUse - deducts) según consistencia.
  // Para evitar locuras, calculamos RoomsOccMinusHU desde:
  //   occupiedNet = (Arr + Comp) - (DeductIndiv + DeductGroup)
  // y si eso da 0 pero hay totalOcc, usamos totalOcc - houseUse - deducts.

  let roomsAvailable = 0;
  let arr = 0;
  let comp = 0;
  let deduct = 0;
  let houseUse = 0;

  let roomRevenue = 0;
  let persons = 0;

  for (const r of rows) {
    roomsAvailable += r.totalOcc > 0 ? r.totalOcc : 0;
    arr += r.arrRooms;
    comp += r.compRooms;
    deduct += r.deductIndiv + r.deductGroup;
    houseUse += r.houseUse;

    roomRevenue += r.roomRevenue;
    persons += r.adlChl;
  }

  const roomsSoldRaw = Math.max(0, arr + comp - deduct);

  const roomsOccMinusHU =
    roomsSoldRaw > 0 ? Math.max(0, roomsSoldRaw - houseUse) : Math.max(0, roomsAvailable - houseUse - deduct);

  const occupancy = clamp01(safeDiv(roomsOccMinusHU, roomsAvailable));
  const adr = safeDiv(roomRevenue, Math.max(1, roomsOccMinusHU)); // ADR sobre ocupadas netas
  const revpar = safeDiv(roomRevenue, Math.max(1, roomsAvailable)); // REVPAR clásico

  const doubleOcc = safeDiv(persons, Math.max(1, roomsOccMinusHU));

  return {
    roomsAvailable,
    roomsSold: roomsSoldRaw,
    roomsOccMinusHU,

    occupancy,
    adr,
    revpar,

    roomRevenue,
    persons,
    doubleOcc,
  };
}

/* ======================
   Slices (year/quarter/month/dow)
====================== */

export type SliceItem = {
  key: string;
  label: string;
  rows: HofRow[];
  agg: HofAgg;
};

export function sliceRows(rows: HofRow[], by: "year" | "quarter" | "month" | "dowName"): SliceItem[] {
  const map = new Map<string, HofRow[]>();

  for (const r of rows) {
    let key = "";
    let label = "";

    if (by === "year") {
      key = String(r.year);
      label = String(r.year);
    } else if (by === "quarter") {
      key = `${r.year}-Q${r.quarter}`;
      label = `Q${r.quarter} ${r.year}`;
    } else if (by === "month") {
      key = `${r.year}-${String(r.month).padStart(2, "0")}`;
      label = `${MONTH_NAMES[r.month]} ${r.year}`;
    } else {
      key = String(r.dow);
      label = r.dowName;
    }

    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }

  const items: SliceItem[] = [];
  for (const [k, rr] of map.entries()) {
    items.push({
      key: k,
      label: deriveLabel(by, k, rr),
      rows: rr,
      agg: aggregateHof(rr),
    });
  }

  // orden
  items.sort((a, b) => compareSliceKeys(by, a.key, b.key));
  return items;
}

function deriveLabel(by: "year" | "quarter" | "month" | "dowName", key: string, rows: HofRow[]): string {
  if (by === "dowName") {
    const d = rows[0]?.dow ?? Number(key);
    return DOW_NAMES[d] ?? rows[0]?.dowName ?? key;
  }
  return rows[0]?.year
    ? by === "year"
      ? String(rows[0].year)
      : by === "quarter"
      ? `Q${rows[0].quarter} ${rows[0].year}`
      : `${MONTH_NAMES[rows[0].month]} ${rows[0].year}`
    : key;
}

function compareSliceKeys(by: "year" | "quarter" | "month" | "dowName", a: string, b: string): number {
  if (by === "dowName") return Number(a) - Number(b);

  // year
  if (by === "year") return Number(a) - Number(b);

  // quarter: "2025-Q2"
  if (by === "quarter") {
    const pa = a.split("-Q");
    const pb = b.split("-Q");
    const ya = Number(pa[0]);
    const yb = Number(pb[0]);
    if (ya !== yb) return ya - yb;
    return Number(pa[1]) - Number(pb[1]);
  }

  // month: "2025-06"
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  if (ya !== yb) return ya - yb;
  return ma - mb;
}

/* ======================
   Rankings
====================== */

export type RankMetric = "occupancy" | "adr" | "revpar" | "roomRevenue" | "doubleOcc";

export type RankingItem = {
  label: string;
  key: string;
  value: number;
  agg: HofAgg;
};

export function rankingByMonth(rows: HofRow[], metric: RankMetric, topN = 12): RankingItem[] {
  const items = sliceRows(rows, "month").map((s) => ({
    label: s.label,
    key: s.key,
    value: pickMetric(s.agg, metric),
    agg: s.agg,
  }));

  items.sort((a, b) => b.value - a.value);
  return items.slice(0, topN);
}

export function rankingByDow(rows: HofRow[], metric: RankMetric): RankingItem[] {
  const items = sliceRows(rows, "dowName").map((s) => ({
    label: s.label,
    key: s.key,
    value: pickMetric(s.agg, metric),
    agg: s.agg,
  }));

  items.sort((a, b) => b.value - a.value);
  return items;
}

function pickMetric(agg: HofAgg, metric: RankMetric): number {
  if (metric === "occupancy") return agg.occupancy;
  if (metric === "adr") return agg.adr;
  if (metric === "revpar") return agg.revpar;
  if (metric === "roomRevenue") return agg.roomRevenue;
  return agg.doubleOcc;
}

/* ======================
   Util: Años disponibles
====================== */

export function availableYears(rows: HofRow[], hotel?: string): number[] {
  const filtered = hotel ? filterByHotel(rows, hotel) : rows;
  const set = new Set<number>();
  for (const r of filtered) set.add(r.year);
  return Array.from(set).sort((a, b) => a - b);
}

/* ======================
   Util: Hoteles detectados
====================== */

export function detectedHotels(rows: HofRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) set.add(String(r.empresa ?? "").toUpperCase());
  return Array.from(set).sort();
}
