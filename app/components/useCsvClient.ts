// app/components/useCsvClient.ts
// CSV client SIN dependencias externas (evita papaparse en Vercel)

export type CsvRow = Record<string, any>;

export type CsvReadResult = {
  rows: CsvRow[];
  headers: string[];
};

function stripBom(s: string) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function splitCsvLine(line: string): string[] {
  // Parser simple con soporte de comillas dobles.
  // - Separador: coma (,)
  // - Campos con comillas: "a,b" y escapes "" dentro de ""
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // escape ""
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
  return out.map((x) => x.trim());
}

function normalizeHeader(h: string) {
  // respeta header exacto pero limpia espacios
  return h.replace(/\s+/g, " ").trim();
}

function isEmptyRow(obj: CsvRow) {
  const keys = Object.keys(obj);
  if (!keys.length) return true;
  return keys.every((k) => {
    const v = obj[k];
    return v === null || v === undefined || String(v).trim() === "";
  });
}

export async function readCsvFromPublic(path: string): Promise<CsvReadResult> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`No se pudo leer CSV: ${path} (${res.status})`);
  }

  const raw = stripBom(await res.text());
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== "");

  if (!lines.length) {
    return { rows: [], headers: [] };
  }

  const headers = splitCsvLine(lines[0]).map(normalizeHeader);

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row: CsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cols[j] ?? "";
    }
    if (!isEmptyRow(row)) rows.push(row);
  }

  return { rows, headers };
}

/* ======================
   Helpers numéricos
====================== */

export function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  const s = String(v).trim();
  if (!s) return 0;

  // Maneja: "22.441,71" -> 22441.71 ; "59,40%" -> 59.4
  const cleaned = s
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace("%", "");

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

export function toPercent01(v: number): number {
  // Si viene 59.4 lo baja a 0.594
  if (!Number.isFinite(v)) return 0;
  return v > 1 ? v / 100 : v;
}

export function formatMoney(n: number): string {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function formatInt(n: number): string {
  const x = Number.isFinite(n) ? n : 0;
  return Math.round(x).toLocaleString("es-AR");
}

export function formatPct01(n01: number): string {
  const x = Number.isFinite(n01) ? n01 : 0;
  return (x * 100).toFixed(1) + "%";
}
