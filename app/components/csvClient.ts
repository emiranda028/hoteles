"use client";

/**
 * Parser CSV robusto (soporta comillas, comas, saltos de línea dentro de campos)
 * porque tu hf_diario.csv viene exportado tipo Excel con headers multi-línea.
 */

export type CsvRow = Record<string, string>;

function normalizeHeader(h: string) {
  return String(h ?? "")
    .replace(/\uFEFF/g, "")
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      const next = text[i + 1];
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (ch === "\n")) {
      row.push(cell);
      cell = "";
      // evitar filas vacías fantasma
      const isAllEmpty = row.every((c) => String(c ?? "").trim() === "");
      if (!isAllEmpty) rows.push(row);
      row = [];
      continue;
    }

    cell += ch;
  }

  // último
  if (cell.length || row.length) {
    row.push(cell);
    const isAllEmpty = row.every((c) => String(c ?? "").trim() === "");
    if (!isAllEmpty) rows.push(row);
  }

  return rows;
}

export async function readCsvFromPublic(path?: string): Promise<CsvRow[]> {
  if (!path) throw new Error("No se pudo cargar: filePath está vacío/undefined");

  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (status ${res.status})`);

  const text = await res.text();
  const matrix = parseCsv(text);

  if (!matrix.length) return [];

  // Headers: algunos vienen “partidos”, pero el parser ya los unió.
  const rawHeaders = matrix[0].map((h) => normalizeHeader(h));
  const headers = rawHeaders.map((h, idx) => (h ? h : `__col_${idx}`));

  const out: CsvRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const rowArr = matrix[r];
    const obj: CsvRow = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = String(rowArr[c] ?? "").trim();
    }
    out.push(obj);
  }

  return out;
}
