// app/components/hofModel.ts
import { CsvRow, toNumberSmart, toPercent01 } from "./useCsvClient";

export type GlobalHotel = "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";
export type GroupKey = "JCR" | "GOTEL";

export const DEFAULT_YEAR = 2025;

// Archivos (PUBLIC)
export const HF_PATH = "/data/hf_diario.csv"; // ✅ tu archivo real
export const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
export const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

export const JCR_HOTELS: GlobalHotel[] = ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];
export const GOTEL_HOTELS: GlobalHotel[] = ["MAITEI"];

export const HOTEL_GROUP: Record<GlobalHotel, GroupKey> = {
  MARRIOTT: "JCR",
  "SHERATON BCR": "JCR",
  "SHERATON MDQ": "JCR",
  MAITEI: "GOTEL",
};

export const HOTEL_LABEL: Record<GlobalHotel, string> = {
  MARRIOTT: "Marriott",
  "SHERATON BCR": "Sheraton BCR",
  "SHERATON MDQ": "Sheraton MDQ",
  MAITEI: "Maitei",
};

// Orden meses / días
export const MONTHS_ES = [
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

export const DOW_ES_MON0 = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

// =====================================
// Columnas esperadas (tolerantes)
// =====================================

function findKey(keys: string[], candidates: string[]) {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const map = new Map(keys.map((k) => [norm(k), k]));
  for (const c of candidates) {
    const hit = map.get(norm(c));
    if (hit) return hit;
  }
  // fallback: contains
  for (const k of keys) {
    const nk = norm(k);
    if (candidates.some((c) => nk.includes(norm(c)))) return k;
  }
  return "";
}

export type HofRow = {
  // keys base
  Empresa: string;
  FechaISO: string; // yyyy-mm-dd
  Year: number;
  Month: number; // 1-12
  Quarter: number; // 1-4
  DOW: number; // 0..6 (lun=0)
  // métricas
  TotalOcc: number;
  ArrRooms: number;
  CompRooms: number;
  HouseUse: number;
  DeductIndiv: number;
  DeductGroup: number;
  OccPct01: number; // 0..1
  RoomRevenue: number;
  AverageRate: number;
  DepRooms: number;
  DayUseRooms: number;
  NoShowRooms: number;
  OooRooms: number;
  AdlChl: number;
  HoF: string; // History/Forecast
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dateToISO(d: Date) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const da = pad2(d.getDate());
  return `${y}-${m}-${da}`;
}

function parseDdMmYyyy(s: string): Date | null {
  // soporta 1/6/2022 o 01/06/2022 o 1-6-2022
  const m = s.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  let yy = Number(m[3]);
  if (yy < 100) yy += 2000;
  if (!dd || !mm || !yy) return null;
  const d = new Date(yy, mm - 1, dd);
  if (isNaN(d.getTime())) return null;
  return d;
}

function parseFromDateColumn(s: string): Date | null {
  // Ej: "01-06-22 Wed"
  const first = s.trim().split(/\s+/)[0]; // "01-06-22"
  const m = first.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  let yy = Number(m[3]);
  if (yy < 100) yy += 2000;
  const d = new Date(yy, mm - 1, dd);
  if (isNaN(d.getTime())) return null;
  return d;
}

function computeDowMon0(d: Date): number {
  // JS: 0=Dom..6=Sáb => queremos Lun=0..Dom=6
  const js = d.getDay(); // 0..6
  // dom(0)->6, lun(1)->0, ...
  return (js + 6) % 7;
}

function normalizeEmpresa(raw: any): string {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");

  if (!s) return "";

  // normalizaciones comunes
  if (s.includes("MARRIOTT")) return "MARRIOTT";

  // Sheraton: NO unir BCR y MDQ
  if (s.includes("BARI") || s.includes("BRC") || s.includes("BARILOCHE") || s.includes("BCR")) return "SHERATON BCR";
  if (s.includes("MDQ") || s.includes("MAR DEL PLATA") || s.includes("MDP")) return "SHERATON MDQ";

  // Maitei / gotel
  if (s.includes("MAITEI")) return "MAITEI";

  // Si ya viene prolijo:
  if (s === "SHERATON BCR" || s === "SHERATON MDQ") return s;

  return s;
}

export function buildHofRows(rawRows: CsvRow[]): HofRow[] {
  if (!rawRows?.length) return [];

  const keys = Object.keys(rawRows[0] ?? {});
  const kEmpresa = findKey(keys, ["Empresa", "Hotel"]);
  const kFecha = findKey(keys, ["Fecha"]);
  const kDate = findKey(keys, ["Date"]);

  const kHoF = findKey(keys, ["HoF", "Hof", "History/Forecast", "History Forecast"]);

  const kTotalOcc = findKey(keys, ['Total\nOcc.', "Total Occ.", "Total Occ", "TotalOcc"]);
  const kArrRooms = findKey(keys, ['Arr.\nRooms', "Arr. Rooms", "Arr Rooms"]);
  const kCompRooms = findKey(keys, ['Comp.\nRooms', "Comp. Rooms", "Comp Rooms"]);
  const kHouseUse = findKey(keys, ['House\nUse', "House Use"]);
  const kDedInd = findKey(keys, ['Deduct\nIndiv.', "Deduct Indiv.", "Deduct Indiv", "Deduct Indiv"]);
  const kDedGrp = findKey(keys, ['Deduct\nGroup', "Deduct Group"]);
  const kOccPct = findKey(keys, ["Occ.%", "Occ %", "Occ%", "Occupancy", "OCC%"]);
  const kRoomRev = findKey(keys, ["Room Revenue", "RoomRevenue"]);
  const kADR = findKey(keys, ["Average Rate", "ADR", "AverageRate"]);
  const kDepRooms = findKey(keys, ['Dep.\nRooms', "Dep. Rooms", "Dep Rooms"]);
  const kDayUse = findKey(keys, ['Day Use\nRooms', "Day Use Rooms"]);
  const kNoShow = findKey(keys, ['No Show\nRooms', "No Show Rooms", "NoShow Rooms"]);
  const kOOO = findKey(keys, ['OOO\nRooms', "OOO Rooms", "Out of Order"]);
  const kAdlChl = findKey(keys, ['Adl. &\nChl.', "Adl. & Chl.", "Adl & Chl", "Adults & Children"]);

  const out: HofRow[] = [];

  for (const r of rawRows) {
    const empresa = normalizeEmpresa(r[kEmpresa]);
    if (!empresa) continue;

    let d: Date | null = null;

    // Preferencia: Fecha
    if (kFecha && r[kFecha]) {
      d = parseDdMmYyyy(String(r[kFecha]).trim());
    }
    // Fallback: Date
    if (!d && kDate && r[kDate]) {
      d = parseFromDateColumn(String(r[kDate]).trim());
    }
    if (!d) continue;

    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const quarter = Math.floor((month - 1) / 3) + 1;
    const dow = computeDowMon0(d);

    const occPctRaw = toNumberSmart(r[kOccPct]);
    const occPct01 = toPercent01(occPctRaw);

    out.push({
      Empresa: empresa,
      FechaISO: dateToISO(d),
      Year: year,
      Month: month,
      Quarter: quarter,
      DOW: dow,
      TotalOcc: toNumberSmart(r[kTotalOcc]),
      ArrRooms: toNumberSmart(r[kArrRooms]),
      CompRooms: toNumberSmart(r[kCompRooms]),
      HouseUse: toNumberSmart(r[kHouseUse]),
      DeductIndiv: toNumberSmart(r[kDedInd]),
      DeductGroup: toNumberSmart(r[kDedGrp]),
      OccPct01: occPct01,
      RoomRevenue: toNumberSmart(r[kRoomRev]),
      AverageRate: toNumberSmart(r[kADR]),
      DepRooms: toNumberSmart(r[kDepRooms]),
      DayUseRooms: toNumberSmart(r[kDayUse]),
      NoShowRooms: toNumberSmart(r[kNoShow]),
      OooRooms: toNumberSmart(r[kOOO]),
      AdlChl: toNumberSmart(r[kAdlChl]),
      HoF: String(r[kHoF] ?? "").trim(),
    });
  }

  return out;
}

export function filterHofByHotel(rows: HofRow[], hotel: GlobalHotel): HofRow[] {
  const target = hotel;
  return rows.filter((r) => normalizeEmpresa(r.Empresa) === target);
}

export function filterHofByYear(rows: HofRow[], year: number): HofRow[] {
  return rows.filter((r) => r.Year === year);
}

export function filterHofByHoF(rows: HofRow[], hof: "History" | "Forecast" | "All"): HofRow[] {
  if (hof === "All") return rows;
  return rows.filter((r) => String(r.HoF || "").toLowerCase().includes(hof.toLowerCase()));
}

// ranking helpers
export function groupBy<T extends string | number>(arr: any[], keyFn: (x: any) => T) {
  const m = new Map<T, any[]>();
  for (const it of arr) {
    const k = keyFn(it);
    m.set(k, [...(m.get(k) ?? []), it]);
  }
  return m;
}
