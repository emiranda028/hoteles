// app/components/csvClient.ts
export type CsvRow = Record<string, any>;

/**
 * CSV parser simple (sin dependencias) que soporta:
 * - separador coma
 * - campos con comillas dobles
 * - saltos de línea CRLF
 */
function parseCsv(text: string): CsvRow[] {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = cleaned.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (ch === '"') {
        // Escaped quote
        if (inQuotes && line[i + 1] === '"') {
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
    return out.map((s) => s.trim());
  };

  const headers = parseLine(lines[0]).map((h) => h.replace(/^\uFEFF/, "")); // BOM safe
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const r: CsvRow = {};
    for (let c = 0; c < headers.length; c++) {
      r[headers[c]] = cols[c] ?? "";
    }
    rows.push(r);
  }
  return rows;
}

export async function readCsvFromPublic(path: string): Promise<CsvRow[]> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo leer CSV: ${path} (${res.status})`);
  const text = await res.text();
  return parseCsv(text);
}

/* ======================
   Helpers numéricos
====================== */

export function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;

  const s = String(v).trim();
  if (!s) return 0;

  // s puede venir tipo "22.441,71" o "59,40%" o "126,79"
  const cleaned = s
    .replace(/\s/g, "")
    .replace(/%/g, "")
    .replace(/\./g, "") // miles
    .replace(",", "."); // decimal

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

/** Convierte 59.4 -> 0.594, y si ya viene 0.594 lo deja igual */
export function toPercent01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v > 1) return v / 100;
  return v;
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
