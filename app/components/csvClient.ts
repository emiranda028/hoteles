import Papa from "papaparse";

/* ======================
   Tipos base
====================== */

export type CsvRow = Record<string, any>;

/* ======================
   CSV reader
====================== */

export async function readCsvFromPublic(path: string): Promise<CsvRow[]> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo leer ${path}`);
  const text = await res.text();

  const parsed = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
  });

  return parsed.data;
}

/* ======================
   Fechas
====================== */

export function parseFechaSmart(v: any): Date | null {
  if (!v) return null;

  if (v instanceof Date) return v;

  if (typeof v === "string") {
    // formatos tipo 1/6/2022 o 01-06-22
    const parts = v.includes("/")
      ? v.split("/")
      : v.includes("-")
      ? v.split("-")
      : [];

    if (parts.length === 3) {
      const d = Number(parts[0]);
      const m = Number(parts[1]) - 1;
      const y = Number(parts[2].length === 2 ? "20" + parts[2] : parts[2]);
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
