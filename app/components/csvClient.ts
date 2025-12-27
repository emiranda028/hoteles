"use client";

/**
 * CSV reader ultra simple (sin papaparse).
 * - Soporta separador ; o ,
 * - Soporta comillas "..."
 * - Devuelve array de objetos (header -> value)
 */

export type CsvRow = Record<string, string>;

function detectDelimiter(line: string) {
  const sc = (line.match(/;/g) ?? []).length;
  const cc = (line.match(/,/g) ?? []).length;
  return sc >= cc ? ";" : ",";
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // escape "" dentro de quotes
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      out.push(cur.trim());
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur.trim());
  return out;
}

export async function readCsvFromPublic(path: string): Promise<CsvRow[]> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo leer CSV (${res.status}): ${path}`);
  const text = await res.text();

  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return [];

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map((h) => h.replace(/^\uFEFF/, "").trim());

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i], delimiter);
    const row: CsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] ?? "").trim();
    }
    rows.push(row);
  }

  return rows;
}

/* ======================
   Helpers numéricos
====================== */

export function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (!s) return 0;

  // quita separadores miles y %
  const cleaned = s
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace("%", "");

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function toPercent01(raw: any): number {
  const n = toNumberSmart(raw);
  // si viene 59,4 o 59.4 => 0.594
  if (n > 1) return n / 100;
  return n;
}

export function formatInt(n: number): string {
  return Math.round(n).toLocaleString("es-AR");
}

export function formatMoneyUSD0(n: number): string {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function formatPct01(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

/* ======================
   Fechas / Año / Mes
====================== */

// CSV trae "Fecha" como 1/6/2022 (d/m/yyyy) o similar.
// A veces puede venir algo raro: lo manejamos devolviendo null.
export function parseDMY(s: string): Date | null {
  const t = (s ?? "").trim();
  if (!t) return null;

  // intenta d/m/yyyy o dd-mm-yy etc.
  const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yy = Number(m[3]);
    if (yy < 100) yy = 2000 + yy;
    const d = new Date(yy, mm - 1, dd);
    if (!isNaN(d.getTime())) return d;
  }

  // intento Date.parse
  const d2 = new Date(t);
  if (!isNaN(d2.getTime())) return d2;

  return null;
}

export function getYearFromRow(row: Record<string, any>, dateKey: string): number | null {
  const d = parseDMY(String(row[dateKey] ?? ""));
  return d ? d.getFullYear() : null;
}

export function getMonthFromRow(row: Record<string, any>, dateKey: string): number | null {
  const d = parseDMY(String(row[dateKey] ?? ""));
  return d ? d.getMonth() + 1 : null; // 1..12
}
