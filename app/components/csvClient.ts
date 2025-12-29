// app/components/csvClient.ts
export type CsvRow = Record<string, any>;

export type CsvReadResult = {
  rows: CsvRow[];
  headers: string[];
};

function normalizeHeader(h: string): string {
  return String(h ?? "")
    .replace(/\uFEFF/g, "") // BOM
    .replace(/\r/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * CSV parser robusto:
 * - soporta delimitador ';'
 * - soporta comillas '"'
 * - soporta saltos de línea dentro de campos (muy importante para tus headers tipo "Total\nOcc.")
 */
export function parseDelimited(text: string, delimiter: string = ";"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    // si es una fila vacía total, no la agregamos
    const allEmpty = row.every((c) => String(c ?? "").trim() === "");
    if (!allEmpty) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      // Escapado de comillas: "" dentro de un campo quoted
      const next = text[i + 1];
      if (inQuotes && next === '"') {
        field += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      pushField();
      continue;
    }

    if (!inQuotes && (ch === "\n")) {
      pushField();
      pushRow();
      continue;
    }

    if (!inQuotes && ch === "\r") {
      // ignorar CR, el LF ya corta fila
      continue;
    }

    field += ch;
  }

  // flush final
  pushField();
  pushRow();

  return rows;
}

/** Detecta si el texto parece separado por ';' */
function looksSemicolonDelimited(sample: string): boolean {
  const firstLine = sample.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  // Heurística simple: más ';' que ',' en header
  const sc = (firstLine.match(/;/g) ?? []).length;
  const cc = (firstLine.match(/,/g) ?? []).length;
  return sc >= cc && sc > 0;
}

export async function readCsvFromPublic(path: string): Promise<CsvReadResult> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`No se pudo leer CSV: ${path} (${res.status})`);
  }

  const text = await res.text();
  const delim = looksSemicolonDelimited(text.slice(0, 2000)) ? ";" : ",";

  const matrix = parseDelimited(text, delim);
  if (!matrix.length) return { rows: [], headers: [] };

  const rawHeaders = matrix[0].map(normalizeHeader);
  const headers = rawHeaders;

  const rows: CsvRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i];
    const obj: CsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = r[j] ?? "";
    }
    rows.push(obj);
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

  // ejemplos:
  // "22.441,71" => 22441.71
  // "59,40%" => 59.40
  // "112,3" => 112.3
  const cleaned = s
    .replace(/\s/g, "")
    .replace(/\./g, "") // miles
    .replace(",", ".") // decimal
    .replace("%", "");

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

export function toPercent01(v: number): number {
  // si viene 59.4 => 0.594
  if (v > 1) return v / 100;
  return v;
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
