"use client";

/**
 * CSV parser robusto:
 * - Autodetecta separador (coma o punto y coma)
 * - Soporta comillas y saltos de línea dentro de headers (tu archivo tiene headers con \n)
 * - Devuelve rows como array de objetos
 */

function detectDelimiter(sampleLine: string) {
  const commas = (sampleLine.match(/,/g) || []).length;
  const semis = (sampleLine.match(/;/g) || []).length;
  return semis > commas ? ";" : ",";
}

function normalizeHeader(h: string) {
  return h
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCsvText(text: string) {
  const clean = text.replace(/^\uFEFF/, ""); // BOM
  // buscamos una "línea" inicial razonable para detectar separador
  const firstNewline = clean.indexOf("\n");
  const firstLine = (firstNewline >= 0 ? clean.slice(0, firstNewline) : clean).trim();
  const delimiter = detectDelimiter(firstLine);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    const next = clean[i + 1];

    if (c === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (c === "\n" || c === "\r")) {
      // fin de línea (soporta CRLF)
      if (c === "\r" && next === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    if (!inQuotes && c === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    field += c;
  }

  // último campo
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return { headers: [], objects: [] as any[] };

  const headersRaw = rows[0].map((h) => normalizeHeader(String(h ?? "")));
  const objects = rows.slice(1).map((r) => {
    const obj: any = {};
    for (let j = 0; j < headersRaw.length; j++) {
      const key = headersRaw[j] || `col_${j}`;
      obj[key] = r[j];
    }
    return obj;
  });

  return { headers: headersRaw, objects };
}

export async function readCsvFromPublic(path: string) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path}`);
  const text = await res.text();
  const { headers, objects } = parseCsvText(text);
  return { headers, rows: objects };
}

