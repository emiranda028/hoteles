"use client";

export type CsvRow = Record<string, any>;

/**
 * Lee CSV desde /public (ej: /data/hf_diario.csv)
 * y devuelve SIEMPRE: { rows }
 */
export async function readCsvFromPublic(filePath: string): Promise<{ rows: CsvRow[] }> {
  const res = await fetch(filePath, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo leer CSV: ${filePath} (${res.status})`);

  const text = await res.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return { rows: [] };

  // separador: coma o punto y coma
  const headerLine = lines[0];
  const sep = headerLine.includes(";") && !headerLine.includes(",") ? ";" : ",";

  const headers = splitCsvLine(headerLine, sep).map((h) => h.trim());

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], sep);
    if (!cols.length) continue;

    const r: CsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      r[headers[j]] = cols[j] ?? "";
    }
    rows.push(r);
  }

  return { rows };
}

/** Split CSV respetando comillas */
function splitCsvLine(line: string, sep: string): string[] {
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

    if (!inQuotes && ch === sep) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out;
}
