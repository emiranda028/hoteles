// app/components/csvClient.ts
export type CsvRow = Record<string, any>;

/* ======================
   CSV reader (sin libs)
====================== */

function parseCsvLine(line: string): string[] {
  // CSV parser simple pero soporta comillas y comas dentro de comillas
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // dobles comillas dentro de string quoted: ""
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

function parseCsv(text: string): CsvRow[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.replace(/^\uFEFF/, "").trim());

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    // ignora líneas vacías o completamente incompletas
    if (cols.length === 1 && cols[0] === "") continue;

    const row: CsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cols[j] ?? "";
    }
    rows.push(row);
  }

  return rows;
}

export async function readCsvFromPublic(path: string): Promise<CsvRow[]> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo leer ${path} (HTTP ${res.status})`);
  const text = await res.text();
  return parseCsv(text);
}

/* ======================
   Fechas
====================== */

export function parseFechaSmart(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;

  if (typeof v === "string") {
    const s = v.trim();

    // formato 1/6/2022
    if (s.includes("/")) {
      const [dd, mm, yy] = s.split("/");
      const d = Number(dd);
      const m = Number(mm) - 1;
      const y = Number(yy?.length === 2 ? "20" + yy : yy);
      const dt = new Date(y, m, d);
      return isNaN(dt.getTime()) ? null : dt;
    }

    // formato 01-06-22 (del HF)
    if (s.includes("-")) {
      const [dd, mm, yy] = s.split("-");
      const d = Number(dd);
      const m = Number(mm) - 1;
      const y = Number(yy?.length === 2 ? "20" + yy : yy);
      const dt = new Date(y, m, d);
      return isNaN(dt.getTime()) ? null : dt;
    }
  }

  return null;
}

/* ======================
   Números
====================== */

export function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;

  if (typeof v === "string") {
    const cleaned = v
      .replace(/\./g, "")
      .replace(",", ".")
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
  if (v > 1) return v / 100;
  return v;
}

/* ======================
   Formatters
====================== */

export function formatMoney(n: number): string {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function formatPct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

export function formatPct01(n: number): string {
  return formatPct(toPercent01(n));
}

export function formatInt(n: number): string {
  return Math.round(n).toLocaleString("es-AR");
}
