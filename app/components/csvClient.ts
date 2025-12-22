// app/components/csvClient.ts
export type CsvRow = Record<string, any>;

function splitCsvLine(line: string): string[] {
  // CSV simple con comillas dobles y comas
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

    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out.map((s) => s.trim());
}

function parseNumberSmart(v: string): number | string {
  const s = (v ?? "").toString().trim();
  if (!s) return "";

  // porcentajes tipo 59,40% o 59.40%
  const isPct = s.endsWith("%");
  const raw = isPct ? s.slice(0, -1) : s;

  // si tiene separadores miles/decimales en formato LATAM
  // ejemplo: 22.441,71 => 22441.71
  let norm = raw;

  // si tiene coma decimal
  const hasComma = norm.includes(",");
  const hasDot = norm.includes(".");

  if (hasComma && hasDot) {
    // asumo dot miles + comma decimal
    norm = norm.replace(/\./g, "").replace(",", ".");
  } else if (hasComma && !hasDot) {
    // coma decimal
    norm = norm.replace(",", ".");
  }

  // si es número válido
  if (/^-?\d+(\.\d+)?$/.test(norm)) {
    const n = Number(norm);
    if (Number.isFinite(n)) return isPct ? n / 100 : n;
  }

  return s;
}

export async function readCsvFromPublic(filePath: string): Promise<{
  rows: CsvRow[];
  columns: string[];
}> {
  const res = await fetch(filePath, { cache: "no-store" });
  if (!res.ok) throw new Error(`No pude leer CSV: ${filePath} (${res.status})`);

  const text = await res.text();
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { rows: [], columns: [] };

  const header = splitCsvLine(lines[0]);
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i]);
    const obj: CsvRow = {};
    for (let c = 0; c < header.length; c++) {
      const k = header[c] ?? `col_${c}`;
      const v = parts[c] ?? "";
      obj[k] = parseNumberSmart(v);
    }
    rows.push(obj);
  }

  return { rows, columns: header };
}
