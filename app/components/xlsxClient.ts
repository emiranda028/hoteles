// app/components/xlsxClient.ts
import * as XLSX from "xlsx";

export type XlsxRow = Record<string, any>;

export async function readXlsxFromPublic(filePath: string, sheetName?: string): Promise<{ sheet: string; rows: XlsxRow[] }> {
  const res = await fetch(filePath, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo leer XLSX: ${filePath} (${res.status})`);

  const buf = await res.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  const sheet = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0];
  const ws = wb.Sheets[sheet];

  const json: XlsxRow[] = XLSX.utils.sheet_to_json(ws, {
    defval: "",
    raw: false,
  });

  return { sheet, rows: json };
}

export function normKey(s: string): string {
  return (s || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function pickKey(obj: Record<string, any>, candidates: string[]): string | null {
  const keys = Object.keys(obj || {});
  const nmap = new Map<string, string>();
  for (const k of keys) nmap.set(normKey(k), k);

  for (const cand of candidates) {
    const hit = nmap.get(normKey(cand));
    if (hit) return hit;
  }
  return null;
}
