// app/components/csvClient.ts
// Cliente liviano para leer CSV desde /public (ej: /data/hf_diario.csv)
//
// ✅ readCsvFromPublic() devuelve { rows, columns } para compatibilidad con:
//    readCsvFromPublic(...).then(({ rows }) => ...)
//
// ✅ Exporta toNumberSmart (lo pedían HighlightsCarousel/HofSummary/etc)
//
// ✅ Parser robusto (maneja delimitadores , ; \t y comillas)
// ✅ Normaliza headers y valores básicos

export type CsvRow = Record<string, string>;

export type ReadCsvResult = {
  rows: CsvRow[];
  columns: string[];
};

function stripBom(s: string) {
  return s.replace(/^\uFEFF/, "");
}

function detectDelimiter(headerLine: string): "," | ";" | "\t" {
  const commas = (headerLine.match(/,/g) || []).length;
  const semis = (headerLine.match(/;/g) || []).length;
  const tabs = (headerLine.match(/\t/g) || []).length;

  if (tabs >= semis && tabs >= commas) return "\t";
  if (semis >= commas) return ";";
  return ",";
}

// Parser CSV por línea, soporta comillas dobles y delimitador variable
function parseLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // "" dentro de quotes -> "
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
  return out.map((x) => x.trim());
}

function normalizeHeader(h: string) {
  // Quita comillas, saltos, dobles espacios, etc.
  return h
    .replace(/^"+|"+$/g, "")
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCell(v: string) {
  return (v ?? "")
    .replace(/^"+|"+$/g, "")
    .replace(/\r/g, "")
    .trim();
}

// Convierte strings “22.441,71”, “22,441.71”, “59,40%”, “-”, “” a número
// Nota: si viene con %, devuelve 59.4 (NO 0.594)
export function toNumberSmart(raw: any): number {
  if (raw === null || raw === undefined) return NaN;
  if (typeof raw === "number") return raw;

  let s = String(raw).trim();
  if (!s) return NaN;

  // valores no numéricos típicos
  if (s === "-" || s.toLowerCase() === "na" || s.toLowerCase() === "n/a") return NaN;

  // porcentaje
  let isPct = false;
  if (s.includes("%")) {
    isPct = true;
    s = s.replace(/%/g, "").trim();
  }

  // borrar separadores "raros"
  // ej: "22.441,71" o "22,441.71" o "22 441,71"
  s = s.replace(/\s/g, "");

  // Detecta último separador decimal (.,)
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  let decimalSep: "," | "." | null = null;
  if (lastComma >= 0 || lastDot >= 0) {
    decimalSep = lastComma > lastDot ? "," : ".";
  }

  if (decimalSep) {
    // El otro separador es miles -> lo removemos
    const thousandSep = decimalSep === "," ? "." : ",";
    s = s.split(thousandSep).join("");

    // decimal -> punto para parseFloat
    if (decimalSep === ",") s = s.replace(/,/g, ".");
  } else {
    // sin sep decimal: limpiamos miles posibles
    s = s.replace(/[.,]/g, "");
  }

  // signos raros
  s = s.replace(/[^\d.+-]/g, "");

  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) return NaN;

  // si era % lo dejamos como “porcentaje” (ej 59.4)
  return isPct ? n : n;
}

export function toIntSmart(raw: any): number {
  const n = toNumberSmart(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

export function formatInt(n: number) {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("es-AR");
}

export function formatMoney(n: number) {
  if (!Number.isFinite(n)) return "$0";
  return n.toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function formatPct(n: number) {
  if (!Number.isFinite(n)) return "0%";
  // n se espera en 0..100 (porcentaje)
  return `${n.toFixed(1).replace(".", ",")}%`;
}

// Lee CSV desde /public.
// filePath puede venir como "data/hf_diario.csv" o "/data/hf_diario.csv"
export async function readCsvFromPublic(filePath: string): Promise<ReadCsvResult> {
  const p = filePath.startsWith("/") ? filePath : `/${filePath}`;

  const res = await fetch(p, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`No se pudo leer CSV (${res.status}). Path: ${p}`);
  }

  const txtRaw = await res.text();
  const txt = stripBom(txtRaw);

  // split líneas (soporta \r\n)
  const lines = txt
    .split(/\n/)
    .map((l) => l.replace(/\r/g, ""))
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], columns: [] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseLine(lines[0], delimiter).map(normalizeHeader);

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = parseLine(lines[i], delimiter);
    if (parts.length === 1 && parts[0] === "") continue;

    const row: CsvRow = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c] ?? `col_${c}`;
      row[key] = normalizeCell(parts[c] ?? "");
    }
    rows.push(row);
  }

  return { rows, columns: headers };
}
