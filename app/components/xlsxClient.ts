"use client";

export type XlsxRow = Record<string, any>;

export async function readXlsxFromPublic(path: string): Promise<{ sheet: string; rows: XlsxRow[] }> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo descargar XLSX: ${path} (${res.status})`);

  const buf = await res.arrayBuffer();

  // Import dinámico para no romper SSR/build
  // @ts-ignore
  const XLSX = await import("xlsx");

  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.SheetNames?.[0];
  if (!sheet) return { sheet: "N/A", rows: [] };

  const ws = wb.Sheets[sheet];
  const rows: XlsxRow[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

  return { sheet, rows };
}
