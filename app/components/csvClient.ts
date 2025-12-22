"use client";

/**
 * Lector CSV robusto (sin libs extra)
 * - Soporta separador , o ;
 * - Soporta comillas
 * - Devuelve { rows, headers }
 * - Evita que tengas que hacer then(({rows})...) y rompa tipos.
 */

export type CsvRow = Record<string, string>;

export type CsvReadResult = {
  rows: CsvRow[];
  headers: string[];
  text: string;
};

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // doble comilla escape
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
  return out.map((s) => s.trim());
}

function detectDelimiter(lines: string[]): string {
  // Mira primeras líneas con contenido
  const sample = lines.slice(0, 10).filter((l) => l.trim().length > 0);
  if (sample.length === 0) return ",";

  let commaScore = 0;
  let semiScore = 0;

  for (const l of sample) {
    commaScore += (l.match(/,/g) || []).length;
    semiScore += (l.match(/;/g) || []).length;
  }

  return semiScore > commaScore ? ";" : ",";
}

function normalizeHeader(h: string): string {
  // Conservamos header original, pero recortado (sin cambiarlo a lower)
  return (h ?? "").replace(/\uFEFF/g, "").trim();
}

export async function readCsvFromPublic(path: string): Promise<CsvReadResult> {
  if (!path) throw new Error("No se pudo cargar CSV: filePath vacío");

  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (status ${res.status})`);

  const text = await res.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], headers: [], text };

  const delimiter = detectDelimiter(lines);

  const rawHeaders = splitCsvLine(lines[0], delimiter).map(normalizeHeader);
  const headers = rawHeaders.filter((h) => h.length > 0);

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], delimiter);
    if (cols.every((c) => c.trim() === "")) continue;

    const row: CsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (cols[j] ?? "").trim();
    }
    rows.push(row);
  }

  return { rows, headers, text };
}
