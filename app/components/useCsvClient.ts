// app/components/useCsvClient.ts
"use client";

/**
 * Cliente CSV robusto (sin papaparse) + hooks
 * - Compatible con componentes que esperan:
 *    A) readCsvFromPublic(path).then(({ rows }) => ...)
 *    B) readCsvRowsFromPublic(path).then((rows) => ...)
 * - Detecta delimitador ; o ,
 * - Soporta comillas y saltos dentro de comillas
 * - Limpia BOM
 * - Helpers numéricos / fechas
 */

import { useEffect, useMemo, useState } from "react";

export type CsvRow = Record<string, any>;

export type CsvReadMeta = {
  delimiter: string;
  lineCount: number;
  rowCount: number;
  rawLength: number;
};

export type CsvReadResult = {
  rows: CsvRow[];
  headers: string[];
  meta: CsvReadMeta;
};

/* =========================
   Fetch + Parse
========================= */

export async function readCsvFromPublic(path: string): Promise<CsvReadResult> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`No se pudo leer CSV: ${path} (${res.status})`);
  }

  const textRaw = await res.text();
  const text = stripBom(textRaw);

  const { rows, headers, delimiter } = parseDelimited(text);

  return {
    rows,
    headers,
    meta: {
      delimiter,
      lineCount: countLines(text),
      rowCount: rows.length,
      rawLength: text.length,
    },
  };
}

/**
 * Para compatibilidad con código viejo que esperaba CsvRow[]
 */
export async function readCsvRowsFromPublic(path: string): Promise<CsvRow[]> {
  const { rows } = await readCsvFromPublic(path);
  return rows;
}

/* =========================
   Hook React (opcional)
========================= */

export function useCsv(path: string) {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [meta, setMeta] = useState<CsvReadMeta | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let alive = true;

    setLoading(true);
    setError("");

    readCsvFromPublic(path)
      .then((r) => {
        if (!alive) return;
        setRows(r.rows);
        setHeaders(r.headers);
        setMeta(r.meta);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e?.message ?? "Error leyendo CSV");
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [path]);

  return { rows, headers, meta, loading, error };
}

/* =========================
   Parser CSV/DSV robusto
========================= */

export function parseDelimited(input: string): {
  rows: CsvRow[];
  headers: string[];
  delimiter: string;
} {
  const trimmed = input.trim();
  if (!trimmed) return { rows: [], headers: [], delimiter: "," };

  const delimiter = detectDelimiter(trimmed);

  const table = parseToTable(trimmed, delimiter);
  if (table.length === 0) return { rows: [], headers: [], delimiter };

  const headers = (table[0] ?? []).map((h) => normalizeHeader(h));
  const rows: CsvRow[] = [];

  for (let i = 1; i < table.length; i++) {
    const line = table[i];
    if (!line) continue;

    // Si la fila es toda vacía, saltar
    const hasAny = line.some((v) => (v ?? "").toString().trim() !== "");
    if (!hasAny) continue;

    const obj: CsvRow = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c] || `col_${c + 1}`;
      obj[key] = line[c] ?? "";
    }
    rows.push(obj);
  }

  return { rows, headers, delimiter };
}

/**
 * Convierte el texto en una tabla (array de arrays) respetando comillas.
 */
function parseToTable(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];

  let curField = "";
  let curRow: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      const next = text[i + 1];
      // Escapado de comilla doble: "" => "
      if (inQuotes && next === '"') {
        curField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      curRow.push(curField);
      curField = "";
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      // Manejar \r\n
      if (ch === "\r" && text[i + 1] === "\n") i++;

      curRow.push(curField);
      rows.push(curRow);

      curField = "";
      curRow = [];
      continue;
    }

    curField += ch;
  }

  // último campo
  curRow.push(curField);
  rows.push(curRow);

  // limpiar espacios
  return rows.map((r) => r.map((v) => (v ?? "").toString().trim()));
}

/**
 * Detecta si es ; o , mirando la primera línea útil.
 */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const comma = (firstLine.match(/,/g) || []).length;
  const semi = (firstLine.match(/;/g) || []).length;

  // Si hay muchos ; suele ser español/Argentina
  if (semi > comma) return ";";
  return ",";
}

function stripBom(s: string): string {
  if (!s) return s;
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function countLines(s: string): number {
  if (!s) return 0;
  return s.split(/\r?\n/).length;
}

function normalizeHeader(h: string): string {
  // Mantener headers bastante “tal cual” pero sin BOM/espacios raros
  return (h ?? "")
    .replace(/\uFEFF/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================
   Helpers numéricos
========================= */

export function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;

  const s = String(v).trim();
  if (!s) return 0;

  // Si viene con % lo tratamos como porcentaje (pero devolvemos número "crudo")
  const noPct = s.replace("%", "").trim();

  // 22.441,71  => 22441.71
  // 22,441.71  => 22441.71 (por si)
  // 1.234      => 1234
  // 1,234      => 1234 (si no hay decimales claros)
  let cleaned = noPct;

  // quitar espacios
  cleaned = cleaned.replace(/\s/g, "");

  // Caso típico es-AR: miles con "." y decimal con ","
  // Heurística: si hay "," y después 1-2 dígitos => decimal
  const commaIndex = cleaned.lastIndexOf(",");
  const dotIndex = cleaned.lastIndexOf(".");

  if (commaIndex !== -1 && dotIndex !== -1) {
    // Si hay ambos, casi seguro '.' miles y ',' decimal
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (commaIndex !== -1) {
    // Solo coma: decidir si es decimal o miles
    const dec = cleaned.slice(commaIndex + 1);
    if (dec.length === 1 || dec.length === 2) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      // tratar coma como miles
      cleaned = cleaned.replace(/,/g, "");
    }
  } else {
    // Solo puntos o ninguno
    // Si hay más de un punto, asumir miles
    const dotCount = (cleaned.match(/\./g) || []).length;
    if (dotCount > 1) cleaned = cleaned.replace(/\./g, "");
  }

  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

/**
 * Si el valor parece venir como 59.40 (en vez de 0.594) o "59,40%"
 * y lo pasaste por toNumberSmart => 59.4, esto lo baja a 0.594
 */
export function toPercent01(v: number): number {
  if (!isFinite(v)) return 0;
  if (v > 1) return v / 100;
  return v;
}

export function formatMoneyUSD0(n: number): string {
  return (n || 0).toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function formatPct01(n: number): string {
  const v = isFinite(n) ? n : 0;
  return (v * 100).toFixed(1) + "%";
}

export function formatInt(n: number): string {
  return Math.round(n || 0).toLocaleString("es-AR");
}

/* =========================
   Helpers fechas / claves
========================= */

export function pickKey(keys: string[], candidates: string[]): string | null {
  const lower = keys.map((k) => k.toLowerCase());
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase());
    if (idx !== -1) return keys[idx];
  }
  return null;
}

/**
 * Preferimos "Fecha" sobre "Date"
 */
export function pickDateKey(keys: string[]): string | null {
  return (
    pickKey(keys, ["Fecha"]) ||
    pickKey(keys, ["Date"]) ||
    pickKey(keys, ["fecha"]) ||
    pickKey(keys, ["date"])
  );
}

export function parseDateSmart(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;

  const s = String(v).trim();
  if (!s) return null;

  // Caso dd/mm/yyyy
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const d = Number(m1[1]);
    const mo = Number(m1[2]) - 1;
    const y = Number(m1[3]);
    const dt = new Date(y, mo, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // ISO u otros que Date entienda
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

export function getYearFromRow(row: CsvRow, dateKey: string | null): number {
  if (!dateKey) return 0;
  const dt = parseDateSmart(row[dateKey]);
  return dt ? dt.getFullYear() : 0;
}

export function getMonthFromRow(row: CsvRow, dateKey: string | null): number {
  if (!dateKey) return 0;
  const dt = parseDateSmart(row[dateKey]);
  return dt ? dt.getMonth() + 1 : 0;
}

export function getQuarterFromRow(row: CsvRow, dateKey: string | null): number {
  const m = getMonthFromRow(row, dateKey);
  if (!m) return 0;
  return Math.floor((m - 1) / 3) + 1;
}

/* =========================
   Filtrado genérico
========================= */

export function filterByHotelYearQuarterMonth(args: {
  rows: CsvRow[];
  hotelKey?: string; // default "Empresa"
  hotel?: string; // "" o undefined => todos
  dateKey?: string; // prefer "Fecha"
  year?: number;
  quarter?: number; // 1..4
  month?: number; // 1..12
}): CsvRow[] {
  const { rows } = args;
  const hotelKey = args.hotelKey ?? "Empresa";
  const hotel = (args.hotel ?? "").trim();
  const year = args.year ?? 0;
  const quarter = args.quarter ?? 0;
  const month = args.month ?? 0;

  // Detectar dateKey si no vino
  const keys = rows[0] ? Object.keys(rows[0]) : [];
  const dateKey = args.dateKey ?? pickDateKey(keys) ?? "Fecha";

  return rows.filter((r) => {
    // Hotel exact match por Empresa (no mezclar Sheratons)
    if (hotel) {
      const val = String(r[hotelKey] ?? "").trim();
      if (val !== hotel) return false;
    }

    const y = getYearFromRow(r, dateKey);
    if (year && y !== year) return false;

    if (quarter) {
      const q = getQuarterFromRow(r, dateKey);
      if (q !== quarter) return false;
    }

    if (month) {
      const m = getMonthFromRow(r, dateKey);
      if (m !== month) return false;
    }

    return true;
  });
}

/* =========================
   KPI helpers (H&F)
========================= */

export function kpiOccPct(row: CsvRow): number {
  // Occ.% suele venir como "59,40%"
  const v = toNumberSmart(row["Occ.%"] ?? row["Occ%"] ?? row["Occ"]);
  return toPercent01(v);
}

export function kpiRoomRevenue(row: CsvRow): number {
  return toNumberSmart(row["Room Revenue"] ?? row["Room Reven"] ?? row["RoomReven"] ?? 0);
}

export function kpiADR(row: CsvRow): number {
  return toNumberSmart(row["Average Rate"] ?? row["ADR"] ?? row["AverageRate"] ?? 0);
}

export function kpiTotalRooms(row: CsvRow): number {
  return toNumberSmart(row["Total Occ."] ?? row["Total"] ?? 0);
}

export function kpiArrivals(row: CsvRow): number {
  return toNumberSmart(row["Arr. Rooms"] ?? row["Arr."] ?? row["Arr"] ?? 0);
}
