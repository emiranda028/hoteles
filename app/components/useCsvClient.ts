// app/components/useCsvClient.ts

/* =========================
   Tipos
========================= */

export type CsvRow = Record<string, any>;

export type CsvReadResult = {
  rows: CsvRow[];
};

/* =========================
   CSV Parser (sin librerías)
   - Soporta comillas
   - Soporta comas dentro de comillas
   - Limpia BOM (UTF-8)
========================= */

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // Doble comilla escapada dentro de un string: ""
      const next = line[i + 1];
      if (inQuotes && next === '"') {
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
  return out.map((v) => v.trim());
}

function parseCsv(textRaw: string): CsvRow[] {
  const text = stripBom(textRaw || "");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.replace(/^"|"$/g, "").trim());

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]).map((v) => v.replace(/^"|"$/g, "").trim());

    // Si viene alguna línea rara con menos columnas, la completamos
    const row: CsvRow = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = values[c] ?? "";
    }

    // Evitar filas completamente vacías (por si hay líneas basura)
    const hasAny = Object.values(row).some((v) => String(v ?? "").trim() !== "");
    if (hasAny) rows.push(row);
  }

  return rows;
}

/* =========================
   Lectura CSV
========================= */

export async function readCsvFromPublic(path: string): Promise<CsvReadResult> {
  const res = await fetch(path, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`No se pudo leer CSV: ${path} (${res.status})`);
  }

  const text = await res.text();
  const rows = parseCsv(text);

  return { rows };
}

/* =========================
   Helpers numéricos
========================= */

export function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;

  if (typeof v === "string") {
    const cleaned = v
      .replace(/\./g, "") // miles 22.441,71 -> 22441,71
      .replace(",", ".")  // decimal
      .replace("%", "")
      .trim();

    const n = Number(cleaned);
    return isNaN(n) ? 0 : n;
  }

  return 0;
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

export function toPercent01(v: number): number {
  // Si viene 59,40 -> 59.4 => lo pasamos a 0.594
  if (v > 1) return v / 100;
  return v;
}

/* =========================
   Formatters
========================= */

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

export function formatInt(n: number): string {
  return n.toLocaleString("es-AR");
}

/* =========================
   Fechas H&F
========================= */

export function parseDMY(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;

  if (typeof value === "string") {
    // soporta "1/6/2022"
    const parts = value.split("/");
    if (parts.length === 3) {
      const d = Number(parts[0]);
      const m = Number(parts[1]);
      const y = Number(parts[2]);
      if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
        return new Date(y, m - 1, d);
      }
    }
  }

  return null;
}

export function getYearFromRow(row: CsvRow): number | null {
  const d = parseDMY(row["Fecha"]) || parseDMY(row["Date"]) || parseDMY(row["FECHA"]);
  return d ? d.getFullYear() : null;
}

export function getMonthFromRow(row: CsvRow): number | null {
  const d = parseDMY(row["Fecha"]) || parseDMY(row["Date"]) || parseDMY(row["FECHA"]);
  return d ? d.getMonth() + 1 : null;
}
