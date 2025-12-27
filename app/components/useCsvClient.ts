// app/components/useCsvClient.ts

import Papa from "papaparse";

/* =========================
   Tipos
========================= */

export type CsvRow = Record<string, any>;

export type CsvReadResult = {
  rows: CsvRow[];
};

/* =========================
   Lectura CSV
========================= */

export async function readCsvFromPublic(path: string): Promise<CsvReadResult> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`No se pudo leer CSV: ${path}`);
  }

  const text = await res.text();

  const parsed = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
  });

  return {
    rows: parsed.data ?? [],
  };
}

/* =========================
   Helpers numéricos
========================= */

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
    const parts = value.split("/");
    if (parts.length === 3) {
      const [d, m, y] = parts.map(Number);
      if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
        return new Date(y, m - 1, d);
      }
    }
  }

  return null;
}

export function getYearFromRow(row: CsvRow): number | null {
  const d =
    parseDMY(row["Fecha"]) ||
    parseDMY(row["Date"]) ||
    parseDMY(row["FECHA"]);

  return d ? d.getFullYear() : null;
}

export function getMonthFromRow(row: CsvRow): number | null {
  const d =
    parseDMY(row["Fecha"]) ||
    parseDMY(row["Date"]) ||
    parseDMY(row["FECHA"]);

  return d ? d.getMonth() + 1 : null;
}
