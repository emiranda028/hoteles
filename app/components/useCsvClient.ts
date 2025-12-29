"use client";

export type CsvRow = Record<string, any>;

export type CsvReadResult = {
  rows: CsvRow[];
  columns: string[];
  delimiter: string;
};

function excelSerialToDate(n: number): Date | null {
  // Excel serial date (days since 1899-12-30 in Windows)
  if (!Number.isFinite(n)) return null;
  // típicamente > 20000 para años modernos
  if (n < 20000) return null;
  const base = new Date(Date.UTC(1899, 11, 30));
  const ms = n * 24 * 60 * 60 * 1000;
  const d = new Date(base.getTime() + ms);
  return isNaN(d.getTime()) ? null : d;
}

export function parseDateAny(v: any): Date | null {
  if (v === null || v === undefined) return null;

  // serial Excel
  if (typeof v === "number") return excelSerialToDate(v);

  const s = String(v).trim();
  if (!s) return null;

  // serial Excel como string
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    const d = excelSerialToDate(n);
    if (d) return d;
  }

  // dd/mm/yyyy
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) return new Date(Number(m1[3]), Number(m1[2]) - 1, Number(m1[1]));

  // dd-mm-yy or dd-mm-yyyy (y también dd-mm-yy Day)
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (m2) {
    let yy = Number(m2[3]);
    if (yy < 100) yy += 2000;
    return new Date(yy, Number(m2[2]) - 1, Number(m2[1]));
  }

  // ISO o parse normal
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function detectDelimiter(sample: string): string {
  // probamos TAB, ;, ,
  const lines = sample.split(/\r?\n/).slice(0, 10).filter(Boolean);
  const test = (delim: string) => {
    const counts = lines.map((l) => l.split(delim).length);
    // “bueno” si tiene más de 3 columnas y es bastante consistente
    const avg = counts.reduce((a, b) => a + b, 0) / Math.max(1, counts.length);
    const variance = counts.reduce((a, b) => a + Math.abs(b - avg), 0);
    return { avg, variance };
  };

  const tTab = test("\t");
  const tSemi = test(";");
  const tComma = test(",");

  // preferimos el que tenga mayor avg y menor variación
  const candidates = [
    { d: "\t", ...tTab },
    { d: ";", ...tSemi },
    { d: ",", ...tComma },
  ].sort((a, b) => (b.avg - a.avg) || (a.variance - b.variance));

  return candidates[0].d;
}

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === delim && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out.map((s) => s.trim());
}

export async function readCsvFromPublic(path: string): Promise<CsvReadResult> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo leer CSV: ${path} (${res.status})`);
  const text = await res.text();

  const delimiter = detectDelimiter(text);

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return { rows: [], columns: [], delimiter };

  const header = splitLine(lines[0], delimiter).map((h) => h.replace(/^"|"$/g, ""));
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = splitLine(lines[i], delimiter);
    const row: CsvRow = {};
    for (let c = 0; c < header.length; c++) row[header[c]] = vals[c] ?? "";
    rows.push(row);
  }

  return { rows, columns: header, delimiter };
}

/* ======================
   Helpers numéricos
====================== */

export function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;

  const s = String(v).trim();
  if (!s) return 0;

  // 22.441,71 -> 22441.71
  const cleaned = s.replace(/\./g, "").replace(",", ".").replace("%", "").trim();
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

export function toPercent01(v: number): number {
  if (v > 1) return v / 100;
  return v;
}

export function formatMoney(n: number): string {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function formatInt(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

export function formatPct01(n01: number): string {
  return (n01 * 100).toFixed(1) + "%";
}
