"use client";

import * as XLSX from "xlsx";

export type XlsxRow = Record<string, any>;

/**
 * Lee XLSX desde /public (ej: /data/jcr_membership.xlsx)
 * Devuelve SIEMPRE: { sheetName, rows } y deja `sheet` como alias.
 */
export async function readXlsxFromPublic(
  filePath: string,
  preferredSheetName?: string
): Promise<{ sheetName: string; sheet: string; rows: XlsxRow[] }> {
  const res = await fetch(filePath, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo leer XLSX: ${filePath} (${res.status})`);

  const ab = await res.arrayBuffer();
  const wb = XLSX.read(ab, { type: "array" });

  const sheetName =
    (preferredSheetName && wb.SheetNames.includes(preferredSheetName) && preferredSheetName) ||
    wb.SheetNames[0] ||
    "Sheet1";

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<XlsxRow>(ws, { defval: "" });

  return { sheetName, sheet: sheetName, rows };
}
