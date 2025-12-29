// app/components/useCsvClient.ts
"use client";

/**
 * CSV client sin dependencias (NO papaparse).
 * Devuelve { rows, headers } para que NO rompa en YearComparator / carrouseles / rankings.
 * Maneja:
 * - BOM UTF-8
 * - delimiters: , ; \t (auto-detect)
 * - comillas dobles con escape ("")
 * - saltos de línea dentro de campos quoted
 */

export type CsvRow = Record<string, any>;

export type CsvReadResult = {
  headers: string[];
  rows: CsvRow[];
  delimiter: string;
  rawTextLength: number;
};

const cache = new Map<string, CsvReadResult>();

function stripBom(s: string) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function normalizeHeader(h: string) {
  return String(h ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectDelimiter(sample: string): string {
  // Tomamos primeras líneas para detectar el separador
  const lines = sample.split(/\r?\n/).slice(0, 10).join("\n");
  const candidates = [",", ";", "\t", "|"];
  const score = (delim: string) => {
    // contar ocurrencias del delim fuera de comillas (aprox)
    let inQ = false;
    let c = 0;
    for (let i = 0; i < lines.length; i++) {
      const ch = lines[i];
      if (ch === '"') inQ = !inQ;
      if (!inQ && ch === delim) c++;
    }
    return c;
  };
  let best = ",";
  let bestScore = -1;
  for (const d of candidates) {
    const s = score(d);
    if (s > bestScore) {
      bestScore = s;
      best = d;
    }
  }
  return best;
}

/**
 * Parser CSV por state-machine.
 * Retorna matriz de filas (array de fields string).
 */
function parseCsvToMatrix(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";

  let i = 0;
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    // evitar agregar última fila vacía
    if (row.length === 1 && row[0] === "" && rows.length === 0) {
      // headers vacíos: igual dejamos que siga
    }
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes) {
        // escape de comillas dobles: ""
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        inQuotes = true;
        i++;
        continue;
      }
    }

    if (!inQuotes) {
      if (ch === delimiter) {
        pushField();
        i++;
        continue;
      }
      if (ch === "\n") {
        pushField();
        pushRow();
        i++;
        continue;
      }
      if (ch === "\r") {
        // CRLF
        const next = text[i + 1];
        if (next === "\n") {
          pushField();
          pushRow();
          i += 2;
          continue;
        } else {
          pushField();
          pushRow();
          i++;
          continue;
        }
      }
    }

    field += ch;
    i++;
  }

  // flush final
  pushField();
  // si terminó con row vacía (por ejemplo newline final), igual se agrega
  // luego filtramos vacío más abajo
  pushRow();

  return rows;
}

function matrixToRows(matrix: string[][]): { headers: string[]; rows: CsvRow[] } {
  if (!matrix.length) return { headers: [], rows: [] };

  const rawHeaders = matrix[0].map(normalizeHeader);
  // si hay headers repetidos, los desambiguamos
  const headerCounts = new Map<string, number>();
  const headers = rawHeaders.map((h) => {
    const key = h || "Col";
    const n = (headerCounts.get(key) ?? 0) + 1;
    headerCounts.set(key, n);
    return n === 1 ? key : `${key} (${n})`;
  });

  const rows: CsvRow[] = [];

  for (let r = 1; r < matrix.length; r++) {
    const fields = matrix[r];

    // skip filas completamente vacías
    const allEmpty = fields.every((x) => String(x ?? "").trim() === "");
    if (allEmpty) continue;

    const obj: CsvRow = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = fields[c] ?? "";
    }
    rows.push(obj);
  }

  return { headers, rows };
}

export async function readCsvFromPublic(path: string, opts?: { noCache?: boolean }): Promise<CsvReadResult> {
  const key = path;
  if (!opts?.noCache && cache.has(key)) return cache.get(key)!;

  const res = await fetch(path, { cache: "no-store" });

  if (!res.ok) {
    // 404 o similar: devolvemos error claro
    throw new Error(`No se pudo leer CSV: ${path} (${res.status})`);
  }

  let text = await res.text();
  text = stripBom(text);

  const delimiter = detectDelimiter(text);
  const matrix = parseCsvToMatrix(text, delimiter);

  const { headers, rows } = matrixToRows(matrix);

  const out: CsvReadResult = {
    headers,
    rows,
    delimiter,
    rawTextLength: text.length,
  };

  if (!opts?.noCache) cache.set(key, out);
  return out;
}

/* ======================
   Helpers numéricos
====================== */

export function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  const s0 = String(v).trim();
  if (!s0) return 0;

  // Si viene con % lo sacamos
  const s = s0.replace("%", "").trim();

  // Detectar formato europeo: 22.441,71 -> 22441.71
  // y formato US: 22,441.71 -> 22441.71
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  let cleaned = s;

  if (hasComma && hasDot) {
    // decidir cuál es decimal por última ocurrencia
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    const decimalIsComma = lastComma > lastDot;

    if (decimalIsComma) {
      cleaned = s.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = s.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    // "126,79" => 126.79
    cleaned = s.replace(",", ".");
  } else if (!hasComma && hasDot) {
    // "22441.71" ok
    cleaned = s;
  } else {
    cleaned = s;
  }

  cleaned = cleaned.replace(/[^\d.-]/g, "");

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

/**
 * Convierte a proporción 0..1 si viene en % (ej: 59,40 => 0.594)
 * Si ya es 0.59 lo deja igual.
 */
export function toPercent01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v > 1.5) return v / 100; // tolerancia
  if (v < 0) return 0;
  return v;
}

/* ======================
   Formatters
====================== */

export function formatMoneyUSD0(n: number): string {
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

export function formatPct01(n: number): string {
  const x = Number.isFinite(n) ? n : 0;
  return `${(x * 100).toFixed(1)}%`;
}

/* ======================
   Cache control (por si querés)
====================== */

export function clearCsvCache(path?: string) {
  if (!path) cache.clear();
  else cache.delete(path);
}
