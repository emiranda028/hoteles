// app/components/csvClient.ts
// CSV client SIN dependencias externas (no papaparse)
// + helpers numéricos y de fechas que hoy te están faltando en imports.

export type CsvRow = Record<string, any>;

export type CsvReadResult = {
  rows: CsvRow[];
  rawText?: string;
};

/* ======================
   CSV parser (simple)
   - Soporta separador "," o ";"
   - Soporta comillas dobles y comillas escapadas ("")
====================== */

function parseCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // Si estamos en comillas y vienen dos "" => comilla literal
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out;
}

function guessDelimiter(text: string): "," | ";" {
  const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
  const commas = (sample.match(/,/g) || []).length;
  const semis = (sample.match(/;/g) || []).length;
  return semis > commas ? ";" : ",";
}

function parseCsvText(text: string): CsvRow[] {
  const delim = guessDelimiter(text);

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== "");

  if (lines.length === 0) return [];

  const header = parseCsvLine(lines[0], delim).map((h) => h.trim());
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], delim);

    const row: CsvRow = {};
    for (let c = 0; c < header.length; c++) {
      const key = header[c] ?? `col_${c}`;
      row[key] = (cols[c] ?? "").trim();
    }
    rows.push(row);
  }

  return rows;
}

export async function readCsvFromPublic(path: string): Promise<CsvReadResult> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo leer CSV: ${path} (${res.status})`);
  const text = await res.text();
  const rows = parseCsvText(text);
  return { rows, rawText: text };
}

// Compat: si algún componente espera el array directo.
export async function readCsvRowsFromPublic(path: string): Promise<CsvRow[]> {
  const { rows } = await readCsvFromPublic(path);
  return rows;
}

/* ======================
   Helpers numéricos
====================== */

export function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  // Fecha excel serial llega como number en algunos flujos; no lo convertimos acá.
  const s = String(v).trim();
  if (!s) return 0;

  // Quitar símbolos comunes
  // - miles: "." o ","
  // - decimales: "," (ES) o "."
  // Estrategia:
  // 1) si tiene % => se quita, el caller decide si /100
  // 2) si tiene ambos "." y "," asumimos "." miles y "," decimal (es-AR)
  // 3) si solo tiene "," asumimos decimal ","
  // 4) si solo tiene "." asumimos decimal "."
  let cleaned = s.replace(/\s+/g, "").replace(/\$/g, "").replace(/USD/gi, "").replace(/%/g, "");

  const hasDot = cleaned.includes(".");
  const hasComma = cleaned.includes(",");

  if (hasDot && hasComma) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (hasComma && !hasDot) {
    cleaned = cleaned.replace(",", ".");
  } else {
    // solo dot o ninguno: queda igual
  }

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// Convierte 75 -> 0.75 si parece porcentaje "en 0-100"
export function toPercent01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v > 1) return v / 100;
  return v;
}

export function formatInt(n: number): string {
  const x = Number.isFinite(n) ? n : 0;
  return Math.round(x).toLocaleString("es-AR");
}

export function formatMoneyUSD(n: number, maxFractionDigits: number = 0): string {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: maxFractionDigits,
  });
}

// Alias por compat (si ya usabas formatMoney)
export function formatMoney(n: number): string {
  return formatMoneyUSD(n, 0);
}

export function formatPct01(n01: number, digits: number = 1): string {
  const x = Number.isFinite(n01) ? n01 : 0;
  return (x * 100).toFixed(digits) + "%";
}

// Alias por compat (si ya usabas formatPct)
export function formatPct(n01: number): string {
  return formatPct01(n01, 1);
}

/* ======================
   Fechas
   - dd/mm/yyyy o d/m/yyyy
   - yyyy-mm-dd
   - Excel serial (ej: 46004)
====================== */

function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  // Excel (Windows) day 1 = 1899-12-31, con bug 1900 leap year.
  // La conversión típica: base 1899-12-30
  const base = new Date(Date.UTC(1899, 11, 30));
  const ms = serial * 24 * 60 * 60 * 1000;
  return new Date(base.getTime() + ms);
}

export function parseFechaSmart(v: any): Date | null {
  if (v === null || v === undefined) return null;

  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;

  if (typeof v === "number") {
    // Excel serial
    return excelSerialToDate(v);
  }

  const s = String(v).trim();
  if (!s) return null;

  // Si es número pero vino como string (ej "46004")
  if (/^\d{4,6}$/.test(s)) {
    const maybe = Number(s);
    if (Number.isFinite(maybe) && maybe > 30000 && maybe < 60000) {
      return excelSerialToDate(maybe);
    }
  }

  // dd/mm/yyyy
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    let yy = Number(m1[3]);
    if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // yyyy-mm-dd
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m2) {
    const yy = Number(m2[1]);
    const mm = Number(m2[2]);
    const dd = Number(m2[3]);
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // Fallback: Date.parse
  const t = Date.parse(s);
  if (!isNaN(t)) return new Date(t);

  return null;
}
