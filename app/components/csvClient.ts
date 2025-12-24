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

export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export const toNumberSmart = (v: any): number => {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const c = v.replace(/\./g, "").replace(",", ".").replace("%", "");
    const n = Number(c);
    return isNaN(n) ? 0 : n;
  }
  return 0;
};

export const formatMoneyUSD = (n: number) =>
  n.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

export const formatPct = (n: number) => `${(n * 100).toFixed(1)}%`;
