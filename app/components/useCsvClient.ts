// app/components/useCsvClient.ts
export type CsvRow = Record<string, any>;

export type CsvReadResult = {
  headers: string[];
  rows: CsvRow[];
};

function stripBom(s: string) {
  return s.replace(/^\uFEFF/, "");
}

// Parser CSV simple (robusto para comillas y separadores , o ;)
export function parseCsv(text: string): CsvReadResult {
  const raw = stripBom(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // detect separator
  const firstLine = raw.split("\n").find((l) => l.trim().length > 0) ?? "";
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const semiCount = (firstLine.match(/;/g) ?? []).length;
  const sep = semiCount > commaCount ? ";" : ",";

  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = "";
  let inQuotes = false;

  const pushCell = () => {
    cur.push(cell);
    cell = "";
  };
  const pushRow = () => {
    // ignora fila totalmente vacía
    if (cur.some((c) => String(c ?? "").trim() !== "")) rows.push(cur);
    cur = [];
  };

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (ch === '"') {
      const next = raw[i + 1];
      if (inQuotes && next === '"') {
        // escape ""
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === sep) {
      pushCell();
      continue;
    }

    if (!inQuotes && ch === "\n") {
      pushCell();
      pushRow();
      continue;
    }

    cell += ch;
  }

  // flush
  pushCell();
  pushRow();

  const headers = (rows.shift() ?? []).map((h) => String(h ?? "").trim());
  const dataRows: CsvRow[] = rows.map((r) => {
    const obj: CsvRow = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] ?? "";
    });
    return obj;
  });

  return { headers, rows: dataRows };
}

export async function readCsvFromPublic(path: string): Promise<CsvReadResult> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`No se pudo leer CSV: ${path} (${res.status})`);
  }
  const text = await res.text();
  return parseCsv(text);
}

/* ======================
   Helpers numéricos
====================== */
export function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;

  const s = String(v).trim();
  if (!s) return 0;

  // elimina separador miles "." y convierte "," a "."
  const cleaned = s
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace("%", "");

  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

export function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

export function formatMoney(n: number): string {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function formatInt(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

export function formatPct01(n01: number): string {
  return (n01 * 100).toFixed(1) + "%";
}

/* ======================
   Fecha robusta
====================== */

function excelSerialToDate(n: number): Date {
  const ms = Math.round((n - 25569) * 86400 * 1000);
  return new Date(ms);
}

export function parseFechaSmart(v: any): Date | null {
  if (v == null) return null;

  if (v instanceof Date && !isNaN(v.getTime())) return v;

  if (typeof v === "number" && isFinite(v) && v > 20000 && v < 80000) {
    const d = excelSerialToDate(v);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(v).trim();
  if (!s) return null;

  const token = s.split(" ")[0];

  // dd/mm/yyyy o dd-mm-yyyy o dd-mm-yy
  const m = token.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yy = Number(m[3]);
    if (yy < 100) yy = 2000 + yy;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function getRowDate(row: CsvRow): Date | null {
  // preferir "Fecha"
  return parseFechaSmart(row["Fecha"] ?? row["Date"]);
}

export function getRowYear(row: CsvRow): number | null {
  const d = getRowDate(row);
  return d ? d.getFullYear() : null;
}

export function getMonthKey(row: CsvRow): string | null {
  const d = getRowDate(row);
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function weekdayNameEs(d: Date): string {
  const names = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  return names[d.getDay()];
}
