// app/components/useCsvClient.ts
"use client";

/**
 * CSV CLIENT sin dependencias (NO papaparse) — deploy-safe.
 * - Detecta delimitador ( , o ; )
 * - Soporta comillas dobles
 * - Limpia BOM (UTF-8)
 * - Devuelve array de objetos usando el header como keys
 */

export type CsvRow = Record<string, any>;

export async function readCsvFromPublic(path: string): Promise<CsvRow[]> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`No se pudo leer CSV: ${path} (${res.status})`);
  }
  const text = await res.text();
  return parseCsvToRows(text);
}

/* ======================
   Parser CSV robusto
====================== */

function parseCsvToRows(input: string): CsvRow[] {
  const raw = stripBom(input ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // eliminar líneas totalmente vacías al final
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  // detectar delimitador mirando la primera línea (header)
  const delim = detectDelimiter(lines[0]);

  const header = parseCsvLine(lines[0], delim).map((h) => normalizeKey(h));
  const out: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], delim);

    // si la fila viene completamente vacía, saltar
    if (cols.every((c) => (c ?? "").toString().trim() === "")) continue;

    const row: CsvRow = {};
    for (let c = 0; c < header.length; c++) {
      const k = header[c] || `col_${c}`;
      row[k] = (cols[c] ?? "").toString().trim();
    }
    out.push(row);
  }

  return out;
}

function detectDelimiter(headerLine: string): string {
  const comma = countCharOutsideQuotes(headerLine, ",");
  const semi = countCharOutsideQuotes(headerLine, ";");
  // si empatan, default a coma
  return semi > comma ? ";" : ",";
}

function countCharOutsideQuotes(s: string, ch: string): number {
  let count = 0;
  let inQ = false;
  for (let i = 0; i < s.length; i++) {
    const cur = s[i];
    if (cur === '"') {
      // doble comilla escapada ""
      if (inQ && s[i + 1] === '"') {
        i++;
        continue;
      }
      inQ = !inQ;
      continue;
    }
    if (!inQ && cur === ch) count++;
  }
  return count;
}

function parseCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // Escapado: "" => "
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQ = !inQ;
      continue;
    }

    if (!inQ && ch === delim) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out.map((x) => x.trim());
}

function stripBom(s: string): string {
  // BOM UTF-8: \uFEFF
  if (s.length > 0 && s.charCodeAt(0) === 0xfeff) return s.slice(1);
  return s;
}

function normalizeKey(k: string): string {
  return (k ?? "")
    .toString()
    .trim()
    // mantener acentos (no los borro), pero saco dobles espacios
    .replace(/\s+/g, " ")
    // si viene con comillas raras
    .replace(/^"+|"+$/g, "");
}

/* ======================
   Helpers numéricos
====================== */

export function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;

  const s = String(v).trim();
  if (!s) return 0;

  // manejar porcentajes
  const isPct = s.includes("%");

  // limpiar separadores típicos: 22.441,71  |  22,441.71  |  22441.71
  // estrategia:
  // - quitar espacios
  // - quitar % y $
  // - si tiene coma y punto: decidir decimal por el último separador
  let cleaned = s.replace(/\s/g, "").replace(/[%$]/g, "");

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  if (hasComma && hasDot) {
    // decimal = el último separador que aparezca
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    const decimalIsComma = lastComma > lastDot;

    if (decimalIsComma) {
      // miles con punto, decimal con coma
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      // miles con coma, decimal con punto
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    // asumir coma decimal y puntos miles inexistentes
    cleaned = cleaned.replace(",", ".");
  } else {
    // solo puntos o ninguno: ya sirve, pero saco miles por seguridad si son muchos
    // (si el user te pasa 22.441 y eso era miles, acá puede interpretarse decimal;
    //  lo resolvemos en hofModel usando columnas correctas; igual dejo esto simple)
  }

  const n = Number(cleaned);
  if (Number.isNaN(n)) return 0;

  if (isPct) return n / 100;
  return n;
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

export function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export function formatMoney(n: number): string {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function formatInt(n: number): string {
  return Math.round(n).toLocaleString("es-AR");
}

export function formatPct01(n01: number): string {
  return (n01 * 100).toFixed(1) + "%";
}
