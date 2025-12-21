"use client";

/**
 * csvClient.ts
 * - readCsvFromPublic(filePath): fetch + parse CSV robusto (comillas, separador , o ;)
 * - devuelve rows como objetos por header
 */

export type CsvReadResult = {
  rows: Record<string, string>[];
  headers: string[];
};

async function fetchText(path: string) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (status ${res.status})`);
  return await res.text();
}

function detectDelimiter(firstLine: string) {
  const comma = (firstLine.match(/,/g) || []).length;
  const semicolon = (firstLine.match(/;/g) || []).length;
  return semicolon > comma ? ";" : ",";
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // doble comilla escapada
      if (inQuotes && line[i + 1] === '"') {
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
}

function normalizeHeader(h: string) {
  return String(h || "")
    .replace(/^\uFEFF/, "")
    .trim();
}

export async function readCsvFromPublic(path: string): Promise<CsvReadResult> {
  const text = await fetchText(path);
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { rows: [], headers: [] };

  const delim = detectDelimiter(lines[0]);
  const headersRaw = splitCsvLine(lines[0], delim).map(normalizeHeader);
  const headers = headersRaw;

  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], delim);
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = cols[c] ?? "";
    }
    rows.push(obj);
  }

  return { rows, headers };
}
