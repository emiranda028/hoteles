// app/components/csvClient.ts
export type CsvRow = Record<string, any>;

/**
 * CSV parser liviano (sin dependencias).
 * - autodetecta delimitador (; o ,)
 * - respeta comillas dobles
 * - header: true
 */
function parseCsv(text: string): CsvRow[] {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) return [];

  // Detect delimiter usando la primera línea (header)
  const headerLine = lines[0];
  const semi = (headerLine.match(/;/g) || []).length;
  const comma = (headerLine.match(/,/g) || []).length;
  const delim = semi > comma ? ";" : ",";

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (ch === '"') {
        // manejar "" como escape
        const next = line[i + 1];
        if (inQuotes && next === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (!inQuotes && ch === delim) {
        out.push(cur);
        cur = "";
        continue;
      }

      cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const headers = splitLine(lines[0]).map((h) => h.replace(/^\uFEFF/, "").trim());

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const obj: CsvRow = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = cols[c] ?? "";
    }
    rows.push(obj);
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
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  const s = String(v).trim();
  if (!s) return 0;

  // % explícito
  const isPct = s.includes("%");

  // Normalizar: 22.441,71 -> 22441.71
  //            22,441.71 -> 22441.71 (caso raro)
  let cleaned = s.replace(/\s/g, "").replace(/%/g, "");

  // Si tiene ambos separadores, asumimos miles "." y decimales ","
  if (cleaned.includes(".") && cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",") && !cleaned.includes(".")) {
    // 123,45 => 123.45
    cleaned = cleaned.replace(",", ".");
  }

  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;

  return n;
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

/** Convierte 59.4 o 59,4% a 0.594; si ya viene 0.594 lo deja */
export function toPercent01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v > 1) return v / 100;
  if (v < 0) return 0;
  return v;
}

export function formatMoney(n: number): string {
  const val = Number.isFinite(n) ? n : 0;
  return val.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function formatInt(n: number): string {
  const val = Number.isFinite(n) ? n : 0;
  return val.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

export function formatPct01(n01: number): string {
  const val = Number.isFinite(n01) ? n01 : 0;
  return (val * 100).toFixed(1) + "%";
}
