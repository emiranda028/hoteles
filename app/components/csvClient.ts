// app/components/csvClient.ts
import Papa from "papaparse";

export type CsvRow = Record<string, any>;

export async function readCsvFromPublic(path: string): Promise<CsvRow[]> {
  const res = await fetch(path);
  const text = await res.text();

  const parsed = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
  });

  return parsed.data;
}

/* ======================
   Helpers numéricos
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
