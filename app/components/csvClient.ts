// app/components/csvClient.ts

export type CsvRow = Record<string, any>;

/** Lee un CSV desde /public (path tipo "/data/hf_diario.csv") y devuelve rows (objects por header) */
export async function readCsvFromPublic(path: string): Promise<CsvRow[]> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo leer CSV: ${path} (${res.status})`);
  const text = await res.text();
  return parseCsv(text);
}

/* ======================
   Parser CSV simple (sin dependencias)
====================== */

function parseCsv(text: string): CsvRow[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]).map((h) => stripQuotes(h).trim());
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row: CsvRow = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = stripQuotes(cols[c] ?? "").trim();
    }
    rows.push(row);
  }

  return rows;
}

/** Split por comas respetando comillas */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // "" dentro de quoted => "
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

function stripQuotes(s: string): string {
  if (!s) return "";
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  return t;
}

/* ======================
   Helpers numéricos (EXPORTADOS)
====================== */

export function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;

  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return 0;

    // saca % y espacios
    const noPct = s.replace("%", "").trim();

    // detecta si viene como 22.441,71 (es-AR) => miles '.' y decimal ','
    // o 22,441.71 (en-US) => miles ',' y decimal '.'
    const hasComma = noPct.includes(",");
    const hasDot = noPct.includes(".");

    let normalized = noPct;

    if (hasComma && hasDot) {
      // si el último separador es coma => decimal coma
      const lastComma = noPct.lastIndexOf(",");
      const lastDot = noPct.lastIndexOf(".");
      if (lastComma > lastDot) {
        normalized = noPct.replace(/\./g, "").replace(",", ".");
      } else {
        normalized = noPct.replace(/,/g, "");
      }
    } else if (hasComma && !hasDot) {
      // "126,79" => decimal coma
      normalized = noPct.replace(/\./g, "").replace(",", ".");
    } else {
      // "22441.71" o "22441" (o con miles ",")
      normalized = noPct.replace(/,/g, "");
    }

    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }

  return 0;
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

/** clamp 0..1 (lo piden tus componentes) */
export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Si viene 59.4 -> 0.594 ; si viene 0.594 queda igual */
export function toPercent01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v > 1) return v / 100;
  return v;
}

/** USD sin decimales (lo piden tus componentes) */
export function formatMoneyUSD(n: number): string {
  const val = Number.isFinite(n) ? n : 0;
  return val.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/** Por compatibilidad con código viejo */
export function formatMoney(n: number): string {
  const val = Number.isFinite(n) ? n : 0;
  return val.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function formatPct(n01: number): string {
  const v = Number.isFinite(n01) ? n01 : 0;
  return (v * 100).toFixed(1) + "%";
}
