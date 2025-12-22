// app/components/csvClient.ts
import Papa from "papaparse";

/* ======================
   Tipos
====================== */

export type CsvRow = Record<string, any>;

/* ======================
   Lectura CSV
====================== */

export async function readCsvFromPublic(path: string): Promise<CsvRow[]> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`No se pudo leer CSV: ${path}`);
  }

  const text = await res.text();

  const parsed = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
  });

  return parsed.data ?? [];
}

/* ======================
   Helpers numéricos
====================== */

export function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;

  if (typeof v === "string") {
    const cleaned = v
      .replace(/\./g, "")   // miles
      .replace(",", ".")    // decimales
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
  // Normaliza 80 -> 0.8
  return v > 1 ? v / 100 : v;
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

export function formatInt(n: number): string {
  return Math.round(n).toLocaleString("es-AR");
}
